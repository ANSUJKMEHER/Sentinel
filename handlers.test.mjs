// Mock-GitHub handler wiring tests (R1): Advisor / Impact / Patch / State run
// end-to-end against injected fetch + SDK doubles — no AWS, no network.
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { __setFetcherForTests, __setTokenForTests, __clearTestHooks } from "./github.mjs";
import { handler as advisorHandler, __test as advisorTest } from "./advisor.mjs";
import { handler as impactHandler, __test as impactTest } from "./impact.mjs";
import { handler as patchHandler, __test as patchTest } from "./patch.mjs";
import { handler as stateHandler, __test as stateTest } from "./state.mjs";
import { FakeGithub, FakeDynamo, FakeSqs, fakeResponse, contentsEnvelope } from "./test-helpers.mjs";

process.env.ADVISORIES_TABLE = "AdvisoriesTable";
process.env.ADVISORY_QUEUE_URL = "https://sqs.local/advisory-q";
process.env.REPOS_TABLE = "ReposTable";
process.env.JOBS_TABLE = "JobsTable";
process.env.PATCH_QUEUE_URL = "https://sqs.local/patch-q";
process.env.GITHUB_ORG = "demo-org";
process.env.BEDROCK_ENABLED = "false";
delete process.env.NOTIFY_WEBHOOK_URL;

const ADVISORY_MSG = {
  ghsa_id: "GHSA-jf85-cpcp-j695",
  package: "lodash",
  severity: "high",
  summary: "Command injection in lodash",
  vulnerable_range: ">= 4.0.0, < 4.17.21",
  first_patched_version: "4.17.21",
  source: "cron",
};

const PATCH_MSG = {
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

const repoItem = (name, lodashVersion) => ({
  full_name: `demo-org/${name}`,
  name,
  default_branch: "main",
  private: true,
  archived: false,
  fork: false,
  lodashVersion,
});

let github, dynamo, sqs;

beforeEach(() => {
  github = new FakeGithub();
  dynamo = new FakeDynamo();
  sqs = new FakeSqs();
  __setFetcherForTests(github.handler());
  __setTokenForTests("fake-token");
  advisorTest.dynamo = dynamo;
  advisorTest.sqs = sqs;
  impactTest.dynamo = dynamo;
  impactTest.sqs = sqs;
  patchTest.dynamo = dynamo;
  stateTest.dynamo = dynamo;
  stateTest.sqs = sqs;
});

afterEach(() => {
  __clearTestHooks();
  advisorTest.dynamo = null;
  advisorTest.sqs = null;
  impactTest.dynamo = null;
  impactTest.sqs = null;
  patchTest.dynamo = null;
  stateTest.dynamo = null;
  stateTest.sqs = null;
  delete process.env.AUTO_REMEDIATE_SEVERITIES;
  delete process.env.NOTIFY_WEBHOOK_URL;
});

// ================================================================ Advisor (R1)
const advisoryRow = (ghsaId, severity, pkg, range) => ({
  ghsa_id: ghsaId,
  severity,
  summary: `${pkg} vuln`,
  published_at: "2026-09-19T00:00:00Z",
  vulnerabilities: [
    { package: { ecosystem: "npm", name: pkg }, vulnerable_version_range: range, first_patched_version: "4.17.21" },
  ],
});

test("advisor: stores new advisories, queues remediate-severity ones, gates the rest", async () => {
  process.env.AUTO_REMEDIATE_SEVERITIES = "critical,high";
  github.on("GET", /\/advisories\?/, () =>
    fakeResponse(200, [
      advisoryRow("GHSA-high", "high", "lodash", ">= 4.0.0, < 4.17.21"),
      advisoryRow("GHSA-mid", "moderate", "express", ">= 4.0.0, < 4.19.0"),
    ])
  );

  const result = await advisorHandler();

  const puts = dynamo.callsWhere("PutItemCommand");
  assert.equal(puts.length, 2);
  assert.equal(puts[0].Item.ghsa_id.S, "GHSA-high");
  assert.equal(puts[0].Item.action.S, "remediate");
  assert.equal(puts[1].Item.ghsa_id.S, "GHSA-mid");
  assert.equal(puts[1].Item.action.S, "report");
  assert.ok(puts[0].ConditionExpression.includes("attribute_not_exists"));

  const messages = sqs.messages();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].ghsa_id, "GHSA-high");
  assert.equal(messages[0].package, "lodash");
  assert.equal(messages[0].vulnerable_range, ">= 4.0.0, < 4.17.21");
  assert.equal(messages[0].first_patched_version, "4.17.21");
  assert.equal(messages[0].source, "cron");
  assert.equal(result.newCount, 1);
  assert.equal(result.gatedCount, 1);
});

test("advisor: empty gate remediates every severity", async () => {
  process.env.AUTO_REMEDIATE_SEVERITIES = "";
  github.on("GET", /\/advisories\?/, () =>
    fakeResponse(200, [advisoryRow("GHSA-low", "low", "express", ">= 4.0.0, < 4.19.0")])
  );

  await advisorHandler();

  const puts = dynamo.callsWhere("PutItemCommand");
  assert.equal(puts[0].Item.action.S, "remediate");
  assert.equal(sqs.messages().length, 1);
});

test("advisor: dedupe skips already-stored advisories (no re-queue)", async () => {
  process.env.AUTO_REMEDIATE_SEVERITIES = "critical,high";
  dynamo.conditionFailKeys.add("AdvisoriesTable/GHSA-high");
  github.on("GET", /\/advisories\?/, () =>
    fakeResponse(200, [advisoryRow("GHSA-high", "high", "lodash", ">= 4.0.0, < 4.17.21")])
  );

  const result = await advisorHandler();

  assert.equal(dynamo.callsWhere("PutItemCommand").length, 1); // attempt made...
  assert.equal(sqs.messages().length, 0); // ...but dedupe blocked the queue
  assert.equal(result.newCount, 0);
});

test("advisor: non-npm or empty entries are skipped", async () => {
  github.on("GET", /\/advisories\?/, () =>
    fakeResponse(200, [
      { ghsa_id: "GHSA-x", severity: "high", vulnerabilities: [{ package: { ecosystem: "pip", name: "requests" } }] },
      { ghsa_id: "GHSA-y", severity: "high", vulnerabilities: [] },
    ])
  );
  await advisorHandler();
  assert.equal(dynamo.callsWhere("PutItemCommand").length, 0);
  assert.equal(sqs.messages().length, 0);
});

// ================================================================ Impact (R1+R5)
test("impact: affected repo gets a queued job + policy extras ride the patch message", async () => {
  github
    .on("GET", /\/orgs\/demo-org\/repos/, () =>
      fakeResponse(200, [repoItem("frontend", "4.17.20"), repoItem("mobile-api", "4.17.21")])
    )
    .on("GET", /demo-org\/frontend\/contents\/\.github\/sentinel\.json/, () =>
      fakeResponse(200, JSON.stringify({ reviewers: ["octocat"], labels: ["needs-review"] }))
    )
    .on("GET", /demo-org\/mobile-api\/contents\/\.github\/sentinel\.json/, () => fakeResponse(404, {}))
    .on("GET", /demo-org\/frontend\/contents\/package\.json/, () =>
      fakeResponse(200, JSON.stringify({ dependencies: { lodash: "4.17.20" } }))
    )
    .on("GET", /demo-org\/mobile-api\/contents\/package\.json/, () =>
      fakeResponse(200, JSON.stringify({ dependencies: { lodash: "4.17.21" } }))
    );

  const res = await impactHandler({ Records: [{ body: JSON.stringify(ADVISORY_MSG), messageId: "m1" }] });

  assert.equal(res.results[0].error, undefined);
  assert.equal(res.results[0].affected, 1);
  assert.equal(res.results[0].total, 2);

  const repoPuts = dynamo.callsWhere("PutItemCommand").filter((p) => p.TableName === "ReposTable");
  assert.equal(repoPuts.length, 2);
  assert.equal(repoPuts[0].Item.repo.S, "demo-org/frontend");
  assert.equal(repoPuts[0].Item.defaultBranch.S, "main");

  const jobPuts = dynamo.callsWhere("PutItemCommand").filter((p) => p.TableName === "JobsTable");
  assert.equal(jobPuts.length, 1);
  assert.equal(jobPuts[0].Item.status.S, "queued");
  assert.equal(jobPuts[0].Item.fromRange.S, "4.17.20");
  assert.equal(jobPuts[0].Item.toVersion.S, "4.17.21");
  assert.equal(jobPuts[0].Item.repo.S, "demo-org/frontend");

  const messages = sqs.messages();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].jobId, jobPuts[0].Item.jobId.S);
  assert.equal(messages[0].repo, "demo-org/frontend");
  assert.deepEqual(messages[0].reviewers, ["octocat"]);
  assert.deepEqual(messages[0].labels, ["needs-review"]);
});

test("impact: repo excluded by policy is skipped without a package.json fetch", async () => {
  github
    .on("GET", /\/orgs\/demo-org\/repos/, () => fakeResponse(200, [repoItem("frontend", "4.17.20")]))
    .on("GET", /demo-org\/frontend\/contents\/\.github\/sentinel\.json/, () =>
      fakeResponse(200, JSON.stringify({ exclude: true }))
    );

  const res = await impactHandler({ Records: [{ body: JSON.stringify(ADVISORY_MSG), messageId: "m1" }] });

  assert.equal(res.results[0].error, undefined);
  assert.equal(res.results[0].affected, 0);
  const repoPuts = dynamo.callsWhere("PutItemCommand").filter((p) => p.TableName === "ReposTable");
  assert.equal(repoPuts.length, 2); // registry row + excluded flag row
  assert.equal(repoPuts[1].Item.excluded.BOOL, true);
  assert.equal(dynamo.callsWhere("PutItemCommand").filter((p) => p.TableName === "JobsTable").length, 0);
  assert.equal(sqs.messages().length, 0);
});

test("impact: package excluded by policy yields no job", async () => {
  github
    .on("GET", /\/orgs\/demo-org\/repos/, () => fakeResponse(200, [repoItem("frontend", "4.17.20")]))
    .on("GET", /demo-org\/frontend\/contents\/\.github\/sentinel\.json/, () =>
      fakeResponse(200, JSON.stringify({ excludePackages: ["lodash"] }))
    )
    .on("GET", /demo-org\/frontend\/contents\/package\.json/, () =>
      fakeResponse(200, JSON.stringify({ dependencies: { lodash: "4.17.20" } }))
    );

  const res = await impactHandler({ Records: [{ body: JSON.stringify(ADVISORY_MSG), messageId: "m1" }] });

  assert.equal(res.results[0].affected, 0);
  assert.equal(dynamo.callsWhere("PutItemCommand").filter((p) => p.TableName === "JobsTable").length, 0);
});

// ================================================================ Patch (R1+R5)
function patchRoutes() {
  let prBody = null;
  github
    .on("GET", /demo-org\/frontend\/contents\/package\.json\?ref=main/, () =>
      fakeResponse(200, contentsEnvelope("sha-default", { dependencies: { lodash: "4.17.20" } }))
    )
    .on("GET", /demo-org\/frontend\/git\/ref\/heads\/main/, () => fakeResponse(200, { object: { sha: "basesha" } }))
    .on("POST", /demo-org\/frontend\/git\/refs$/, () => fakeResponse(201, { ref: "refs/heads/security/lodash-GHSA-jf85-cpcp-j695" }))
    .on("PUT", /demo-org\/frontend\/contents\/package\.json$/, () => fakeResponse(201, {}))
    .on("POST", /demo-org\/frontend\/pulls$/, (m, init) => {
      prBody = JSON.parse(init.body).body;
      return fakeResponse(201, { number: 1, html_url: "https://github.com/demo-org/frontend/pull/1" });
    })
    .on("POST", /demo-org\/frontend\/issues\/1\/labels/, (m, init) =>
      fakeResponse(200, { labels: JSON.parse(init.body).labels })
    );
  return () => prBody;
}

test("patch: creates branch, commits exact bump, opens PR with labels + marker", async () => {
  const getPrBody = patchRoutes();
  const result = await patchHandler({ Records: [{ body: JSON.stringify(PATCH_MSG), messageId: "m1" }] });

  assert.equal(result.processed, 1);

  // Job marked patched with PR info.
  const updates = dynamo.callsWhere("UpdateItemCommand");
  const jobUpdate = updates.find((u) => u.Key.jobId.S === "job-1");
  assert.ok(jobUpdate);
  assert.equal(jobUpdate.ExpressionAttributeValues[":st"].S, "patched");
  assert.equal(jobUpdate.ExpressionAttributeValues[":pr"].N, "1");

  // Commit body: lodash pinned to exactly 4.17.21, everything else intact.
  const commit = github.calls.find((c) => c.method === "PUT" && /contents\/package\.json$/.test(c.url));
  const committed = JSON.parse(Buffer.from(JSON.parse(commit.init.body).content, "base64").toString("utf8"));
  assert.equal(committed.dependencies.lodash, "4.17.21");

  // PR body: metadata marker + advisory section + footer; labels applied.
  const body = getPrBody();
  assert.ok(body.includes("<!-- sentinel:"));
  assert.ok(body.includes("GHSA-jf85-cpcp-j695"));
  assert.ok(body.includes("## 🔐 Security remediation: lodash"));
  const labelCall = github.calls.find((c) => /issues\/1\/labels/.test(c.url));
  assert.deepEqual(JSON.parse(labelCall.init.body).labels, ["security", "sentinel"]);
});

test("patch: 422 on labels triggers label creation then retry", async () => {
  let defaultDeps = { dependencies: { lodash: "4.17.20" } };
  let labelTries = 0;
  github
    .on("GET", /demo-org\/frontend\/contents\/package\.json\?ref=main/, () =>
      fakeResponse(200, contentsEnvelope("sha-default", defaultDeps))
    )
    .on("GET", /demo-org\/frontend\/git\/ref\/heads\/main/, () => fakeResponse(200, { object: { sha: "basesha" } }))
    .on("POST", /demo-org\/frontend\/git\/refs$/, () => fakeResponse(201, { ref: "refs/heads/x" }))
    .on("PUT", /demo-org\/frontend\/contents\/package\.json$/, () => fakeResponse(201, {}))
    .on("POST", /demo-org\/frontend\/pulls$/, () => fakeResponse(201, { number: 1, html_url: "https://github.com/demo-org/frontend/pull/1" }))
    .on("POST", /demo-org\/frontend\/labels/, () => fakeResponse(201, {}))
    .on("POST", /demo-org\/frontend\/issues\/1\/labels/, () => {
      labelTries += 1;
      return labelTries === 1 ? fakeResponse(422, {}) : fakeResponse(200, {});
    });

  await patchHandler({ Records: [{ body: JSON.stringify(PATCH_MSG), messageId: "m1" }] });

  assert.equal(labelTries, 2, "labels applied after one 422 retry");
  const labelCreates = github.calls.filter((c) => /demo-org\/frontend\/labels$/.test(c.url) && c.method === "POST");
  assert.equal(labelCreates.length, 2, "both default labels created");
  assert.deepEqual(
    labelCreates.map((c) => JSON.parse(c.init.body).name).sort(),
    ["security", "sentinel"]
  );
});

test("patch: reuses existing PR and folds a second advisory into the body (grouping)", async () => {
  let defaultDeps = { dependencies: { lodash: "4.17.20" } };
  let branchDeps = null;
  let refCreations = 0;
  let prBody = null;

  github
    .on("GET", /demo-org\/frontend\/contents\/package\.json\?ref=main/, () =>
      fakeResponse(200, contentsEnvelope("sha-default", defaultDeps))
    )
    .on("GET", /demo-org\/frontend\/contents\/package\.json\?ref=security/, () =>
      branchDeps ? fakeResponse(200, contentsEnvelope("sha-branch", branchDeps)) : fakeResponse(404, {})
    )
    .on("GET", /demo-org\/frontend\/git\/ref\/heads\/main/, () => fakeResponse(200, { object: { sha: "basesha" } }))
    .on("POST", /demo-org\/frontend\/git\/refs$/, () => {
      refCreations += 1;
      return refCreations === 1
        ? fakeResponse(201, { ref: "refs/heads/security/lodash-GHSA-jf85-cpcp-j695" })
        : fakeResponse(422, { message: "Reference already exists" });
    })
    .on("PUT", /demo-org\/frontend\/contents\/package\.json$/, () => fakeResponse(201, {}))
    .on("POST", /demo-org\/frontend\/pulls$/, (m, init) => {
      if (prBody !== null) return fakeResponse(422, { message: "A pull request already exists" });
      prBody = JSON.parse(init.body).body;
      return fakeResponse(201, { number: 1, html_url: "https://github.com/demo-org/frontend/pull/1" });
    })
    .on("GET", /demo-org\/frontend\/pulls\?state=open/, () =>
      fakeResponse(200, [{ number: 1, html_url: "https://github.com/demo-org/frontend/pull/1", body: prBody }])
    )
    .on("GET", /demo-org\/frontend\/pulls\/1$/, () => fakeResponse(200, { body: prBody }))
    .on("PATCH", /demo-org\/frontend\/pulls\/1$/, (m, init) => {
      prBody = JSON.parse(init.body).body;
      return fakeResponse(200, { body: prBody });
    })
    .on("POST", /demo-org\/frontend\/issues\/1\/labels/, () => fakeResponse(200, {}));

  await patchHandler({ Records: [{ body: JSON.stringify(PATCH_MSG), messageId: "m1" }] });
  assert.ok(prBody.includes("GHSA-jf85-cpcp-j695"));

  // Second advisory, same repo+package: default branch is now at 4.17.21,
  // branch exists carrying 4.17.21, PR exists — the body must accumulate.
  defaultDeps = { dependencies: { lodash: "4.17.21" } };
  branchDeps = { dependencies: { lodash: "4.17.21" } };
  const second = {
    ...PATCH_MSG,
    jobId: "job-2",
    ghsa_id: "GHSA-aaaa-bbbb-cccc",
    from_range: "4.17.21",
    first_patched_version: "4.17.22",
  };
  await patchHandler({ Records: [{ body: JSON.stringify(second), messageId: "m2" }] });

  assert.ok(prBody.includes("GHSA-jf85-cpcp-j695"), "first advisory retained");
  assert.ok(prBody.includes("GHSA-aaaa-bbbb-cccc"), "second advisory appended");
  assert.equal(refCreations, 2);
  assert.equal(
    dynamo.callsWhere("UpdateItemCommand").filter((u) => u.Key.jobId.S === "job-2" && u.ExpressionAttributeValues[":st"].S === "patched").length,
    1
  );
});

test("patch: failure marks the job failed and never throws", async () => {
  github.on("GET", /demo-org\/frontend\/contents\/package\.json\?ref=main/, () => fakeResponse(404, {}));

  const result = await patchHandler({ Records: [{ body: JSON.stringify(PATCH_MSG), messageId: "m1" }] });

  assert.equal(result.processed, 1);
  const jobUpdate = dynamo.callsWhere("UpdateItemCommand").find((u) => u.Key.jobId.S === "job-1");
  assert.equal(jobUpdate.ExpressionAttributeValues[":st"].S, "failed");
  assert.ok(jobUpdate.ExpressionAttributeValues[":err"].S.length > 0);
});

test("patch: marks one digest when the last job settles and webhook is configured", async () => {
  patchRoutes();
  process.env.NOTIFY_WEBHOOK_URL = "http://127.0.0.1:9/discard";
  dynamo.scanItems["JobsTable"] = [
    { jobId: { S: "job-1" }, ghsaId: { S: "GHSA-jf85-cpcp-j695" }, status: { S: "patched" }, prNumber: { N: "1" } },
  ];

  await patchHandler({ Records: [{ body: JSON.stringify(PATCH_MSG), messageId: "m1" }] });

  // Scan checked for unsettled jobs, digest marked once on the advisory row.
  assert.ok(dynamo.calls.some((c) => c.name === "ScanCommand"));
  const advisoryUpdates = dynamo
    .callsWhere("UpdateItemCommand")
    .filter((u) => u.TableName === "AdvisoriesTable");
  assert.equal(advisoryUpdates.length, 1);
  assert.ok(advisoryUpdates[0].UpdateExpression.includes("digestSentAt"));
  assert.ok(advisoryUpdates[0].ConditionExpression.includes("attribute_not_exists"));
});

// ================================================================ State (R1+R4+R6)
const httpEvent = (method, path, body) => ({
  requestContext: { http: { method, path } },
  body: body ? JSON.stringify(body) : undefined,
});

test("state: simulate validates, suffixes the id, queues, returns 202", async () => {
  process.env.AUTO_REMEDIATE_SEVERITIES = "critical,high";
  const payload = {
    ghsa_id: "GHSA-jf85-cpcp-j695",
    package: "lodash",
    severity: "high",
    summary: "Command injection in lodash",
    vulnerable_range: ">= 4.0.0, < 4.17.21",
    first_patched_version: "4.17.21",
  };

  const res = await stateHandler(httpEvent("POST", "/advisories/simulate", payload));
  assert.equal(res.statusCode, 202);

  const body = JSON.parse(res.body);
  assert.match(body.queued.ghsa_id, /^GHSA-jf85-cpcp-j695-sim-\d+$/);
  assert.equal(body.action, "remediate");

  const put = dynamo.callsWhere("PutItemCommand")[0];
  assert.equal(put.Item.source.S, "simulate");
  assert.equal(put.Item.action.S, "remediate");
  assert.equal(sqs.messages().length, 1);
  assert.equal(sqs.messages()[0].ghsa_id, body.queued.ghsa_id);
});

test("state: simulate of a report-only severity stores without queueing", async () => {
  process.env.AUTO_REMEDIATE_SEVERITIES = "critical,high";
  const payload = {
    ghsa_id: "GHSA-x",
    package: "lodash",
    severity: "moderate",
    summary: "s",
    vulnerable_range: ">= 4.0.0, < 4.17.21",
  };

  const res = await stateHandler(httpEvent("POST", "/advisories/simulate", payload));
  assert.equal(res.statusCode, 202);
  assert.equal(JSON.parse(res.body).action, "report");
  assert.equal(dynamo.callsWhere("PutItemCommand")[0].Item.action.S, "report");
  assert.equal(sqs.messages().length, 0);
});

test("state: invalid simulate payload is rejected with 400", async () => {
  const res = await stateHandler(httpEvent("POST", "/advisories/simulate", { package: "lodash" }));
  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.equal(body.error, "invalid simulate payload");
  assert.ok(Array.isArray(body.details));
});

test("state: GET /state serves empty tables with token configured", async () => {
  const res = await stateHandler(httpEvent("GET", "/state"));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.stats, { advisoriesSeen: 0, reposMonitored: 0, prsOpened: 0 });
  assert.equal(body.tokenConfigured, true);
  assert.deepEqual(body.advisories, []);
  assert.deepEqual(body.repos, []);
  assert.deepEqual(body.jobs, []);
});

test("state: GET /report serves the weekly rollup", async () => {
  const res = await stateHandler(httpEvent("GET", "/report"));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.advisoriesSeen, 0);
  assert.equal(body.prsOpened, 0);
  assert.ok(body.range.from && body.range.to);
});

test("state: unknown route is a 404", async () => {
  const res = await stateHandler(httpEvent("GET", "/nope"));
  assert.equal(res.statusCode, 404);
});
