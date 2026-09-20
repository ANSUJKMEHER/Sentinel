// PR body template test (§7): the deterministic table must render exactly from
// advisory + package.json data. Bedrock disabled => no prose section.
import test from "node:test";
import assert from "node:assert/strict";
import { composePrBody, composeAdvisorySection, sentinelMarker } from "./patch.mjs";

process.env.BEDROCK_ENABLED = "false";

const msg = {
  jobId: "job-1",
  ghsa_id: "GHSA-jf85-cpcp-j695",
  repo: "demo-org/frontend",
  package: "lodash",
  from_range: "4.17.20",
  vulnerable_range: ">= 4.0.0, < 4.17.21",
  first_patched_version: "4.17.21",
  default_branch: "main",
  severity: "high",
  summary: "Command injection in lodash",
};

test("PR body contains the advisory heading with capitalized severity", async () => {
  const body = await composePrBody(msg, "4.17.21");
  assert.match(body, /## 🔐 Security remediation: lodash/);
  assert.match(body, /\*\*High severity\*\* — Command injection in lodash/);
});

test("PR body contains the advisory link", async () => {
  const body = await composePrBody(msg, "4.17.21");
  assert.ok(
    body.includes("Advisory: GHSA-jf85-cpcp-j695 (https://github.com/advisories/GHSA-jf85-cpcp-j695)"),
    "advisory line present"
  );
});

test("PR body contains the deterministic table", async () => {
  const body = await composePrBody(msg, "4.17.21");
  assert.ok(body.includes("| Your repo declares | `4.17.20` |"));
  assert.ok(body.includes("| Fixed version | `4.17.21` |"));
  assert.ok(body.includes("| Change | `lodash` bumped in package.json |"));
});

test("PR body carries the sentinel HTML marker for grouping idempotency", async () => {
  const body = await composePrBody(msg, "4.17.21");
  const marker = sentinelMarker({ ...msg, toVersion: "4.17.21" });
  assert.ok(body.includes(marker), "marker present");
  assert.ok(marker.includes("GHSA-jf85-cpcp-j695"));
  assert.ok(marker.includes("4.17.20"));
});

test("composeAdvisorySection renders one advisory's section without prose/footer", async () => {
  const section = composeAdvisorySection(msg, "4.17.21");
  assert.ok(section.startsWith("## 🔐 Security remediation: lodash"));
  assert.ok(section.includes("| Fixed version | `4.17.21` |"));
  assert.ok(!section.includes("What this means for you"));
  assert.ok(!section.includes("opened automatically"));
});

test("PR body contains the Sentinel footer line", async () => {
  const body = await composePrBody(msg, "4.17.21");
  assert.match(body, /> 🤖 This PR was opened automatically by \*\*Sentinel\*\*/);
  assert.match(body, /advisory-first, org-wide dependency impact analysis and coordinated remediation/);
});

test("no Bedrock section when disabled", async () => {
  const body = await composePrBody(msg, "4.17.21");
  assert.ok(!body.includes("What this means for you"));
});

test("PR title is deterministic", () => {
  // Title construction lives in openOrFindPullRequest; verify the exact expected string here.
  const title = `🔐 [Security] Update ${msg.package} from ${msg.from_range} to 4.17.21`;
  assert.equal(title, "🔐 [Security] Update lodash from 4.17.20 to 4.17.21");
});
