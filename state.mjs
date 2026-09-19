// Sentinel State Lambda — dashboard API behind API Gateway HTTP API.
//   GET  /state              => advisories (20), repos, jobs (50), stats + live PR CI status
//   GET  /report             => weekly security rollup (R6): merged/stale PRs, top packages
//   POST /advisories/simulate => validate, suffix ghsa_id, store, queue to advisory-queue, 202

import { DynamoDBClient, PutItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { getGithubTokenAgeDays, getGithubTokenMeta, ghJson } from "./github.mjs";
import { isGatedSeverity, parseSeverityGate } from "./decisions.mjs";
import { buildReport } from "./report.mjs";
import { log } from "./logger.mjs";

// ---------------------------------------------------------------- test hooks
export const __test = { dynamo: null, sqs: null };
const db = () => __test.dynamo ?? new DynamoDBClient({});
const queue = () => __test.sqs ?? new SQSClient({});

const json = (statusCode, obj) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  },
  body: JSON.stringify(obj),
});

/** DynamoDB attribute value -> plain JS. */
function unmarshall(item) {
  const out = {};
  for (const [k, v] of Object.entries(item ?? {})) {
    if ("S" in v) out[k] = v.S;
    else if ("N" in v) out[k] = Number(v.N);
    else if ("BOOL" in v) out[k] = v.BOOL;
    else if ("NULL" in v) out[k] = null;
  }
  return out;
}

async function scanTable(table) {
  const items = [];
  let key;
  do {
    const res = await db().send(new ScanCommand({ TableName: table, ExclusiveStartKey: key }));
    items.push(...(res.Items ?? []));
    key = res.LastEvaluatedKey;
  } while (key && items.length < 5000);
  return items;
}

/** Live PR check status from GitHub (pull state + check-runs conclusion). */
async function fetchCiStatus(token, job) {
  try {
    const pr = await ghJson(`/repos/${job.repo}/pulls/${job.prNumber}`, { token });
    const prState = pr.data?.state ?? "unknown";
    if (pr.status !== 200 || !pr.data?.head?.sha) {
      return { ciStatus: "unknown", prState };
    }
    const checks = await ghJson(
      `/repos/${job.repo}/commits/${pr.data.head.sha}/check-runs?per_page=20`,
      { token }
    );
    const runs = checks.data?.check_runs ?? [];
    let ciStatus = "unknown";
    if (runs.length > 0) {
      const conclusions = runs.map((r) => r.conclusion).filter(Boolean);
      if (conclusions.some((c) => ["failure", "cancelled", "timed_out", "action_required", "stale"].includes(c))) {
        ciStatus = "failing";
      } else if (conclusions.every((c) => ["success", "neutral", "skipped"].includes(c))) {
        ciStatus = "passing";
      } else {
        ciStatus = "pending";
      }
    }
    return { ciStatus, prState };
  } catch {
    return { ciStatus: "unknown", prState: "unknown" };
  }
}

/** PR merge detail for the /report rollup (R7 audit trail). */
async function fetchPrDetail(token, job) {
  try {
    const pr = await ghJson(`/repos/${job.repo}/pulls/${job.prNumber}`, { token });
    if (pr.status !== 200) return { merged: false, mergedBy: null, mergedAt: null };
    return {
      merged: pr.data?.merged === true,
      mergedBy: pr.data?.merged_by?.login ?? null,
      mergedAt: pr.data?.merged_at ?? null,
    };
  } catch {
    return { merged: false, mergedBy: null, mergedAt: null };
  }
}

async function getState() {
  const [reposRaw, advisoriesRaw, jobsRaw] = await Promise.all([
    scanTable(process.env.REPOS_TABLE),
    scanTable(process.env.ADVISORIES_TABLE),
    scanTable(process.env.JOBS_TABLE),
  ]);

  const advisories = advisoriesRaw
    .map(unmarshall)
    .sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")))
    .slice(0, 20);

  const repos = reposRaw.map(unmarshall).sort((a, b) => a.repo.localeCompare(b.repo));

  const jobs = jobsRaw
    .map(unmarshall)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 50);

  // Live PR check status (bounded: up to 15 recent patched PRs, parallel).
  let tokenConfigured = true;
  let token = null;
  let tokenAgeDays = null;
  try {
    token = (await getGithubTokenMeta()).token;
    tokenAgeDays = await getGithubTokenAgeDays();
  } catch {
    tokenConfigured = false;
  }
  let ci = new Map();
  if (token) {
    const prJobs = jobs.filter((j) => j.status === "patched" && j.prNumber != null).slice(0, 15);
    const results = await Promise.all(prJobs.map((j) => fetchCiStatus(token, j)));
    prJobs.forEach((j, i) => ci.set(j.jobId, results[i]));
  }

  const jobsOut = jobs.map((j) => (ci.has(j.jobId) ? { ...j, ...ci.get(j.jobId) } : j));

  const stats = {
    advisoriesSeen: advisoriesRaw.length,
    reposMonitored: reposRaw.length,
    prsOpened: jobsRaw.filter((j) => j.status?.S === "patched").length,
  };

  return json(200, { advisories, repos, jobs: jobsOut, stats, tokenConfigured, tokenAgeDays });
}

/** GET /report — weekly rollup with live PR merge state (bounded to 15 PRs). */
async function getReport() {
  const [reposRaw, advisoriesRaw, jobsRaw] = await Promise.all([
    scanTable(process.env.REPOS_TABLE),
    scanTable(process.env.ADVISORIES_TABLE),
    scanTable(process.env.JOBS_TABLE),
  ]);
  const advisories = advisoriesRaw.map(unmarshall);
  const repos = reposRaw.map(unmarshall);
  const jobs = jobsRaw.map(unmarshall);

  let prDetails = new Map();
  try {
    const token = (await getGithubTokenMeta()).token;
    const prJobs = jobs.filter((j) => j.status === "patched" && j.prNumber != null).slice(0, 15);
    const results = await Promise.all(prJobs.map((j) => fetchPrDetail(token, j)));
    prJobs.forEach((j, i) => prDetails.set(j.jobId, results[i]));
  } catch {
    // No token => merge state unknown; rollup still serves what the DB knows.
  }

  return json(200, buildReport({ advisories, repos, jobs, prDetails }));
}

const REQUIRED = ["ghsa_id", "package", "severity", "summary", "vulnerable_range"];

function validateSimulate(body) {
  const errors = [];
  for (const key of REQUIRED) {
    if (typeof body?.[key] !== "string" || body[key].trim() === "") {
      errors.push(`missing or invalid field: ${key}`);
    }
  }
  if (body && "first_patched_version" in body && body.first_patched_version != null && typeof body.first_patched_version !== "string") {
    errors.push("first_patched_version must be a string or null");
  }
  if (body && "cve" in body && body.cve != null && typeof body.cve !== "string") {
    errors.push("cve must be a string or null");
  }
  return errors;
}

async function simulate(event) {
  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "body must be valid JSON" });
  }
  const errors = validateSimulate(body);
  if (errors.length > 0) return json(400, { error: "invalid simulate payload", details: errors });

  // Suffix the ghsa_id so re-runs work (demo takes).
  const ghsaId = `${body.ghsa_id}-sim-${Date.now()}`;
  const message = {
    ghsa_id: ghsaId,
    package: body.package,
    severity: body.severity,
    summary: body.summary,
    vulnerable_range: body.vulnerable_range,
    first_patched_version: body.first_patched_version ?? null,
    cve: body.cve ?? null,
    source: "simulate",
  };

  // R4: the same severity gate as the cron path (consistency: simulate of a
  // report-only severity stays report-only).
  const gate = parseSeverityGate(process.env.AUTO_REMEDIATE_SEVERITIES);
  const gated = isGatedSeverity(body.severity, gate);
  const action = gated ? "report" : "remediate";

  await db().send(
    new PutItemCommand({
      TableName: process.env.ADVISORIES_TABLE,
      Item: {
        ghsa_id: { S: ghsaId },
        package: { S: body.package },
        severity: { S: body.severity },
        summary: { S: body.summary },
        vulnerableRange: { S: body.vulnerable_range },
        ...(body.first_patched_version
          ? { firstPatchedVersion: { S: body.first_patched_version } }
          : { firstPatchedVersion: { NULL: true } }),
        publishedAt: { S: new Date().toISOString() },
        source: { S: "simulate" },
        action: { S: action },
      },
    })
  );

  if (!gated) {
    // Same advisory-queue as production (cron) — identical pipeline for the demo.
    await queue().send(
      new SendMessageCommand({
        QueueUrl: process.env.ADVISORY_QUEUE_URL,
        MessageBody: JSON.stringify(message),
      })
    );
  }

  log("simulate_queued", { ghsaId, package: body.package, severity: body.severity, action });
  return json(202, { queued: message, action });
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? "";
  const path = event.requestContext?.http?.path ?? "";
  try {
    if (method === "GET" && path === "/state") return await getState();
    if (method === "GET" && path === "/report") return await getReport();
    if (method === "POST" && path === "/advisories/simulate") return await simulate(event);
    return json(404, { error: "not found" });
  } catch (err) {
    log("state_handler_error", { error: String(err?.message ?? err) }, "error");
    return json(500, { error: "internal error", message: String(err?.message ?? err) });
  }
};
