#!/bin/bash
set -e

ORG=$1
if [ -z "$ORG" ]; then
  echo "Usage: ./deploy-local.sh <github-org>"
  exit 1
fi

echo "🚀 Installing LocalStack CLI tools..."
python.exe -m pip install aws-sam-cli-local awscli-local

echo "🚀 Setting up GitHub token in LocalStack SSM..."
if [ -z "$SENTINEL_GITHUB_TOKEN" ]; then
  echo "⚠️  SENTINEL_GITHUB_TOKEN not set. Using a dummy token for local dev."
  TOKEN="dummy_token_local"
else
  TOKEN="$SENTINEL_GITHUB_TOKEN"
fi

# We use awslocal to interact with the local stack
awslocal ssm put-parameter --name "/sentinel/github-token" --value "$TOKEN" --type "SecureString" --overwrite

echo "🚀 Building SAM application..."
export PATH="$PWD/node_modules/.bin:$PATH"
samlocal build --parallel

echo "🚀 Deploying to LocalStack..."
samlocal deploy --stack-name sentinel-local --resolve-s3 --parameter-overrides GitHubOrg=$ORG Stage=local

echo "✅ Deployed locally! (Make sure docker-compose is running)"
