// Weekly report aggregation tests (R6/R7) — pure buildReport function.
import test from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "./report.mjs";

const NOW = new Date("2026-09-19T12:00:00Z");
const DAY = 24 * 60 * 60;

const isoDaysAgo = (n) => new Date(NOW.getTime() - n * DAY * 1000).toISOString();
const tsDaysAgo = (n) => Math.floor((NOW.getTime() - n * DAY * 1000) / 1000);

function sample() {
  return {
    advisories: [
      { ghsa_id: "GHSA-1", package: "lodash", severity: "high", publishedAt: isoDaysAgo(1) },
      { ghsa_id: "GHSA-2", package: "lodash", severity: "critical", publishedAt: isoDaysAgo(3) },
      { ghsa_id: "GHSA-3", package: "express", severity: "high", publishedAt: isoDaysAgo(10) }, // outside window
    ],
    repos: [
      { repo: "demo/frontend" },
      { repo: "demo/backend" },
      { repo: "demo/internal-tool", excluded: true },
    ],
    jobs: [
      { jobId: "j1", ghsaId: "GHSA-1", repo: "demo/frontend", package: "lodash", status: "patched", prNumber: 1, updatedAt: tsDaysAgo(1) },
      { jobId: "j2", ghsaId: "GHSA-2", repo: "demo/backend", package: "lodash", status: "patched", prNumber: 2, updatedAt: tsDaysAgo(2) },
      { jobId: "j3", ghsaId: "GHSA-3", repo: "demo/frontend", package: "express", status: "patched", prNumber: 3, updatedAt: tsDaysAgo(9) },
      { jobId: "j4", ghsaId: "GHSA-2", repo: "demo/analytics", package: "lodash", status: "failed", error: "boom", updatedAt: tsDaysAgo(2) },
    ],
    prDetails: new Map([
      ["j1", { merged: true, mergedBy: "octocat", mergedAt: isoDaysAgo(1) }],
      ["j2", { merged: false, mergedBy: null, mergedAt: null }], // open 2 days — not stale
      ["j3", { merged: false, mergedBy: null, mergedAt: null }], // open 9 days — stale
    ]),
    now: NOW,
  };
}

test("buildReport filters advisories and jobs to the 7-day window", () => {
  const r = buildReport(sample());
  assert.equal(r.advisoriesSeen, 2); // GHSA-3 is outside the window
  assert.equal(r.advisoriesTotal, 3);
  assert.deepEqual(r.packagesAffected, ["lodash"]);
  assert.deepEqual(r.reposAffected, ["demo/analytics", "demo/backend", "demo/frontend"]);
  assert.equal(r.prsOpened, 2); // j1 + j2 are in-window; j3 is 9 days old -> outside
  assert.equal(r.jobsFailed, 1);
});

test("buildReport classifies merged / open / stale PRs", () => {
  const r = buildReport(sample());
  assert.equal(r.prsMerged, 1); // j1 merged this week
  assert.equal(r.prsOpen, 2); // j2 (2 days) + j3 (9 days, outside window but still open)
  assert.equal(r.prsStale, 1); // j3
  assert.deepEqual(r.mergedBy, { octocat: 1 });
});

test("buildReport marks open PRs older than 7 days as stale", () => {
  const s = sample();
  s.advisories.push({ ghsa_id: "GHSA-4", package: "express", severity: "high", publishedAt: isoDaysAgo(1) });
  s.jobs.push({
    jobId: "j5", ghsaId: "GHSA-4", repo: "demo/backend", package: "express",
    status: "patched", prNumber: 4, updatedAt: tsDaysAgo(9),
  });
  s.prDetails.set("j5", { merged: false, mergedBy: null, mergedAt: null });
  const r = buildReport(s);
  assert.equal(r.prsOpen, 3); // j2 + j3 + j5
  assert.equal(r.prsStale, 2); // j3 + j5
});

test("buildReport tallies top packages and exclusions", () => {
  const r = buildReport(sample());
  assert.deepEqual(r.topPackages, [{ package: "lodash", advisories: 2 }]);
  assert.equal(r.reposMonitored, 3);
  assert.equal(r.reposExcluded, 1);
});

test("buildReport defaults are safe for empty inputs", () => {
  const r = buildReport({ now: NOW });
  assert.equal(r.advisoriesSeen, 0);
  assert.equal(r.prsOpened, 0);
  assert.equal(r.prsMerged, 0);
  assert.deepEqual(r.topPackages, []);
  assert.ok(r.range.from < r.range.to);
});
