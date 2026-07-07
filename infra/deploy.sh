#!/usr/bin/env bash
#
# Deploy the built StarTrace site to S3 + CloudFront.
#
# It reads the S3 bucket name and CloudFront distribution ID from the
# CloudFormation stack outputs, so you only need the stack name and region.
#
# Usage:
#   ./infra/deploy.sh                 # build + deploy using defaults
#   SKIP_BUILD=1 ./infra/deploy.sh    # deploy the existing dist/ as-is
#   STACK_NAME=my-stack AWS_REGION=ap-northeast-1 ./infra/deploy.sh
#
# Prerequisites: awscli v2 configured with credentials, Node.js + npm.

set -euo pipefail

STACK_NAME="${STACK_NAME:-startrace}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"

# Resolve repo root (this script lives in <root>/infra).
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Reading stack outputs from '$STACK_NAME' (${AWS_REGION})"
read_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

BUCKET="$(read_output BucketName)"
DISTRIBUTION_ID="$(read_output DistributionId)"
SITE_URL="$(read_output SiteURL)"
API_FUNCTION="$(read_output ApiFunctionName)"

if [[ -z "$BUCKET" || "$BUCKET" == "None" ]]; then
  echo "!! Could not read BucketName from stack '$STACK_NAME'." >&2
  echo "   Deploy the stack first (see infra/README.md)." >&2
  exit 1
fi

echo "    bucket          = $BUCKET"
echo "    distribution    = $DISTRIBUTION_ID"
echo "    api function    = $API_FUNCTION"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> Building the site"
  npm ci
  npm run build
fi

# --- Backend Lambda: package backend/ and push the code -------------------
if [[ -n "$API_FUNCTION" && "$API_FUNCTION" != "None" ]]; then
  echo "==> Packaging and updating the backend Lambda"
  ZIP_PATH="$(mktemp -d)/function.zip"
  ( cd backend && zip -q -r "$ZIP_PATH" index.mjs )
  aws lambda update-function-code \
    --function-name "$API_FUNCTION" \
    --zip-file "fileb://${ZIP_PATH}" \
    --region "$AWS_REGION" \
    --no-cli-pager >/dev/null
  rm -f "$ZIP_PATH"
fi

if [[ ! -f dist/index.html ]]; then
  echo "!! dist/index.html not found. Did the build succeed?" >&2
  exit 1
fi

echo "==> Uploading hashed assets with a long cache lifetime"
# Everything except HTML is content-hashed by Vite, so it can be cached forever.
aws s3 sync dist "s3://${BUCKET}" \
  --region "$AWS_REGION" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "*.html"

echo "==> Uploading HTML with no-cache so new deploys are picked up immediately"
aws s3 sync dist "s3://${BUCKET}" \
  --region "$AWS_REGION" \
  --cache-control "no-cache" \
  --content-type "text/html; charset=utf-8" \
  --exclude "*" \
  --include "*.html"

echo "==> Invalidating CloudFront cache"
INVALIDATION_ID="$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)"
echo "    invalidation    = $INVALIDATION_ID"

echo ""
echo "✅ Done. Your site: ${SITE_URL}"
echo "   (a new CloudFront distribution can take a few minutes to finish deploying)"
