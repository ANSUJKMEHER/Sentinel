#!/bin/bash
set -e

# Find the API ID deployed in LocalStack
API_ID=$(awslocal apigatewayv2 get-apis --query "Items[?Name=='sentinel-local'].ApiId" --output text)

if [ -z "$API_ID" ] || [ "$API_ID" == "None" ]; then
  echo "❌ Could not find API Gateway ID for sentinel-local."
  exit 1
fi

API_URL="http://${API_ID}.execute-api.localhost.localstack.cloud:4566/local"

echo "🚀 Triggering simulation against LocalStack API Gateway ($API_URL)..."
curl -X POST "${API_URL}/advisories/simulate" \
  -H "Content-Type: application/json" \
  -d '{
    "ghsa_id": "GHSA-jf85-cpcp-j695",
    "package": "lodash",
    "severity": "high",
    "summary": "Command injection in lodash",
    "vulnerable_range": ">= 4.0.0, < 4.17.21",
    "first_patched_version": "4.17.21"
  }'

echo -e "\n✅ Simulation triggered!"
echo "To see backend logs, run: samlocal logs -n AdvisorFunction"
