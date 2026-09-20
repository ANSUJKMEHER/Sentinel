# Sentinel — Project Context & Handoff

> Read this first if you're an agent picking up work on this project. It records everything done
> so far, current validation status, and the conventions/gotchas that matter. Companion docs:
> **README.md** (how to run/deploy) · **AUDIT.md** (phase-by-phase audit + roadmap).

Last updated: 2026-09-19 (build agent: hello's momo) · includes the cold-start playbook for the next agent (§0)

---

## 0. Starting from a cold session — the next agent's playbook

If the previous conversation has ended, start here — this is the exact sequence to get back to
work without re-deriving anything.

### 0.1 Read the three docs in this order
1. **context.md** (this file) — what's built, data contracts, session log, gotchas.
2. **AUDIT.md** — phase-by-phase verification status (✅/🟡/⏳) and roadmap R1–R7.
3. **README.md** — run/deploy instructions and API surface.

### 0.2 Orient yourself in the workspace
- Project root: `General/sentinel/` — **one flat folder**; compare the file list against §2's
  inventory. If files were added/moved since this was written, note the drift before changing anything.
- Durable context may also exist in the agent's Core Memory (`personal/System/Memory/sentinel-project.md`).
- **Ask the user (hello) for the latest status** — they may have run things since. Specifically:
  - Has `create-demo-repos.sh` been run? Against which GitHub org/user?
  - Has `deploy.sh` been run? Stack name (`sentinel-dev`?) and AWS region?
  - Did `demo.sh` succeed? If not, capture the exact error messages / CloudWatch log lines.

### 0.3 Set up the sandbox (only what you need)
```bash
cd /home/user/workspace-root/General/sentinel
npm install              # one manifest serves Lambdas + tests + dashboard
npm test                 # expect 67/67 pass (incl. mock-GitHub handler wiring)
# Only if you will touch template.yaml or Lambda code:
python3 -m venv /tmp/samvenv && /tmp/samvenv/bin/pip install aws-sam-cli cfn-lint
export PATH="$PWD/node_modules/.bin:$PATH"
/tmp/samvenv/bin/sam validate --lint --template template.yaml   # expect exit 0
/tmp/samvenv/bin/sam build --parallel                          # expect Build Succeeded
# Dashboard check (against any placeholder API URL):
VITE_API_URL=https://example.example.com npm run dashboard:build
```
⚠️ The sandbox has **no AWS credentials, no gh auth, no Docker**. Anything that touches real
GitHub or AWS must run on the USER's machine (or with credentials they provide) — never invent or
request tokens. Never log or print the GitHub token.

### 0.4 Pick your first move from the actual project state
- **Nothing deployed yet** → the only blocker is the user's credentials. Walk them through, in order:
  1. `./create-demo-repos.sh <org> private --verify` (expect 5 repos, all CI green)
  2. `SENTINEL_GITHUB_TOKEN=<PAT> ./deploy.sh <org> dev`
  3. `./demo.sh dev` — then verify the Definition of Done (AUDIT.md Phase 10): 3 PRs on
     frontend/backend/analytics, none on mobile-api/internal-tool, dashboard
     `advisoriesSeen: 2, prsOpened: 3`, green CI. Update AUDIT.md with the results.
- **Deployed, something failed** → gather artifacts (CloudWatch logs for Advisor/Impact/Patch/State;
  the demo's key lines are `ADVISORY {ghsa_id} …`, `ADVISORY {ghsa_id}: n of m repos affected: […]`,
  `PR #{n} created: {url}` — now inside JSON log lines, still greppable). Debug per phase using
  AUDIT.md's per-phase risk notes; fix locally, re-run `npm test` + bundle checks, push, and have
  the user redeploy with `./deploy.sh <org> dev`.
- **Deployed & working** → the roadmap is complete through R7 (see AUDIT.md). Remaining items are
  either master-prompt non-goals (lockfile/transitive, webhook ingestion, multi-ecosystem,
  auto-merge — ask the user before building) or one-time repo settings (secret scanning).

### 0.5 Conventions every agent must keep
- **Never expand scope** — the master build prompt's non-goals stand (lockfile/transitive analysis,
  pnpm/yarn, auto-merge, multi-ecosystem, ML detection, org onboarding UI).
- Keep the **flat single-folder layout** and the single merged `package.json`.
- Keep **data contracts exact**: snake_case SQS bodies, camelCase DynamoDB attrs (§3).
- When you fix a bug or complete a phase: update **AUDIT.md** (status + new gotchas), append to the
  session log in **§4 of this file**, then `tools.push_workspace_changes` and confirm 0 pending
  changes before reporting done.
- Anything that needs AWS/GitHub credentials or creates external resources → **ask the user first**.

---

## 1. What this is (one paragraph)

**Sentinel** is an AWS-powered GitHub security automation system that is **advisory-first**. When a
new GitHub Security Advisory (GHSA) is published for an npm package, Sentinel answers *"which of my
organization's repos are affected right now?"* and opens a real remediation PR on every affected
repo (the repo's own CI verifies it). Positioning line (README + dashboard footer):
*"Dependabot is per-repo. Sentinel is org-wide: one security event → impact analysis across every
repo → coordinated remediation PRs."*

**Hard scope (non-negotiable, from the master build prompt):** npm ecosystem, `package.json`
(deps + devDeps), github.com (public+private, one org/user, 5–50 repos), Node.js 20 Lambdas, SAM,
`semver` npm package, native `fetch` (no Octokit), 1 org, static S3 dashboard.
**Explicit non-goals (do NOT build):** lockfile/transitive analysis · pnpm/yarn · multi-ecosystem ·
auto-merge · Dependabot/webhook ingestion · org-level onboarding UI · ML detection · private registries.

## 2. Location & layout

- Workspace: `General/sentinel/` — **one flat folder, no subfolders** (user explicitly requested this).
  All files are at the project root; a single root `package.json` serves Lambdas, tests, and the
  React dashboard (one `npm install` for everything).
- Core memory card about the project: `personal/System/Memory/sentinel-project.md` (agent memory).

| File | Role |
|---|---|
| `template.yaml` | SAM: 4 Lambdas, 2 SQS, EventBridge cron, HTTP API, 3 DynamoDB tables, S3 website, SSM note |
| `advisor.mjs` | Detect: poll GHSA (5-min cron) → DynamoDB dedupe → advisory-queue |
| `impact.mjs` | Decide: refresh org repos → fetch package.json → `semver.intersects` → jobs + patch-queue |
| `patch.mjs` | Act: branch `security/{pkg}-{ghsa_id}` + commit + PR (§7 body) → job `patched` |
| `bedrock.mjs` | Optional Bedrock prose section (never decides security) |
| `state.mjs` | `GET /state` (+ live CI status) · `POST /advisories/simulate` |
| `decisions.mjs` | ★ Correctness core (pure): `isRangeAffected`, `findAffectedEntries`, `resolvePatchedVersion`, `bumpPackage`, `isGatedSeverity`, `parseRepoConfig` |
| `logger.mjs` | Structured JSON logs (`event` + correlation fields; demo lines preserved in `msg`) |
| `notify.mjs` | Digest text + Slack-compatible webhook POST (R6) |
| `report.mjs` | Weekly rollup aggregation — pure, unit-tested (R6/R7) |
| `github.mjs` | Shared fetch client: Bearer auth, `X-GitHub-Api-Version: 2022-11-28`, retry-after on 403/429, SSM token at cold start, test hooks |
| `decisions.test.mjs` / `prbody.test.mjs` / `policy.test.mjs` / `report.test.mjs` / `handlers.test.mjs` | Unit tests (67 cases total incl. mock-GitHub wiring) |
| `test-helpers.mjs` | Fakes for handler tests: FakeGithub / FakeDynamo / FakeSqs |
| `smoke.mjs` | E2E: simulate → poll `/state` ≤120s → exit 0 iff all jobs `patched` |
| `index.html`, `main.tsx`, `App.tsx`, `api.ts`, `types.ts`, `*Table.tsx`, `SimulatePanel.tsx`, `StatCards.tsx`, `styles.css`, `vite-env.d.ts`, `vite.config.ts`, `tsconfig.json` | React + TS + Vite dashboard |
| `create-demo-repos.sh` | Demo fixtures: 5 repos (3 vulnerable lodash@4.17.20, 2 safe @4.17.21) + CI workflows; `--verify`/`--dry-run` |
| `deploy.sh` / `demo.sh` | Build+deploy+SSM token · demo run |
| `.github/workflows/ci.yml`, `.github/dependabot.yml` | This repo's CI + Dependabot (GitHub-mandated path — the one flat-layout exception) |

## 3. Architecture & data contracts

```
[GitHub Advisory DB] --poll--> [EventBridge rate(5 min)] --> [Advisor] --> [SQS advisory-queue]
[POST /advisories/simulate] ----------------------------------------------------^
        --> [Impact] --> jobs + [SQS patch-queue] --> [Patch] --> GitHub PR --> repo CI
[DynamoDB]: sentinel-repos | sentinel-advisories | sentinel-jobs
[Static S3 dashboard] <-- GET /state <-- [State Lambda] (reads DB + live check-runs)
[Bedrock OPTIONAL] --> PR body prose only
```

**SQS message shapes (snake_case — this bit us once, see Gotcha #3):**
- advisory-queue: `{ ghsa_id, package, severity, summary, vulnerable_range, first_patched_version, source: "cron"|"simulate" }`
- patch-queue: `{ jobId, ghsa_id, repo, package, from_range, vulnerable_range, first_patched_version, default_branch, severity, summary, [reviewers], [labels] }`
  (`reviewers`/`labels` are optional policy extras from the repo's `.github/sentinel.json`, R5)

**DynamoDB attrs (camelCase):**
- `sentinel-repos` PK `repo` (`{owner}/{name}`): `defaultBranch, private, archived, excluded, lastSeenAt`
- `sentinel-advisories` PK `ghsa_id`: `package, severity, summary, vulnerableRange, firstPatchedVersion, publishedAt, source, action("remediate"|"report"), [digestSentAt]`
- `sentinel-jobs` PK `jobId`: `ghsaId, repo, package, fromRange, toVersion, status(queued|patched|failed), prNumber, prUrl, error, updatedAt`

**`GET /state`**: `{ advisories:[20], repos:[…], jobs:[50], stats:{advisoriesSeen, reposMonitored, prsOpened}, tokenConfigured }`.
**`POST /advisories/simulate`**: validates, suffixes `ghsa_id` with `-sim-{timestamp}`, writes `source:"simulate"`, pushes to the SAME advisory-queue → 202 with the event.

## 4. What has been done — session log

### Session 1 — Full build (master prompt → working project)
Built every component above + `template.yaml` + README + tests + scripts. Validation at the time:
31/31 unit tests, all 4 handlers esbuild-bundled, dashboard strict-TS build, template structurally
checked. Four real bugs found & fixed during self-review: **Gotchas #1–#4 below.**

### Session 2 — Flat-folder consolidation + audit
- User asked for all files in one folder → flattened `src/`, `tests/`, `scripts/`, `dashboard/`
  into the project root via `mv` (single merged `package.json` + `package-lock.json`; imports,
  SAM `CodeUri: .` / entry points / handlers, `tsconfig.json` includes, vite entry, deploy/demo
  paths all rewritten and re-validated: tests ✅, 4 bundles ✅, dashboard build ✅, bash -n ✅).
- Created **AUDIT.md**: 10-phase audit (legend ✅/🟡/⏳) + roadmap **R1–R7** + 4 found bugs.

### Session 3 — Completed Phase 0 and Phase 1 (see AUDIT.md for full detail)
**Phase 0 (stack/scaffolding) — COMPLETE:**
- Installed **SAM CLI 1.166.2 + cfn-lint 1.53.3** in a sandbox venv (`/tmp/samvenv` — ephemeral).
- `sam validate --lint` caught a real error: `AWS::SSM::Parameter` cannot create `SecureString`
  params (only String/StringList) → **removed the SSM resource**; `deploy.sh` now writes
  `/sentinel/github-token` via `aws ssm put-parameter --type SecureString --overwrite`
  (also means re-deploys can never reset the token). README SSM notes updated.
- `nodejs20.x` is deprecated (2026-04-30, deployable until 2027-02-01) → added **`LambdaRuntime`**
  template parameter (default `nodejs20.x` per spec; 22.x/24.x allowed) + in-template cfn-lint
  suppression of W1030 with an explanatory comment.
- `sam build` initially failed: SAM's esbuild builder needs the esbuild binary discoverable →
  `deploy.sh` now exports `$PWD/node_modules/.bin` to PATH before `sam build --parallel`.
- **Final: `sam validate --lint` exit 0 · `sam build --parallel` Build Succeeded**
  (4 bundles ~4.4 MB each, transformed-template handlers verified).

**Phase 1 (demo repos) — SCRIPT COMPLETE, live run pending:**
- Hardened `create-demo-repos.sh`: `gh auth` preflight, idempotent (skips existing repos),
  `--dry-run`, `--verify` (polls GitHub Actions until CI green, per-repo `--timeout N`).
- Mock-tested end-to-end against a recording fake `gh` CLI: (1) fresh run → 5 repos with exact
  vulnerable/safe version mapping + `--verify` all green; (2) re-run → all skipped; (3) dry-run →
  creates nothing. All pass.

### Session 4 — Completed roadmap R1, R2, R4-gating, R5-policy, R6, R7 (2026-09-19)
The 10 audit phases were already built (Phases 0–1 complete, 2–9 built, live runs pending user
credentials). This session completed everything in the AUDIT.md roadmap that is code-level and
inside the master-prompt scope. Explicit non-goals were respected: **no** lockfile/transitive
analysis (R3), **no** webhook ingestion or multi-ecosystem (R4 remainder), **no** auto-merge (R5
remainder) — those need the user to lift a non-goal first.

**R1 — pre-demo hardening:**
- `.github/workflows/ci.yml` (npm test + dashboard build + `sam validate --lint` + `sam build`)
  and note: `.github/` is the one documented exception to the flat-folder rule (GitHub mandates
  that path).
- DLQs on both SQS queues (`MaxReceiveCount: 3`) + DLQ-depth alarms + Outputs.
- Mock-GitHub handler tests: `test-helpers.mjs` (FakeGithub route table / FakeDynamo / FakeSqs) +
  `handlers.test.mjs` — 17 cases running Advisor/Impact/Patch/State wiring with injected
  `fetch` + SDK doubles. Handlers gained `__test` client hooks and github.mjs gained
  `__setFetcherForTests`/`__setTokenForTests` (test-only, documented).

**R2 — observability:** `logger.mjs` structured JSON logs (demo lines preserved in `msg`);
CloudWatch dashboard `Sentinel-<stage>`; 7 alarms (failed jobs, queue depth ×2, DLQ ×2, State +
Advisor errors) via explicit Patch log group + MetricFilters (`Sentinel` namespace); X-Ray
`Tracing: Active` on all functions.

**R4 — severity gating:** `AutoRemediateSeverities` param (default `critical,high`; empty string
disables gating) enforced identically in Advisor (cron) and State (simulate); gated advisories
stored with `action: report` and never queued; dashboard shows a `report-only` badge.

**R5 — policy engine:** per-repo `.github/sentinel.json` (`exclude`, `excludePackages`,
`reviewers`, `labels`) fetched by Impact; `excluded` repos flagged in the dashboard; PRs get
`security`/`sentinel` labels + reviewers (best-effort) + `<!-- sentinel: … -->` metadata marker;
PR grouping — a second advisory for the same repo+package extends the existing PR body
(marker-idempotent PATCH).

**R6 — notifications:** per-advisory digest to `NotifyWebhookUrl` when the last job settles
(exactly-once via conditional `digestSentAt` write); `GET /report` weekly rollup (pure
`report.mjs` aggregation + live PR merge state, bounded to 15 PRs).

**R7 — own posture:** `.github/dependabot.yml` (npm + github-actions); PAT-age watchdog
(Advisor `token_check` log + `/state` `tokenAgeDays`, ≥90 days warns); `mergedBy` audit rollup in
`/report`; secret scanning documented as a repo-setting step.

Validation this session: **67/67 tests** (was 31), dashboard strict-TS build ✅, all 4 handlers
bundle ✅, `sam validate --lint` ✅ + `sam build --parallel` ✅ (SAM 1.166.2 + cfn-lint 1.53.3
reinstalled in `/tmp/samvenv`). Three template bugs found & fixed live: `Globals.Function` rejects
`Policies` (per-function X-Ray policy instead); `LoggingConfig` takes `LogGroup` not
`LogGroupName`; digest send raced between concurrent Patch invocations (conditional write).

## 5. Current validation status

| Check | Status |
|---|---|
| `npm test` (unit, 67 cases incl. mock-GitHub wiring) | ✅ pass |
| `sam validate --lint` | ✅ exit 0 (SAM 1.166.2 + cfn-lint 1.53.3) |
| `sam build --parallel` | ✅ Build Succeeded (needs esbuild on PATH — deploy.sh handles) |
| `npm run dashboard:build` | ✅ strict TS + Vite (≈49 KB gzip) |
| `bash -n` on all 3 scripts | ✅ |
| `create-demo-repos.sh` mock tests | ✅ 3/3 scenarios |
| Roadmap R1/R2/R4-gate/R5-policy/R6/R7 | ✅ code complete (AUDIT.md has the breakdown) |
| **Live AWS deploy (`./deploy.sh`)** | ⏳ **PENDING — requires user's AWS credentials** |
| **Live GitHub org run** | ⏳ **PENDING — requires user's gh auth** |
| Phases 2–10 live verification | ⏳ pending the above (see AUDIT.md per-phase 🟡/⏳ items) |

## 6. Gotchas — do not reintroduce these

1. **GitHub advisory ranges are comma-separated** (`">= 4.0.0, < 4.17.21"`) and crash
   `semver.intersects` uncaught → always route ranges through `normalizeRange()` in `decisions.mjs`
   (tests cover it). This is the single most important correctness rule.
2. **GitHub contents API**: non-raw responses are JSON *envelopes* — decode `data.content`
   (base64) BEFORE parsing text. Use `parsePackageJson()` from `github.mjs`; don't re-implement.
3. **SQS messages are snake_case** (`package`, `from_range`, `ghsa_id`, `first_patched_version`),
   DynamoDB attrs are camelCase. Destructuring `msg.package as pkg` etc. — a camelCase destructure
   here once rendered `undefined` in every PR.
4. **Patch idempotency**: branch exists (422) → rebase edit onto branch head; entry missing on
   branch → fail the job, never open an empty PR; existing open PR → reuse it.
5. **SSM**: CloudFormation can't create SecureString params — token creation lives in `deploy.sh`
   via CLI. Never log the token; read it once at cold start (`getGithubToken()` caches it).
6. **Node 20 is spec-mandated but deprecated** — keep `LambdaRuntime` default `nodejs20.x`;
   don't remove the W1030 suppression without a reason.
7. **SAM build needs esbuild on PATH** (root devDependency) — `deploy.sh` exports it; don't drop
   that line.
8. **Flat folder layout is intentional** (user request) — new files go at the project root;
   keep the single merged `package.json` in sync if you add deps.
9. `node --test` needs explicit file lists here (glob args differ across Node 20/24) — update the
   `npm test` script if you add test files.
10. Simulate re-runs work because `ghsa_id` gets a `-sim-{timestamp}` suffix; demo re-takes should
    close old demo PRs first (Sentinel reuses open PRs per advisory).
11. **`.github/` is the one flat-layout exception** — GitHub mandates `.github/workflows` and
    `.github/dependabot.yml`; everything else stays at the project root.
12. **`Globals.Function` rejects `Policies`** (SAM schema) — attach managed policies
    (e.g. `AWSXrayWriteOnlyAccess`) per function; `sam validate --lint` catches this.
13. **SAM `LoggingConfig` uses `LogGroup`** (not `LogGroupName`) — needed the fix before the Patch
    function's explicit log group would lint clean.
14. **Digest exactly-once** relies on a conditional `UpdateItem` (`attribute_not_exists(digestSentAt)`)
    on the advisory row — don't remove the condition or concurrent Patch runs will double-send.
15. **Test doubles are injected via `__test` hooks** (handlers) and `__setFetcherForTests`/
    `__setTokenForTests` (github.mjs) — test-only, never set them in production code paths.
16. **Structured logs must keep `msg`** with the historical demo lines (`ADVISORY …`,
    `PR #n created: …`) so CloudWatch greps and the demo's DoD checks keep working.

## 7. Sandbox/validation notes for future agents

- Sandbox has Node 24 + npm (registry reachable) but **no AWS creds, no `gh`, no Docker, no SAM by
  default**. To re-run SAM validation: `python3 -m venv /tmp/samvenv && /tmp/samvenv/bin/pip install
  aws-sam-cli cfn-lint`, then run with `SAM_CLI_TELEMETRY=0` and `node_modules/.bin` on PATH.
  `sam build` works without Docker (esbuild build method).
- Fast validation loop: `npm test` · `npm run dashboard:build` · `bash -n *.sh` · bundle checks via
  `npx esbuild <name>.mjs --bundle --platform=node --format=esm --outfile=/tmp/<name>.js`.
- Workspace mechanics: changes under `/home/user/workspace-root` must be persisted with
  `tools.push_workspace_changes` and verified via `tools.list_pending_workspace_changes` (0 pending
  before finishing). SAM build artifacts (`.aws-sam/`) are gitignored — never pushed.
- The original **master build prompt** (in the session-1 user message) is the scope authority;
  AUDIT.md §13/roadmap lists what remains deliberately out.

## 8. Next steps (recommended order)

> Starting cold? §0 is the playbook — read that first.

1. **User action (unchanged — the only thing blocking the live demo):**
   `./create-demo-repos.sh <org> private --verify` → `SENTINEL_GITHUB_TOKEN=<PAT>
   ./deploy.sh <org> dev` → `./demo.sh dev` → verify the DoD sequence (3 PRs, dashboard
   `advisoriesSeen: 2, prsOpened: 3`, green CI). Anything failing here is the top priority to fix.
2. **Roadmap: done through R7** except the parts that are master-prompt non-goals —
   lockfile/transitive (R3), webhook ingestion + multi-ecosystem (R4 remainder), auto-merge
   (R5 remainder). If you want any of those, say so explicitly and the non-goal is lifted.
3. **Optional polish within scope:** Bedrock prose live test (enable model access + parameter),
   `NotifyWebhookUrl` end-to-end test, attach SNS topics to the 7 alarms.
4. **Repo settings (one-time, cannot be done from code):** enable secret scanning + Dependabot
   alerts on the sentinel repo itself.
