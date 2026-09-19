// Pure advisory-impact decision logic — the correctness core of Sentinel.
// Extracted and unit-tested (see decisions.test.mjs).
//
// The rule that matters: a repo is AFFECTED iff
//   semver.intersects(declaredRange, vulnerableRange) === true
// where declaredRange is the version string from package.json
// (e.g. "4.17.20", "^4.17.20", "~4.17.0", "*").

import semver from "semver";

/**
 * Does the range a repo declares intersect the advisory's vulnerable range?
 *
 * @param {string} declaredRange   Version string from package.json.
 * @param {string} vulnerableRange Advisory's vulnerable_version_range.
 * @returns {boolean} true iff affected. Unparseable ranges => false (never a false positive).
 */
/**
 * Normalize a range string for node-semver.
 * GitHub advisories use comma-separated comparator lists (e.g. ">= 4.0.0, < 4.17.21");
 * node-semver only accepts space-separated comparators, so strip the commas.
 * Idempotent for already-valid npm ranges (e.g. "^4.17.20", "3.0.0 || 4.0.0").
 */
export function normalizeRange(range) {
  if (typeof range !== "string") return range;
  return range
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

/** Lower-cased, trimmed severity token ("High" -> "high"). */
export function normalizeSeverity(severity) {
  return typeof severity === "string" ? severity.trim().toLowerCase() : "";
}

/**
 * Parse AUTO_REMEDIATE_SEVERITIES (comma-separated). Empty string => empty list
 * => gating disabled (remediate everything).
 */
export function parseSeverityGate(raw) {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map(normalizeSeverity)
    .filter(Boolean);
}

/**
 * Severity gating (R4): true iff the advisory should be REPORT-ONLY.
 * gate = list of severities that auto-remediate; everything else is gated.
 * An empty gate list means no gating (all severities remediate).
 */
export function isGatedSeverity(severity, gate) {
  const list = Array.isArray(gate) ? gate : [];
  if (list.length === 0) return false;
  return !list.includes(normalizeSeverity(severity));
}

/**
 * Parse a repo policy config (R5) — `.github/sentinel.json`:
 *   { "exclude": false, "excludePackages": ["lodash"], "reviewers": ["octocat"], "labels": ["security"] }
 * Returns a normalized config; unknown fields are dropped, wrong types ignored.
 * @throws {Error} on invalid JSON (callers treat that as "no config" + warn).
 */
export function parseRepoConfig(text) {
  const raw = JSON.parse(text);
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const strList = (v) =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];
  return {
    exclude: obj.exclude === true,
    excludePackages: strList(obj.excludePackages),
    reviewers: strList(obj.reviewers),
    labels: strList(obj.labels),
  };
}

export function isRangeAffected(declaredRange, vulnerableRange) {
  if (typeof declaredRange !== "string" || typeof vulnerableRange !== "string") return false;
  if (declaredRange.trim() === "" || vulnerableRange.trim() === "") return false;
  try {
    const declared = normalizeRange(declaredRange);
    const vulnerable = normalizeRange(vulnerableRange);
    return semver.intersects(declared, vulnerable) === true;
  } catch {
    // Unparseable range (e.g. "latest", "workspace:*") => treat as unaffected, log at call site.
    return false;
  }
}

/**
 * Walk `dependencies` + `devDependencies` of a package.json and return every
 * entry whose package NAME matches `packageName` AND whose declared range is
 * affected by `vulnerableRange`.
 *
 * @returns {{ scope: "dependencies" | "devDependencies", declaredRange: string }[]}
 */
export function findAffectedEntries(pkgJson, packageName, vulnerableRange) {
  const hits = [];
  for (const scope of ["dependencies", "devDependencies"]) {
    const deps = pkgJson?.[scope];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
    for (const [name, declaredRange] of Object.entries(deps)) {
      if (name !== packageName) continue; // name mismatch => not this advisory's package
      if (typeof declaredRange !== "string") continue;
      if (isRangeAffected(declaredRange, vulnerableRange)) {
        hits.push({ scope, declaredRange });
      }
    }
  }
  return hits;
}

/**
 * Resolve the version Sentinel should bump TO.
 *
 * 1. `first_patched_version` from the advisory (authoritative).
 * 2. Otherwise the *strict* upper bound "< X" of the vulnerable range => X.
 *    That is deterministic advisory data (the minimum patched version),
 *    not a guess.
 * 3. Otherwise null => job must fail with "no patched version in advisory".
 *
 * @returns {string | null}
 */
export function resolvePatchedVersion(firstPatchedVersion, vulnerableRange) {
  if (typeof firstPatchedVersion === "string" && firstPatchedVersion.trim()) {
    const v = firstPatchedVersion.trim();
    if (semver.valid(v)) return v;
    const range = semver.validRange(v);
    if (range) {
      const min = semver.minVersion(range);
      if (min) return min.version;
    }
    return null; // provided but unparseable => fail, never write garbage
  }
  if (typeof vulnerableRange === "string") {
    const m = vulnerableRange.match(/<\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Bump `pkgName` in a package.json object to `toVersion`.
 * Deterministic: patches exactly where the declared range matches `fromRange`,
 * preferring `dependencies` over `devDependencies`.
 *
 * @returns {{ changed: boolean, scope: string | null, reason: "bumped" | "missing" | "already", pkg: object }}
 */
export function bumpPackage(pkgJson, pkgName, fromRange, toVersion) {
  const scopes = ["dependencies", "devDependencies"];

  // Exact match on the declared range first.
  for (const scope of scopes) {
    const deps = pkgJson?.[scope];
    if (deps && typeof deps === "object" && deps[pkgName] === fromRange) {
      deps[pkgName] = toVersion;
      return { changed: true, scope, reason: "bumped", pkg: pkgJson };
    }
  }

  // Entry present but range drifted (e.g. a human already bumped it).
  for (const scope of scopes) {
    const deps = pkgJson?.[scope];
    if (deps && typeof deps === "object" && pkgName in deps) {
      if (deps[pkgName] === toVersion) {
        return { changed: false, scope, reason: "already", pkg: pkgJson };
      }
      deps[pkgName] = toVersion;
      return { changed: true, scope, reason: "bumped", pkg: pkgJson };
    }
  }

  return { changed: false, scope: null, reason: "missing", pkg: pkgJson };
}
