// Policy + notification unit tests (R4 severity gating, R5 repo config, R6 digest).
import test from "node:test";
import assert from "node:assert/strict";
import { isGatedSeverity, parseSeverityGate, parseRepoConfig } from "./decisions.mjs";
import { composeDigestText } from "./notify.mjs";

// ---------------------------------------------------------------- severity gating (R4)
test("parseSeverityGate splits and normalizes", () => {
  assert.deepEqual(parseSeverityGate("critical, High ,moderate"), ["critical", "high", "moderate"]);
  assert.deepEqual(parseSeverityGate(""), []);
  assert.deepEqual(parseSeverityGate("  , , "), []);
  assert.deepEqual(parseSeverityGate(undefined), []);
});

test("critical/high auto-remediate under the default gate", () => {
  const gate = ["critical", "high"];
  assert.equal(isGatedSeverity("critical", gate), false);
  assert.equal(isGatedSeverity("HIGH", gate), false);
  assert.equal(isGatedSeverity("high", gate), false);
});

test("moderate/low are report-only under the default gate", () => {
  const gate = ["critical", "high"];
  assert.equal(isGatedSeverity("moderate", gate), true);
  assert.equal(isGatedSeverity("low", gate), true);
  assert.equal(isGatedSeverity("unknown", gate), true);
});

test("empty gate list means no gating (remediate everything)", () => {
  assert.equal(isGatedSeverity("low", []), false);
  assert.equal(isGatedSeverity("critical", null), false);
});

// ---------------------------------------------------------------- repo policy config (R5)
test("parseRepoConfig parses a full config", () => {
  const cfg = parseRepoConfig(
    JSON.stringify({
      exclude: true,
      excludePackages: ["lodash", " left-pad "],
      reviewers: ["octocat", "hubot"],
      labels: ["security", "needs-review"],
    })
  );
  assert.deepEqual(cfg, {
    exclude: true,
    excludePackages: ["lodash", "left-pad"],
    reviewers: ["octocat", "hubot"],
    labels: ["security", "needs-review"],
  });
});

test("parseRepoConfig defaults when fields are missing", () => {
  const cfg = parseRepoConfig("{}");
  assert.deepEqual(cfg, { exclude: false, excludePackages: [], reviewers: [], labels: [] });
});

test("parseRepoConfig ignores wrong-typed and unknown fields", () => {
  const cfg = parseRepoConfig(
    JSON.stringify({ exclude: "yes", excludePackages: [1, "lodash", ""], unknown: 42, reviewers: "octocat" })
  );
  assert.deepEqual(cfg, { exclude: false, excludePackages: ["lodash"], reviewers: [], labels: [] });
});

test("parseRepoConfig throws on invalid JSON", () => {
  assert.throws(() => parseRepoConfig("{not json"), SyntaxError);
});

test("parseRepoConfig tolerates a JSON array/scalar", () => {
  assert.deepEqual(parseRepoConfig("[1,2]"), { exclude: false, excludePackages: [], reviewers: [], labels: [] });
});

// ---------------------------------------------------------------- digest text (R6)
test("composeDigestText lists PRs and failures", () => {
  const text = composeDigestText({
    ghsaId: "GHSA-jf85-cpcp-j695",
    package: "lodash",
    severity: "high",
    summary: "Command injection in lodash",
    jobs: [
      { repo: "demo/frontend", status: "patched", prNumber: 12 },
      { repo: "demo/backend", status: "patched", prNumber: 13 },
      { repo: "demo/analytics", status: "failed", error: "package.json fetch HTTP 404" },
    ],
  });
  assert.ok(text.includes("🔐 Sentinel — advisory GHSA-jf85-cpcp-j695 (lodash, high)"));
  assert.ok(text.includes("2 remediation PR(s): #12, #13"));
  assert.ok(text.includes("1 job(s) failed"));
  assert.ok(text.includes("❌ demo/analytics: package.json fetch HTTP 404"));
});

test("composeDigestText handles zero PRs and missing summary", () => {
  const text = composeDigestText({
    ghsaId: "GHSA-x",
    package: "lodash",
    severity: "moderate",
    summary: "",
    jobs: [{ repo: "demo/frontend", status: "failed", error: "boom" }],
  });
  assert.ok(text.includes("0 remediation PR(s) · 1 job(s) failed"));
  assert.ok(!text.includes("undefined"));
});
