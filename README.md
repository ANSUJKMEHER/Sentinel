# 🛡️ Sentinel

**Advisory-first, org-wide npm dependency security automation for GitHub.**

> Dependabot is per-repo. **Sentinel is org-wide.**

When a new [GitHub Security Advisory](https://github.com/advisories) (GHSA) is published for an npm package, Sentinel instantly answers the question every security team asks in that moment: **"which of our repositories are actually affected right now?"** — and for every affected repo it automatically opens a real remediation Pull Request with the fixed version. The repo's own CI verifies the change.

One security event → org-wide impact analysis → coordinated remediation PRs.

```text
GitHub Advisory DB ──poll──▶ EventBridge cron ──▶ Advisor Lambda        (DETECT)
                                                     │  new GHSA
                                                     ▼
[simulate button] ──▶ API Gateway ──▶ SQS advisory-queue ──▶ Impact Lambda   (DECIDE)
                                                              │  semver.intersects(declared, vulnerable)
                                                              ▼
                                    SQS patch-queue ──▶ Patch Lambda        (ACT)
                                                         │  branch + commit + PR via GitHub API
                                                         ▼
                                                 GitHub PR ──▶ repo's own CI  (VERIFY)

DynamoDB (advisories · repos · jobs)  ·  DLQs on both queues  ·  X-Ray tracing
CloudWatch metrics + alarms + ops dashboard  ·  optional Bedrock PR prose  ·  optional Slack digest
```

## Why not Dependabot?

Dependabot is repo-centric: each repository is told individually that *it* has a problem, whenever its own scan notices. Sentinel is **advisory-centric**: the moment a GHSA drops, it evaluates the *entire org* against that one event and coordinates the response — one incident, one unified view, one set of PRs. That difference matters when a zero-day like Log4j or a lodash prototype-pollution lands and you need to know the blast radius *now*.

## What a run looks like

```text
ADVISORY GHSA-jf85-cpcp-j695 lodash high
ADVISORY GHSA-jf85-cpcp-j695: 3 of 5 repos affected: [frontend, backend, analytics]
PR #1 created: https://github.com/<org>/frontend/pull/1
PR #2 created: https://github.com/<org>/backend/pull/2
PR #3 created: https://github.com/<org>/analytics/pull/3
```

Each PR: `🔐 [Security] Update lodash from 4.17.20 to 4.17.21` — deterministic version bump from advisory data, human-readable risk summary (Bedrock, optional), and the repo's own GitHub Actions running on the PR to verify it.

## Stack

| Layer | AWS services |
|---|---|
| Ingest | EventBridge (5-min cron), Lambda |
| Decision | Lambda + SQS (+ DLQs), `semver` range intersection |
| Action | Lambda → GitHub API (branch, commit, PR) |
| State | DynamoDB (on-demand): advisories, repos, jobs |
| API | API Gateway HTTP API — `GET /state`, `GET /report`, `POST /advisories/simulate` |
| Dashboard | React + TypeScript + Vite, hosted on S3 static website (GitHub dark/light theme) |
| Observability | X-Ray, structured JSON logs, CloudWatch metric filters, 6 alarms, ops dashboard |
| Optional | Amazon Bedrock PR prose (`amazon.nova-lite`), Slack-compatible advisory digest |
| Local dev | LocalStack via docker-compose |

## Quickstart

```bash
npm install
npm test                     # 67 unit tests

# 1. Create 5 demo repos (3 vulnerable, 2 safe) with green CI:
./scripts/create-demo-repos.sh <your-org-or-user> public --verify

# 2. Deploy the stack (stores the GitHub PAT in SSM as SecureString):
SENTINEL_GITHUB_TOKEN=<PAT> ./scripts/deploy.sh <your-org-or-user> dev

# 3. Run the end-to-end demo (simulate advisory → poll until PRs land):
./scripts/demo.sh dev
```

Expected: 3 remediation PRs (`frontend`, `backend`, `analytics`), 2 repos untouched, dashboard shows `prsOpened: 3`.

Local development without AWS: `docker compose up` (LocalStack), then `./scripts/deploy-local.sh`.

## Configuration

- **Severity gating** (`AutoRemediateSeverities`, default `critical,high`): advisories below the threshold are recorded report-only.
- **Per-repo policy** (`.github/sentinel.json` in any repo): `exclude`, `excludePackages`, `reviewers`, `labels`.
- **Bedrock** (`BedrockEnabled=true`): the LLM writes only the "What this means for you" prose section of the PR body — it never decides security. Deterministic fields always come from advisory data, and PR creation never depends on Bedrock.

## Honest scope (v1)

npm + `package.json` (`dependencies` + `devDependencies`), one GitHub org. On the roadmap: lockfile/transitive analysis, multi-ecosystem, advisory webhooks. The detection core is a pure, unit-tested function (`backend/decisions.mjs`) — a repo is affected iff `semver.intersects(declaredRange, vulnerableRange)`.

## Docs

- [`docs/context.md`](docs/context.md) — project context & handoff
- [`docs/AUDIT.md`](docs/AUDIT.md) — phase-by-phase audit & roadmap
- [`docs/GITHUB_APP_SETUP.md`](docs/GITHUB_APP_SETUP.md) — GitHub App installation option
