// Weekly org security report aggregation (R6/R7) — pure and unit-tested.
// Consumes already-unmarshalled rows from state.mjs; no AWS, no GitHub here.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Aggregate a weekly security rollup for the org.
 *
 * @param {{
 *   advisories: {ghsa_id: string, package: string, severity: string, publishedAt?: string, action?: string}[],
 *   repos: {repo: string, excluded?: boolean}[],
 *   jobs: {ghsaId: string, repo: string, package: string, status: string, prNumber?: number|null, updatedAt?: number, error?: string}[],
 *   prDetails?: Map<string, {merged: boolean, mergedBy?: string|null, mergedAt?: string|null}>,
 *   now?: Date
 * }} input
 * @returns {object}
 */
export function buildReport({ advisories = [], repos = [], jobs = [], prDetails = new Map(), now = new Date() }) {
  const nowIso = now.toISOString();
  const windowStart = new Date(now.getTime() - WEEK_MS).toISOString();

  const inWindow = (iso) => typeof iso === "string" && iso >= windowStart && iso <= nowIso;

  const advisoriesInWindow = advisories.filter((a) => inWindow(a.publishedAt));
  const jobsInWindow = jobs.filter(
    (j) => inWindow(new Date((j.updatedAt ?? 0) * 1000).toISOString()) && (j.updatedAt ?? 0) > 0
  );
  const patchedJobs = jobsInWindow.filter((j) => j.status === "patched");

  const staleAgeMs = 7 * 24 * 60 * 60 * 1000; // open PRs older than this are "stale"
  let prsMerged = 0;
  let prsOpen = 0;
  let prsStale = 0;
  const mergedBy = new Map();

  // Open/stale classification spans ALL Sentinel PRs (a stale PR is by
  // definition >7 days old); the merged count reflects this week's activity.
  const patchedAll = jobs.filter((j) => j.status === "patched");
  for (const j of patchedAll) {
    if (j.prNumber == null) continue;
    const d = prDetails.get(j.jobId);
    const inWin = (j.updatedAt ?? 0) > 0 && inWindow(new Date((j.updatedAt ?? 0) * 1000).toISOString());
    if (d?.merged) {
      if (inWin) prsMerged += 1;
      if (d.mergedBy) mergedBy.set(d.mergedBy, (mergedBy.get(d.mergedBy) ?? 0) + 1);
    } else {
      prsOpen += 1;
      const ageMs = now.getTime() - (j.updatedAt ?? 0) * 1000;
      if (ageMs > staleAgeMs) prsStale += 1;
    }
  }

  const topPackages = [];
  const pkgCounts = new Map();
  for (const a of advisoriesInWindow) {
    pkgCounts.set(a.package, (pkgCounts.get(a.package) ?? 0) + 1);
  }
  for (const [pkg, n] of [...pkgCounts.entries()].sort((x, y) => y[1] - x[1])) {
    topPackages.push({ package: pkg, advisories: n });
  }

  return {
    range: { from: windowStart, to: nowIso },
    advisoriesSeen: advisoriesInWindow.length,
    advisoriesTotal: advisories.length,
    packagesAffected: [...new Set(advisoriesInWindow.map((a) => a.package))].sort(),
    reposMonitored: repos.length,
    reposExcluded: repos.filter((r) => r.excluded).length,
    reposAffected: [...new Set(jobsInWindow.map((j) => j.repo))].sort(),
    prsOpened: patchedJobs.length,
    prsMerged,
    prsOpen,
    prsStale,
    jobsFailed: jobsInWindow.filter((j) => j.status === "failed").length,
    mergedBy: Object.fromEntries([...mergedBy.entries()].sort((x, y) => y[1] - x[1])),
    topPackages,
  };
}
