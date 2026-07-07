#!/usr/bin/env bash
#
# Print the feedback stored in DynamoDB (newest first).
#
# Usage:
#   ./infra/list-feedback.sh
#   STACK_NAME=startrace AWS_REGION=ap-northeast-1 ./infra/list-feedback.sh

set -euo pipefail

STACK_NAME="${STACK_NAME:-startrace}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"

TABLE="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='DataTableName'].OutputValue" \
  --output text)"

aws dynamodb query \
  --table-name "$TABLE" --region "$AWS_REGION" \
  --key-condition-expression "pk = :p" \
  --expression-attribute-values '{":p":{"S":"FEEDBACK"}}' \
  --scan-index-forward false \
  --output json \
| jq -r '.Items[] | "[\(.createdAt.S)] (\(.category.S)) \(.message.S)  {issue:\(.issueCreated.BOOL)}"'
