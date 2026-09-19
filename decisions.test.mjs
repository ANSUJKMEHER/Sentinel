// Unit tests for the affect-decision function — the correctness core of Sentinel.
// Run: npm test (or `node --test decisions.test.mjs`)

import test from "node:test";
import assert from "node:assert/strict";
import {
  isRangeAffected,
  findAffectedEntries,
  resolvePatchedVersion,
  bumpPackage,
} from "./decisions.mjs";

const LODASH_VULNERABLE = ">= 4.0.0, < 4.17.21"; // CVE-2021-23337

// ---------------------------------------------------------------- pure range cases (>= 10)
test("exact vulnerable pin is affected", () => {
  assert.equal(isRangeAffected("4.17.20", LODASH_VULNERABLE), true);
});

test("exact safe pin is not affected", () => {
  assert.equal(isRangeAffected("4.17.21", LODASH_VULNERABLE), false);
});

test("caret vulnerable is affected", () => {
  assert.equal(isRangeAffected("^4.17.20", LODASH_VULNERABLE), true);
});

test("caret safe is not affected", () => {
  assert.equal(isRangeAffected("^4.17.21", LODASH_VULNERABLE), false);
});

test("tilde spanning the vulnerable window is affected", () => {
  // ~4.17.0 = >=4.17.0 <4.18.0 — intersects < 4.17.21
  assert.equal(isRangeAffected("~4.17.0", LODASH_VULNERABLE), true);
});

test("tilde above the fix is not affected", () => {
  assert.equal(isRangeAffected("~4.17.21", LODASH_VULNERABLE), false);
});

test("star wildcard is affected", () => {
  assert.equal(isRangeAffected("*", LODASH_VULNERABLE), true);
});

test("range straddle: ^4.0.0 vs < 4.17.21 is affected", () => {
  assert.equal(isRangeAffected("^4.0.0", "< 4.17.21"), true);
});

test("major version below the vulnerable window is not affected", () => {
  assert.equal(isRangeAffected("^3.10.1", LODASH_VULNERABLE), false);
});

test("explicit lower bound at or above fix is not affected", () => {
  assert.equal(isRangeAffected(">= 4.17.21", LODASH_VULNERABLE), false);
});

test("OR range touching the vulnerable window is affected", () => {
  assert.equal(isRangeAffected("3.0.0 || 4.17.20", LODASH_VULNERABLE), true);
});

test("unparseable range is not affected (never a false positive)", () => {
  assert.equal(isRangeAffected("latest", LODASH_VULNERABLE), false);
  assert.equal(isRangeAffected("workspace:*", LODASH_VULNERABLE), false);
  assert.equal(isRangeAffected("", LODASH_VULNERABLE), false);
});

test("unparseable vulnerable range is not affected", () => {
  assert.equal(isRangeAffected("4.17.20", "not a range"), false);
});

test("GitHub-style comma-separated vulnerable range parses correctly", () => {
  // Real GHSA vulnerable_version_range format uses commas.
  assert.equal(isRangeAffected("4.17.20", ">= 4.0.0, < 4.17.21"), true);
  assert.equal(isRangeAffected("4.17.21", ">= 4.0.0, < 4.17.21"), false);
  assert.equal(isRangeAffected("3.5.0", ">= 1.0.0, < 2.0.0 || >= 3.0.0, < 4.0.0"), true);
  assert.equal(isRangeAffected("4.1.0", ">= 1.0.0, < 2.0.0 || >= 3.0.0, < 4.0.0"), false);
});

// ---------------------------------------------------------------- collection cases
test("devDependencies hit is caught", () => {
  const hits = findAffectedEntries(
    { devDependencies: { lodash: "4.17.20" } },
    "lodash",
    LODASH_VULNERABLE
  );
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0], { scope: "devDependencies", declaredRange: "4.17.20" });
});

test("name mismatch is not caught", () => {
  const hits = findAffectedEntries(
    { dependencies: { "lodash-es": "4.17.20" } },
    "lodash",
    LODASH_VULNERABLE
  );
  assert.equal(hits.length, 0);
});

test("safe devDependencies entry is not caught", () => {
  const hits = findAffectedEntries(
    { devDependencies: { lodash: "4.17.21" } },
    "lodash",
    LODASH_VULNERABLE
  );
  assert.equal(hits.length, 0);
});

test("dependencies and devDependencies both scanned, deps preferred", () => {
  const hits = findAffectedEntries(
    { dependencies: { lodash: "4.17.20" }, devDependencies: { lodash: "4.17.20" } },
    "lodash",
    LODASH_VULNERABLE
  );
  assert.equal(hits.length, 2);
  assert.equal(hits.find((h) => h.scope === "dependencies").declaredRange, "4.17.20");
});

// ---------------------------------------------------------------- patched-version resolution
test("first_patched_version wins", () => {
  assert.equal(resolvePatchedVersion("4.17.21", LODASH_VULNERABLE), "4.17.21");
});

test("null first_patched_version falls back to strict upper bound", () => {
  assert.equal(resolvePatchedVersion(null, LODASH_VULNERABLE), "4.17.21");
});

test("range-form first_patched_version resolves to its minimum", () => {
  assert.equal(resolvePatchedVersion(">= 4.17.21", LODASH_VULNERABLE), "4.17.21");
});

test("unparseable first_patched_version and no upper bound => null (never guess)", () => {
  assert.equal(resolvePatchedVersion("not-a-version", ">= 4.0.0"), null);
  assert.equal(resolvePatchedVersion(null, ">= 4.0.0"), null);
  assert.equal(resolvePatchedVersion(null, "<= 4.17.20"), null); // no strict "< X" bound
});

// ---------------------------------------------------------------- bump behaviour
test("bumpPackage patches the exact declared entry and preserves other fields", () => {
  const pkg = {
    name: "demo",
    scripts: { test: "node -e 'process.exit(0)'" },
    dependencies: { lodash: "4.17.20", express: "^4.18.0" },
  };
  const res = bumpPackage(pkg, "lodash", "4.17.20", "4.17.21");
  assert.equal(res.changed, true);
  assert.equal(res.scope, "dependencies");
  assert.equal(pkg.dependencies.lodash, "4.17.21");
  assert.equal(pkg.dependencies.express, "^4.18.0"); // untouched
  assert.equal(pkg.name, "demo");
});

test("bumpPackage prefers dependencies when both scopes match", () => {
  const pkg = { dependencies: { lodash: "4.17.20" }, devDependencies: { lodash: "4.17.20" } };
  const res = bumpPackage(pkg, "lodash", "4.17.20", "4.17.21");
  assert.equal(res.scope, "dependencies");
  assert.equal(pkg.devDependencies.lodash, "4.17.20"); // untouched
});

test("bumpPackage reports missing entries", () => {
  const pkg = { dependencies: { express: "^4.18.0" } };
  const res = bumpPackage(pkg, "lodash", "4.17.20", "4.17.21");
  assert.equal(res.changed, false);
  assert.equal(res.reason, "missing");
});
