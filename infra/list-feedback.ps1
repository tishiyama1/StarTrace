#!/usr/bin/env pwsh
#
# Print the feedback stored in DynamoDB (newest first) on Windows PowerShell.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File infra/list-feedback.ps1

[CmdletBinding()]
param(
  [string]$StackName = $(if ($env:STACK_NAME) { $env:STACK_NAME } else { 'startrace' }),
  [string]$Region    = $(if ($env:AWS_REGION) { $env:AWS_REGION } else { 'ap-northeast-1' })
)

$ErrorActionPreference = 'Stop'

$table = aws cloudformation describe-stacks `
  --stack-name $StackName --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='DataTableName'].OutputValue" `
  --output text

$json = aws dynamodb query `
  --table-name $table --region $Region `
  --key-condition-expression "pk = :p" `
  --expression-attribute-values '{\":p\":{\"S\":\"FEEDBACK\"}}' `
  --scan-index-forward false `
  --output json | ConvertFrom-Json

foreach ($item in $json.Items) {
  $done = if ($item.issueCreated.BOOL) { 'issue:done' } else { 'issue:pending' }
  Write-Host ("[{0}] ({1}) {2}  {{{3}}}" -f $item.createdAt.S, $item.category.S, $item.message.S, $done)
}
