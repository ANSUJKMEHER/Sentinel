#!/usr/bin/env node
// Sentinel end-to-end smoke test (§12).
// POST /advisories/simulate, then poll GET /state until the new advisory's jobs
// all reach patched/failed. Timeout: 120s. Exit 0 iff every job is patched.
//
// Usage: node smoke.mjs <api-url>   (or env API_URL)

const apiUrl = (process.argv[2] || process.env.API_URL || "").replace(/\/+$/, "");
if (!apiUrl) {
  console.error("usage: node smoke.mjs <api-url>");
  process.exit(2);
}

const payload = {
  ghsa_id: "GHSA-jf85-cpcp-j695",
  package: "lodash",
  severity: "high",
  summary: "Command injection in lodash",
  vulnerable_range: ">= 4.0.0, < 4.17.21",
  first_patched_version: "4.17.21",
  cve: "CVE-2021-23337",
};

const t0 = Date.now();
console.log(`▶ POST ${apiUrl}/advisories/simulate — ${payload.package} ${payload.vulnerable_range}`);
const res = await fetch(`${apiUrl}/advisories/simulate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
const queued = await res.json().catch(() => ({}));
if (res.status !== 202) {
  console.error(`❌ simulate failed: HTTP ${res.status}`, queued);
  process.exit(1);
}
const ghsaId = queued.queued?.ghsa_id;
console.log(`✅ 202 — advisory ${ghsaId} queued (${Date.now() - t0}ms). Polling /state…`);

const deadline = Date.now() + 120_000;
for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  let state;
  try {
    const stateRes = await fetch(`${apiUrl}/state`);
    state = await stateRes.json();
  } catch (err) {
    console.warn(`state poll failed (${err.message}), retrying…`);
    continue;
  }

  const jobs = (state.jobs ?? []).filter((j) => j.ghsaId === ghsaId);
  const done = jobs.filter((j) => j.status !== "queued");
  const elapsed = Math.round((Date.now() - t0) / 1000);

  if (jobs.length > 0 && done.length === jobs.length) {
    console.log(`\nAll ${jobs.length} job(s) settled in ${elapsed}s:`);
    for (const j of jobs) {
      const icon = j.status === "patched" ? "✅" : "❌";
      console.log(`${icon} ${j.repo} — ${j.package} ${j.fromRange} → ${j.toVersion} ${j.prUrl ?? j.error ?? ""}`);
    }
    console.log(
      `stats: advisoriesSeen=${state.stats?.advisoriesSeen} reposMonitored=${state.stats?.reposMonitored} prsOpened=${state.stats?.prsOpened}`
    );
    process.exit(jobs.some((j) => j.status === "failed") ? 1 : 0);
  }

  if (Date.now() > deadline) {
    console.error(`❌ timeout after 120s. Jobs so far: ${JSON.stringify(jobs)}`);
    process.exit(1);
  }
  process.stdout.write(`\r  ${elapsed}s — jobs: ${jobs.length} (done: ${done.length})   `);
}
