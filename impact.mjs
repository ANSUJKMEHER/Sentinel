// Sentinel Impact Lambda — decide which org repos are affected by one advisory.
// Trigger: SQS advisory-queue, batchSize 1.
// Correctness rule: repo AFFECTED iff semver.intersects(declared, vulnerable).
// R5 policy: per-repo `.github/sentinel.json` may exclude the repo or specific
// packages, and may add reviewers/labels to the remediation PR.
//
// Log line the demo needs:
//   ADVISORY {ghsa_id}: {n} of {m} repos affected: [frontend, backend, analytics]

import { randomUUID } from "node:crypto";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { getGithubToken, ghJson, nextLink } from "./github.mjs";
import { findAffectedEntries, parseRepoConfig, resolvePatchedVersion } from "./decisions.mjs";
import { log } from "./logger.mjs";

// ---------------------------------------------------------------- test hooks
export const __test = { dynamo: null, sqs: null };
const db = () => __test.dynamo ?? new DynamoDBClient({});
const queue = () => __test.sqs ?? new SQSClient({});

/** List all repos of an org (falls back to /users/{org}/repos — spec: one org/user). */
async function listOrgRepos(token, org) {
  let url = `/orgs/${org}/repos?per_page=100&sort=full_name`;
  let page = await ghJson(url, { token });
  if (page.status === 404) {
    url = `/users/${org}/repos?per_page=100&sort=full_name`;
    page = await ghJson(url, { token });
  }
  if (page.status !== 200 || !Array.isArray(page.data)) {
    throw new Error(`GitHub repo list HTTP ${page.status}: ${JSON.stringify(page.data)}`);
  }
  const repos = [...page.data];
  let next = nextLink(page.headers);
  let guard = 0;
  while (next && guard < 10) {
    const more = await ghJson(next, { token });
    if (more.status !== 200 || !Array.isArray(more.data)) break;
    repos.push(...more.data);
    next = nextLink(more.headers);
    guard += 1;
  }
  return repos;
}

/** Fetch a repo's `.github/sentinel.json` policy; 404/invalid => default config. */
async function fetchRepoConfig(token, repo, defaultBranch) {
  const res = await ghJson(
    `/repos/${repo}/contents/.github/sentinel.json?ref=${encodeURIComponent(defaultBranch || "main")}`,
    { token, raw: true }
  );
  if (res.status === 404) return null;
  if (res.status !== 200) {
    log("repo_config_http", { repo, status: res.status }, "warn");
    return null;
  }
  try {
    return parseRepoConfig(res.text);
  } catch {
    log("repo_config_invalid", { repo, msg: `${repo}: .github/sentinel.json is invalid — ignoring` }, "warn");
    return null;
  }
}

async function processAdvisory(advisory) {
  const org = process.env.GITHUB_ORG;
  if (!org) throw new Error("GITHUB_ORG env not set");
  const token = await getGithubToken();
  const now = Math.floor(Date.now() / 1000);

  // 1. Refresh the repo registry (skip archived + forks).
  const allRepos = await listOrgRepos(token, org);
  const considered = allRepos.filter((r) => !r.archived && !r.fork);
  for (const r of considered) {
    await db().send(
      new PutItemCommand({
        TableName: process.env.REPOS_TABLE,
        Item: {
          repo: { S: r.full_name },
          defaultBranch: { S: r.default_branch || "main" },
          private: { BOOL: Boolean(r.private) },
          archived: { BOOL: Boolean(r.archived) },
          lastSeenAt: { N: String(now) },
        },
      })
    );
  }

  // 2-3. For each repo: fetch policy + package.json, decide affectedness.
  const affectedRepoNames = [];
  for (const r of considered) {
    const branch = r.default_branch || "main";

    const config = await fetchRepoConfig(token, r.full_name, branch);
    if (config?.exclude) {
      log("repo_excluded", {
        ghsaId: advisory.ghsa_id,
        repo: r.full_name,
        msg: `IMPACT ${advisory.ghsa_id}: ${r.name} excluded by .github/sentinel.json`,
      });
      // Record the exclusion on the repo row so the dashboard can show it.
      await db().send(
        new PutItemCommand({
          TableName: process.env.REPOS_TABLE,
          Item: {
            repo: { S: r.full_name },
            defaultBranch: { S: branch },
            private: { BOOL: Boolean(r.private) },
            archived: { BOOL: Boolean(r.archived) },
            excluded: { BOOL: true },
            lastSeenAt: { N: String(now) },
          },
        })
      );
      continue;
    }

    const pkgRes = await ghJson(
      `/repos/${r.full_name}/contents/package.json?ref=${encodeURIComponent(branch)}`,
      { token, raw: true }
    );
    if (pkgRes.status === 404) {
      log("repo_no_package_json", {
        ghsaId: advisory.ghsa_id,
        repo: r.full_name,
        msg: `IMPACT ${advisory.ghsa_id}: ${r.name} has no package.json — unaffected`,
      });
      continue;
    }
    if (pkgRes.status !== 200) {
      log("repo_package_json_http", { ghsaId: advisory.ghsa_id, repo: r.full_name, status: pkgRes.status }, "warn");
      continue;
    }

    let pkg;
    try {
      pkg = JSON.parse(pkgRes.text);
    } catch {
      log("repo_package_json_invalid", { ghsaId: advisory.ghsa_id, repo: r.full_name }, "warn");
      continue;
    }

    if (config?.excludePackages?.includes(advisory.package)) {
      log("package_excluded", {
        ghsaId: advisory.ghsa_id,
        repo: r.full_name,
        package: advisory.package,
        msg: `IMPACT ${advisory.ghsa_id}: ${r.name} excludes ${advisory.package} by policy`,
      });
      continue;
    }

    const entries = findAffectedEntries(pkg, advisory.package, advisory.vulnerable_range);
    if (entries.length === 0) continue;

    // One job per (repo, package): prefer the dependencies scope.
    const entry = entries.find((e) => e.scope === "dependencies") ?? entries[0];
    const patched = resolvePatchedVersion(advisory.first_patched_version, advisory.vulnerable_range);
    const jobId = randomUUID();

    // 4. Job (queued) + message to patch-queue (policy extras ride along).
    await db().send(
      new PutItemCommand({
        TableName: process.env.JOBS_TABLE,
        Item: {
          jobId: { S: jobId },
          ghsaId: { S: advisory.ghsa_id },
          repo: { S: r.full_name },
          package: { S: advisory.package },
          fromRange: { S: entry.declaredRange },
          ...(patched ? { toVersion: { S: patched } } : { toVersion: { NULL: true } }),
          status: { S: "queued" },
          updatedAt: { N: String(now) },
        },
      })
    );
    await queue().send(
      new SendMessageCommand({
        QueueUrl: process.env.PATCH_QUEUE_URL,
        MessageBody: JSON.stringify({
          jobId,
          ghsa_id: advisory.ghsa_id,
          repo: r.full_name,
          package: advisory.package,
          from_range: entry.declaredRange,
          vulnerable_range: advisory.vulnerable_range,
          first_patched_version: patched,
          default_branch: branch,
          severity: advisory.severity,
          summary: advisory.summary,
          ...(config?.reviewers?.length ? { reviewers: config.reviewers } : {}),
          ...(config?.labels?.length ? { labels: config.labels } : {}),
        }),
      })
    );

    log("job_queued", { ghsaId: advisory.ghsa_id, jobId, repo: r.full_name, package: advisory.package });
    if (!affectedRepoNames.includes(r.name)) affectedRepoNames.push(r.name);
  }

  log("impact_complete", {
    ghsaId: advisory.ghsa_id,
    affected: affectedRepoNames.length,
    total: considered.length,
    affectedRepos: affectedRepoNames,
    msg: `ADVISORY ${advisory.ghsa_id}: ${affectedRepoNames.length} of ${considered.length} repos affected: [${affectedRepoNames.join(", ")}]`,
  });
  return { ghsaId: advisory.ghsa_id, affected: affectedRepoNames.length, total: considered.length };
}

export const handler = async (event) => {
  const results = [];
  for (const record of event.Records ?? []) {
    let advisory;
    try {
      advisory = JSON.parse(record.body);
    } catch {
      log("impact_unparseable_message", { messageId: record.messageId }, "error");
      continue;
    }
    try {
      results.push(await processAdvisory(advisory));
    } catch (err) {
      log("impact_failed", { ghsaId: advisory.ghsa_id, error: String(err?.message ?? err) }, "error");
      results.push({ ghsaId: advisory.ghsa_id, error: String(err?.message ?? err) });
    }
  }
  return { results };
};
