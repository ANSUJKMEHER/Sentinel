#!/usr/bin/env bash
# Sentinel demo fixtures (§11.1): create 5 repos under one GitHub org/user.
#   frontend, backend, analytics  -> lodash "4.17.20"  (vulnerable)
#   mobile-api, internal-tool     -> lodash "4.17.21"  (safe)
# Each repo gets a trivial `npm test` + a GitHub Actions CI workflow.
#
# Requires: gh (GitHub CLI) authenticated with permission to create repos.
#
# Usage:
#   ./create-demo-repos.sh <org-or-user> [private|public] [--verify] [--dry-run] [--timeout N]
#     --verify    poll GitHub Actions after creation until each repo's CI is green
#     --dry-run   print what would happen without creating anything
#     --timeout N per-repo CI verification timeout in seconds (default 120)
set -euo pipefail

ORG=""
VISIBILITY="private"
VERIFY=0
DRY_RUN=0
VERIFY_TIMEOUT=120

usage() {
  cat >&2 <<EOF
usage: ./create-demo-repos.sh <github-org-or-user> [private|public] [--verify] [--dry-run] [--timeout N]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --verify) VERIFY=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --public) VISIBILITY="public" ;;
    --private) VISIBILITY="private" ;;
    --timeout) VERIFY_TIMEOUT="${2:?--timeout needs a value}"; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; usage; exit 2 ;;
    *)
      if [[ -z "$ORG" ]]; then ORG="$1"
      elif [[ "$1" == "public" || "$1" == "private" ]]; then VISIBILITY="$1"
      else echo "unexpected argument: $1" >&2; usage; exit 2; fi ;;
  esac
  shift
done

[[ -n "$ORG" ]] || { usage; exit 2; }

command -v gh >/dev/null 2>&1 || { echo "❌ gh (GitHub CLI) is required — https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "❌ gh is not authenticated. Run: gh auth login"; exit 1; }

repos=("frontend:4.17.20" "backend:4.17.20" "mobile-api:4.17.21" "analytics:4.17.20" "internal-tool:4.17.21")

created=()
for entry in "${repos[@]}"; do
  name="${entry%%:*}"
  version="${entry##*:}"

  if gh repo view "$ORG/$name" >/dev/null 2>&1; then
    echo "⏭  $ORG/$name already exists — skipping"
    continue
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] would create $ORG/$name ($VISIBILITY, lodash@$version)"
    continue
  fi

  dir="$(mktemp -d)"
  mkdir -p "$dir/.github/workflows"

  cat > "$dir/package.json" <<EOF
{
  "name": "$name",
  "version": "1.0.0",
  "private": true,
  "scripts": { "test": "node -e \"process.exit(0)\"" },
  "dependencies": { "lodash": "$version" }
}
EOF

  cat > "$dir/.github/workflows/ci.yml" <<'EOF'
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npm test
EOF

  (cd "$dir" && git init -q && git add -A \
    && git -c user.name="Sentinel Demo" -c user.email="demo@sentinel.local" commit -q -m "Initial commit")

  gh repo create "$ORG/$name" --"$VISIBILITY" --source "$dir" --push
  rm -rf "$dir"
  echo "✅ created $ORG/$name (lodash@$version)"
  created+=("$name")
done

echo
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Summary: dry-run — ${#repos[@]} repo(s) would be created, nothing changed."
else
  echo "Summary: ${#created[@]} repo(s) created, $(( ${#repos[@]} - ${#created[@]} )) skipped/existing."
fi

if [[ "$VERIFY" -eq 1 && ${#created[@]} -gt 0 ]]; then
  echo
  echo "▶ Verifying CI is green (per-repo timeout: ${VERIFY_TIMEOUT}s)…"
  for name in "${created[@]}"; do
    deadline=$(( $(date +%s) + VERIFY_TIMEOUT ))
    while :; do
      run="$(gh api "repos/$ORG/$name/actions/runs?per_page=1" --jq \
        '.workflow_runs[0] | if . == null then "none" else (.conclusion // .status) end')"
      case "$run" in
        success)
          echo "✅ $ORG/$name CI green"
          break ;;
        failure|cancelled|timed_out|skipped)
          echo "❌ $ORG/$name CI ended: $run"
          break ;;
      esac
      if [[ "$(date +%s)" -ge "$deadline" ]]; then
        echo "⏰ $ORG/$name CI still pending after ${VERIFY_TIMEOUT}s (last state: $run)"
        break
      fi
      sleep 5
    done
  done
elif [[ "$VERIFY" -eq 1 ]]; then
  echo "ℹ  nothing created — skipping CI verification."
fi

[[ "$DRY_RUN" -eq 1 ]] && echo "ℹ  dry-run: no changes made."
