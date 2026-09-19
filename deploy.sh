#!/usr/bin/env bash
# Build + deploy the Sentinel SAM stack, then build the React dashboard and
# upload it to the S3 website bucket.
#
# Prereqs: aws CLI (configured), sam CLI, Node 20+, npm.
# Usage:   ./deploy.sh <github-org> [stage]
#          SENTINEL_GITHUB_TOKEN=<PAT> ./deploy.sh <org> dev   # stores the PAT in SSM (SecureString)
set -euo pipefail

ORG="${1:?usage: deploy.sh <github-org-or-user> [stage]}"
STAGE="${2:-dev}"
STACK="sentinel-$STAGE"

cd "$(dirname "$0")"

echo "▶ sam build…"
# SAM's esbuild builder needs the esbuild binary discoverable; it's a devDependency here.
export PATH="$PWD/node_modules/.bin:$PATH"
sam build --parallel

echo "▶ GitHub token → SSM /sentinel/github-token (SecureString)…"
if [[ -n "${SENTINEL_GITHUB_TOKEN:-}" ]]; then
  aws ssm put-parameter --name /sentinel/github-token --type SecureString \
    --value "$SENTINEL_GITHUB_TOKEN" --overwrite >/dev/null
  echo "   stored (--overwrite)."
else
  echo "ℹ  SENTINEL_GITHUB_TOKEN not set — skipping SSM write. Set it with:"
  echo "   aws ssm put-parameter --name /sentinel/github-token --type SecureString --value <PAT> --overwrite"
fi

echo "▶ sam deploy (stack=$STACK, org=$ORG)…"
sam deploy --stack-name "$STACK" --capabilities CAPABILITY_IAM --no-confirm-changeset \
  --parameter-overrides "GitHubOrg=$ORG" "Stage=$STAGE"

API_URL="$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)"
DASHBOARD_URL="$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' --output text)"
BUCKET="$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardBucket`].OutputValue' --output text)"

echo "▶ Building dashboard against $API_URL…"
VITE_API_URL="$API_URL" npm run dashboard:build

echo "▶ Uploading dashboard to s3://$BUCKET…"
aws s3 sync dist "s3://$BUCKET" --delete

echo
echo "✅ Sentinel deployed."
echo "   API:        $API_URL"
echo "   GET /state: $API_URL/state"
echo "   Dashboard:  $DASHBOARD_URL"
echo
echo "   Next: ./demo.sh $STAGE"
