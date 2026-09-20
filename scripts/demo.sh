#!/usr/bin/env bash
# Sentinel demo script (§11.5 / §14): fire the simulate endpoint against the
# live stack and poll until all jobs reach `patched`.
#
# Usage: ./demo.sh [stage]
#
# NOTE (re-takes): the simulate endpoint suffixes the ghsa_id, so every run
# works. Close the PRs from the previous take before re-running so the PR
# count stays clean (Sentinel reuses open PRs per advisory).
set -euo pipefail

STAGE="${1:-dev}"
STACK="sentinel-$STAGE"

cd "$(dirname "$0")"

API_URL="$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)"
DASHBOARD_URL="$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' --output text)"

echo "======================================================================"
echo "  Sentinel demo — advisory-first, org-wide npm remediation"
echo "  API:       $API_URL"
echo "  Dashboard: $DASHBOARD_URL"
echo "======================================================================"
echo
echo "▶ Simulating a GHSA for lodash (CVE-2021-23337)…"
node smoke.mjs "$API_URL"

echo
echo "▶ Expected outcome (5 demo repos):"
echo "   3 PRs — frontend, backend, analytics (lodash 4.17.20 -> 4.17.21)"
echo "   2 repos untouched — mobile-api, internal-tool (already 4.17.21)"
echo "   Dashboard: advisoriesSeen includes this advisory, prsOpened += 3"
echo
echo "▶ Dashboard: $DASHBOARD_URL"
echo "▶ GitHub:    open the 3 PRs and verify green CI (npm install && npm test)."
