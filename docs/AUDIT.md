# Sentinel — Phase-by-Phase Audit & Roadmap

Audit date: 2026-09-19 · Auditor: hello's momo (build agent) · Scope: `General/sentinel/` v1

**Verdict up front:** the code is demo-ready and the build pipeline is now **proven**: 31/31 unit
tests pass, `sam validate --lint` and a full `sam build --parallel` both run clean in this sandbox
(SAM CLI 1.166.2 + cfn-lint 1.53.3 installed here for the audit), the dashboard compiles under
strict TypeScript, and the SAM template is valid with zero wildcard IAM policies. What has **not**
been exercised is the live AWS/GitHub loop (no AWS account or GitHub org access from the sandbox)
— every phase below marks exactly what still needs your live run to be proven.

Legend: ✅ verified in sandbox · 🟡 built, needs live verification · ⏳ requires user actions

---

## Phase 0 — Stack & scaffolding ✅ COMPLETE

- **Built:** SAM `template.yaml` + single flat folder (all files at repo root; the dashboard was
  consolidated into the same manifest — one `npm install` serves Lambdas, tests, and the React app).
- **Stack choice (yours):** Node.js 20 / arm64 Lambdas, SAM, `semver` npm package, native `fetch`
  (no Octokit), DynamoDB on-demand, SQS, EventBridge cron, HTTP API, S3 static site,
  **React + TypeScript + Vite** frontend.
- ✅ **`sam validate --lint` passes** — real SAM CLI 1.166.2 + cfn-lint 1.53.3 installed in the
  sandbox; template is a valid SAM template, exit 0.
- ✅ **`sam build --parallel` succeeds end-to-end** (CopySource → NpmInstall → EsbuildBundle);
  all four bundles built (~4.4 MB each, self-contained SDK), transformed-template handlers resolve
  to `advisor.handler` / `impact.handler` / `patch.handler` / `state.handler`.
- ✅ Validation caught a real error, now fixed: `AWS::SSM::Parameter` cannot create `SecureString`
  parameters (only `String`/`StringList`) — the token is now written by `deploy.sh` via
  `aws ssm put-parameter --type SecureString --overwrite`, which also matches the spec's
  "user fills manually" and means re-deploys can never reset the token.
- ✅ Added `LambdaRuntime` parameter (default `nodejs20.x` per spec, `nodejs22.x`/`24.x` allowed).
  `nodejs20.x` is deprecated (2026-04-30) but deployable until 2027-02-01 — the W1030 lint rule is
  suppressed in-template with a comment explaining the decision.
- ✅ `deploy.sh` exports `node_modules/.bin` to PATH before `sam build` (SAM's esbuild builder
  needs the esbuild binary discoverable — discovered and fixed during the audit).
- ⏳ Remaining (needs your AWS account): `sam deploy` itself.

## Phase 1 — Demo org & repos (fixtures) 🟡 SCRIPT COMPLETE, LIVE RUN PENDING

- **Built:** `create-demo-repos.sh` — creates `frontend`, `backend`, `mobile-api`, `analytics`,
  `internal-tool` under one org via `gh`; three carry `lodash@4.17.20` (vulnerable), two carry
  `4.17.21` (safe); each ships a trivial `test` script + a GitHub Actions CI
  (`npm install && npm test`).
- ✅ **Hardened this phase:** `gh auth status` preflight with a clear error; **idempotent** (skips
  repos that already exist); `--dry-run` mode; `--verify` flag that polls GitHub Actions after
  creation until each repo's CI is green (per-repo `--timeout N`, default 120s); clearer summary
  output.
- ✅ **Mock-tested end-to-end** against a recording fake `gh` CLI: (1) fresh run creates all 5
  repos with the exact vulnerable/safe version mapping and `--verify` drives every CI to green;
  (2) re-run skips all 5; (3) `--dry-run` prints the plan and creates nothing.
- ⏳ Needs you: run it against your real org (`./create-demo-repos.sh <your-org> private --verify`)
  — the only remaining risk is account-level (Actions must be enabled, `gh` must have repo-create
  scope), which can't be tested without your credentials.

## Phase 2 — Advisor (detect) ✅ built · R4 severity gating added

- **Built:** polls `GET /advisories?ecosystem=npm&state=published&sort=published&direction=desc&per_page=30`,
  takes the **first** vulnerability entry, extracts `package.name / severity / summary /
  vulnerable_version_range / first_patched_version`, dedupes via
  `PutItem(ConditionExpression: attribute_not_exists(ghsa_id))`, pushes to `advisory-queue`,
  logs `ADVISORY {ghsa_id} {package} {severity}`.
- ✅ Bundles; token read from SSM at cold start; dedupe logic reviewed; demo log line present.
- ✅ **R4 severity gating**: advisories below `AutoRemediateSeverities` (default `critical,high`)
  are stored with `action: report` and never queued (log `ADVISORY … GATED (report-only)`).
- ✅ **R7 token-age watchdog**: warns (event `token_check`) when the SSM PAT is ≥90 days old.
- ✅ **R1 mock-GitHub wiring tests**: detection, gating, dedupe, non-npm skip (handlers.test.mjs).
- 🟡 Not live-verified: GitHub response shape (fields exist per GH docs), EventBridge permission wiring (SAM handles it).
- ⚠️ Known limitation (by spec): fixed `per_page=30` window — a burst of >30 advisories between
  5-min polls could miss some (roadmap R4 webhook ingestion — still out of scope).

## Phase 3 — Impact (decide) — the correctness milestone

- **Built:** refreshes `sentinel-repos` (skips archived/forks, `/orgs` with `/users` fallback),
  fetches each repo's `package.json`, decides affectedness with
  `semver.intersects(declaredRange, vulnerableRange)` in a **pure, tested function** (`decisions.mjs`),
  creates `queued` jobs, pushes to `patch-queue`, logs
  `ADVISORY {ghsa_id}: {n} of {m} repos affected: [...]`.
- ✅ **25 unit cases green**, including: exact/caret/tilde pins (vulnerable & safe), `*`, range
  straddle, OR ranges, unparseable ranges (→ not affected, never a false positive), devDependencies
  hit, name mismatch. One job per (repo, package), `dependencies` scope preferred.
- ✅ Real bug caught & fixed here: **GitHub advisories use comma-separated ranges** (`">= 4.0.0, < 4.17.21"`)
  which crash `semver.intersects`; `normalizeRange()` strips commas (+ dedicated tests).
- ✅ **R5 repo policy**: `.github/sentinel.json` — `exclude`, `excludePackages`, `reviewers`, `labels`;
  excluded repos are flagged in `sentinel-repos` (`excluded` attr, dashboard badge); reviewers/labels
  ride the patch-queue message. Invalid/missing config → no policy + warn.
- ✅ **R1 mock-GitHub wiring tests**: affected/safe decision, policy extras, exclusion, package exclusion.
- 🟡 Not live-verified: real GHSA payloads, repo pagination on big orgs, rate limits with ~50 repos.

## Phase 4 — Patch (act)

- **Built:** resolves fixed version (`first_patched_version` → strict `"< X"` upper bound fallback →
  else job `failed: "no patched version in advisory"`, never guesses); creates/reuses branch
  `security/{pkg}-{ghsa_id}`; PUTs the exact pinned version preserving everything else; opens or
  reuses the PR with the §7 body (title `🔐 [Security] Update {pkg} from {fromRange} to {toVersion}`);
  marks job `patched`; logs `PR #{number} created: {url}`; per-message try/catch → job `failed`,
  SQS message always deleted (no poison-pill loops).
- ✅ PR body tested against the §7 template (heading, capitalized severity, advisory link,
  deterministic table, Sentinel footer, no Bedrock section when disabled).
- ✅ Bugs caught & fixed: `parsePackageJson` was reading the JSON envelope instead of the base64
  `content`; the PR-body composer destructured snake_case message keys as camelCase (would have
  printed `undefined` in every PR); branch-reuse with a vanished entry now fails the job instead of
  opening an empty PR.
- ✅ **R5**: `security` + `sentinel` labels (+ config labels), optional reviewers, HTML metadata
  marker, and **PR grouping** — a second advisory for the same repo+package folds into the existing
  open PR body (marker-idempotent).
- ✅ **R6**: digest to `NotifyWebhookUrl` when the last job for an advisory settles
  (conditional `digestSentAt` write ⇒ exactly one digest per advisory).
- ✅ **R1 mock-GitHub wiring tests**: happy path (commit contents, PR body, labels), grouping,
  failure marking, digest trigger.
- 🟡 Not live-verified: real ref/contents/pulls calls, 422 branch/PR reuse paths, check-runs for CI status.

## Phase 5 — State API + simulate (the demo path)

- **Built:** `GET /state` (last 20 advisories, repos, last 50 jobs, stats incl. `prsOpened`, live
  PR CI status via check-runs, `tokenConfigured`, `tokenAgeDays`) and `POST /advisories/simulate`
  (validates, suffixes `ghsa_id` with `-sim-{timestamp}`, writes with `source: "simulate"`, pushes
  to the **same advisory-queue** as cron, returns 202 with the event + `action`).
- ✅ **R6**: `GET /report` — weekly rollup (advisories seen, packages, affected repos, PRs
  opened/merged/open/stale, failures, merged-by rollup, top packages) with live PR merge state
  (bounded to 15 PRs). Pure aggregation in `report.mjs`, unit-tested.
- ✅ **R4**: the simulate endpoint applies the same severity gate as cron (report-only severities
  are stored with `action: report` and not queued — consistency between demo and production).
- ✅ **R1 mock tests**: simulate 202/400, gated simulate, `/state`, `/report`, 404.
- ✅ Both routes wired in the template; CORS configured; validation logic reviewed; suffixed IDs make re-runs work.
- 🟡 Not live-verified: API Gateway payload v2 shape (standard), CORS in a browser, live check-runs mapping.

## Phase 6 — Dashboard (React + TypeScript)

- **Built:** stat cards (advisoriesSeen / reposMonitored / prsOpened), pre-filled simulate panel,
  advisories/repos/jobs tabs with severity + `cron`/`simulate` source badges and CI badges, PR links,
  10s polling (2s while a simulate is in flight), config banners, the required positioning footer.
- ✅ **R4/R5 badges**: `report-only` badge on gated advisories, `excluded`/`monitored` policy badge on repos.
- ✅ Compiles under `strict` TS; Vite production build green (≈49 KB gzipped); builds from the flat root.
- 🟡 Not live-verified: rendering against real `/state` data, S3 public access (see ⚠️), browser CORS.
- ⚠️ If your AWS account has S3 Block Public Access **enforced at account level**, the dashboard
  bucket policy won't take effect — bucket-level BPA is disabled in the template, but account-level
  enforcement wins (README documents this).

## Phase 7 — Bedrock prose (optional, last)

- **Built:** `bedrock.mjs` — `amazon.nova-lite-v1:0` (env-overridable), one call per PR, 2–3 plain
  sentences, 8s timeout, inserted as `### What this means for you`; on any error the section is
  omitted and the PR still opens. IAM scoped to the nova-lite model ARN.
- ✅ Bundles; failure-isolation logic reviewed.
- ⏳ Needs you: enable `nova-lite` model access in the Bedrock console and set `BedrockEnabled=true`.

## Phase 8 — Tests & validation

- ✅ **67/67 unit tests**: 25 decision cases + 8 PR-body cases + 11 policy/digest cases + 5 report
  cases + 18 mock-GitHub handler-wiring cases (Advisor/Impact/Patch/State against injected
  fetch + SDK doubles — the test gap this audit previously flagged is now closed); all 4 handlers
  esbuild-bundle; strict-TS dashboard build; shell scripts `bash -n`; template validated + built.
- ✅ `smoke.mjs`: simulate → poll `/state` ≤120s → exit 0 iff all jobs `patched` (exact DoD check).
- 🟡 No live end-to-end yet — that is precisely what `./demo.sh dev` does, and the demo needs your AWS + GitHub.

## Phase 9 — IaC, IAM & secrets hygiene

- ✅ Zero wildcard policies; per-function least privilege (Advisor: put advisory + send + SSM;
  Impact: put repos/jobs + send + SSM + queue receive; Patch: update jobs + scan jobs + update
  advisory (digest) + SSM + Bedrock; State: scan ×3 + put advisory + send + SSM).
- ✅ Token: SSM `SecureString` `/sentinel/github-token`, read once at cold start, never logged;
  placeholder detection fails loudly; token age surfaced via `token_check` log + `/state`.
- ✅ GitHub calls: `Bearer` auth, `X-GitHub-Api-Version: 2022-11-28`, retry ×2 on 403/429 honoring `retry-after`.
- ✅ **R1 DLQs**: both queues redrive to DLQs after 3 failed receives; DLQ-depth alarms make
  stuck messages visible (see Phase 9.5 below).
- ⚠️ Re-deploying **without** `SENTINEL_GITHUB_TOKEN` resets the SSM value to the placeholder
  (CloudFormation owns it) — always deploy with the env var set (README documents this).

## Phase 10 — Demo run / Definition of Done

- ⏳ Pending your live run. Expected: simulate → Impact logs
  `3 of 5 repos affected: [frontend, backend, analytics]` → 3 PRs titled
  `🔐 [Security] Update lodash from 4.17.20 to 4.17.21` → dashboard
  `advisoriesSeen: 2, prsOpened: 3` → 3 × green CI.

---

## Bugs found & fixed during this audit

1. **Comma ranges crash semver** — GitHub advisory ranges (`">= 4.0.0, < 4.17.21"`) are invalid for
   node-semver; added `normalizeRange()` (+tests). Without this, every real advisory would have
   been treated as "unparseable → not affected" — the worst kind of failure: silent.
2. **Envelope vs content bug** — `parsePackageJson` parsed the GitHub contents JSON envelope instead
   of the base64 file body; every Patch run would have failed with "package.json no longer declares …".
3. **Snake_case mismatch** — PR body/title destructured `pkg/fromRange/ghsaId` from a message that
   carries `package/from_range/ghsa_id` → `undefined` in every PR; fixed + locked with PR-body tests.
4. **Empty-PR edge case** — branch reuse with a vanished dependency would skip the commit and still
   open a PR; now fails the job explicitly.
5. **Invalid SSM resource (caught by `sam validate --lint`)** — `AWS::SSM::Parameter` cannot create
   `SecureString` parameters (only `String`/`StringList`); the template would have failed at deploy
   time. Token creation moved to `deploy.sh` via `aws ssm put-parameter --type SecureString`,
   which also makes re-deploys safe (CloudFormation no longer owns the secret).
6. **(R1/R2 session) Globals cannot carry `Policies`** — SAM's `Globals.Function` rejects a
   `Policies` key (caught by `sam validate --lint`); the X-Ray managed policy is now attached
   per-function alongside each function's inline statement.
7. **(R1/R2 session) `LoggingConfig` uses `LogGroup`, not `LogGroupName`** — cfn-lint E3002 caught
   the invalid property on the Patch function's explicit log group (needed for the job-outcome
   MetricFilters).
8. **(R1/R2 session) Digest races** — two Patch invocations settling concurrently could both send
   the advisory digest; the advisory row now takes a conditional `digestSentAt` write so exactly
   one invoker wins.

---

## What else we can do — phase-wise roadmap

Each phase below is an independent increment; effort is a rough single-engineer estimate.
**Status after the R1–R7 completion session (2026-09-19).**

### R1 — Pre-demo hardening ✅ DONE
- ✅ GitHub Actions workflow for this repo (`.github/workflows/ci.yml`): npm test +
  dashboard build + `sam validate --lint` + `sam build` on push/PR.
- ✅ Mock-GitHub handler tests (`handlers.test.mjs` + `test-helpers.mjs`): Advisor/Impact/Patch/State
  wiring runs end-to-end in CI without AWS via injected fetch + SDK doubles (17 cases).
- ✅ Dead-letter queues on both SQS queues (`MaxReceiveCount: 3`) + DLQ-depth alarms.

### R2 — Observability & operations ✅ DONE
- ✅ Structured JSON logs (`logger.mjs`) with `event`/`ghsaId`/`jobId`/`repo` correlation; demo
  log lines preserved in the `msg` field.
- ✅ CloudWatch dashboard `Sentinel-<stage>`: queue depth, DLQs, PR-created vs job-failed rates,
  Lambda invocations/errors/duration.
- ✅ Alarms: failed jobs > 0 · advisory/patch queue depth ≥ 20 · DLQ non-empty · State + Advisor errors.
- ✅ X-Ray active tracing on all four functions.

### R3 — Coverage correctness ⏳ DEFERRED (explicit non-goal for v1)
- package-lock.json + transitive resolution + monorepos/pnpm/yarn are **out of scope per the master
  prompt** — the biggest remaining item for the product story, but not buildable without the user
  lifting the non-goal. Ask the user before starting.

### R4 — Faster triggers & breadth 🟡 PARTIAL (gating done; ingestion/multi-ecosystem out)
- ✅ Severity gating (`AutoRemediateSeverities`, default `critical,high`; empty string = no gating).
- ⏳ Org webhook ingestion (`security_advisory`/push) and multi-ecosystem adapters remain out of
  scope (non-goals: Dependabot/webhook ingestion, multi-ecosystem).

### R5 — Remediation policy engine 🟡 PARTIAL (auto-merge out)
- ✅ Per-repo `.github/sentinel.json`: exclusions, package exclusions, reviewers, labels.
- ✅ PR grouping: multiple advisories for the same repo+package fold into one PR (body accumulates).
- ✅ PR labels (`security`, `sentinel` + config labels) and the `<!-- sentinel: … -->` metadata comment.
- ⏳ Auto-merge opt-in remains out (non-goal: auto-merge).

### R6 — Notifications & reporting ✅ DONE
- ✅ Per-advisory digest to `NotifyWebhookUrl` (Slack-compatible JSON webhook), exactly once per
  advisory (conditional write), failures never break the pipeline.
- ✅ Weekly org security rollup at `GET /report`: advisories seen, packages, affected repos, PRs
  opened/merged/open/stale, merged-by, top packages (live PR merge state, bounded to 15 PRs).

### R7 — Sentinel's own security posture 🟡 PARTIAL
- ✅ Dependabot config (`.github/dependabot.yml`: npm + github-actions) for this repo.
- ✅ PAT-age watchdog: Advisor `token_check` log + `/state` `tokenAgeDays` (≥90 days warns).
- ✅ Audit-trail rollup: `mergedBy`/`mergedAt` in `GET /report`.
- ⏳ Automatic PAT rotation is impossible to fully automate (GitHub PATs must be created by a
  human) — the watchdog is the honest implementation; re-issuing is a user step.
- ⏳ Secret scanning + Dependabot alerts for this repo: enable in GitHub repo settings (cannot be
  done from a file).

### Still out (per the master prompt, intentionally)
Auto-merge by default · lockfile/transitive analysis in v1 · Dependabot webhook ingestion ·
org-level onboarding UI · any ML-based detection.
