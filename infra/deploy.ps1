#!/usr/bin/env pwsh
#
# Deploy the built StarTrace site to S3 + CloudFront (Windows PowerShell).
# This is the PowerShell equivalent of deploy.sh.
#
# Usage (from the repo root):
#   powershell -ExecutionPolicy Bypass -File infra/deploy.ps1
#   powershell -ExecutionPolicy Bypass -File infra/deploy.ps1 -SkipBuild
#
# Prerequisites: AWS CLI v2 configured (aws configure), Node.js + npm.

[CmdletBinding()]
param(
  [string]$StackName = $(if ($env:STACK_NAME) { $env:STACK_NAME } else { 'startrace' }),
  [string]$Region    = $(if ($env:AWS_REGION) { $env:AWS_REGION } else { 'ap-northeast-1' }),
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

# Repo root is the parent of this script's folder (<root>/infra).
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-StackOutput([string]$Key) {
  aws cloudformation describe-stacks `
    --stack-name $StackName `
    --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='$Key'].OutputValue" `
    --output text
}

Write-Host "==> Reading stack outputs from '$StackName' ($Region)"
$bucket   = Get-StackOutput 'BucketName'
$distId   = Get-StackOutput 'DistributionId'
$siteUrl  = Get-StackOutput 'SiteURL'
$apiFn    = Get-StackOutput 'ApiFunctionName'

if (-not $bucket -or $bucket -eq 'None') {
  Write-Error "Could not read BucketName from stack '$StackName'. Deploy the stack first (see infra/README.md)."
  exit 1
}

Write-Host "    bucket       = $bucket"
Write-Host "    distribution = $distId"
Write-Host "    api function = $apiFn"

if (-not $SkipBuild) {
  Write-Host "==> Building the site"
  npm ci
  npm run build
}

if (-not (Test-Path 'dist/index.html')) {
  Write-Error "dist/index.html not found. Did the build succeed?"
  exit 1
}

# --- Backend Lambda: package backend/ and push the code -------------------
if ($apiFn -and $apiFn -ne 'None') {
  Write-Host "==> Packaging and updating the backend Lambda"
  $zipPath = Join-Path ([System.IO.Path]::GetTempPath()) 'startrace-function.zip'
  if (Test-Path $zipPath) { Remove-Item $zipPath }
  Compress-Archive -Path 'backend/index.mjs' -DestinationPath $zipPath -Force
  aws lambda update-function-code --function-name $apiFn --zip-file "fileb://$zipPath" --region $Region --no-cli-pager | Out-Null
  Remove-Item $zipPath -ErrorAction SilentlyContinue
}

Write-Host "==> Uploading hashed assets with a long cache lifetime"
aws s3 sync dist "s3://$bucket" --region $Region --delete --cache-control "public,max-age=31536000,immutable" --exclude "*.html"

Write-Host "==> Uploading HTML with no-cache so new deploys show up immediately"
aws s3 sync dist "s3://$bucket" --region $Region --cache-control "no-cache" --content-type "text/html; charset=utf-8" --exclude "*" --include "*.html"

Write-Host "==> Invalidating CloudFront cache"
$invId = aws cloudfront create-invalidation --distribution-id $distId --paths "/*" --query 'Invalidation.Id' --output text
Write-Host "    invalidation = $invId"

Write-Host ""
Write-Host "Done. Your site: $siteUrl"
Write-Host "(a new CloudFront distribution can take a few minutes to finish deploying)"
