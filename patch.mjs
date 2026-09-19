// Sentinel Patch Lambda — act: branch + commit + PR via GitHub API.
// Trigger: SQS patch-queue, batchSize 1.
// Errors: per-repo try/catch, mark job failed, never throw out of the handler
// (so SQS deletes the message — no poison-pill loops).
//
// R5 policy: PRs get "security"/"sentinel" labels (+ repo-config labels) and
// optional reviewers. Multiple advisories for the same package reuse one PR —
// the body accumulates one section per advisory (idempotent via HTML marker).
// R6 notifications: when the last job for an advisory settles, a digest is
// posted to NOTIFY_WEBHOOK_URL (Slack-compatible), once per advisory.
//
// Log line the demo needs: PR #{number} created: {url}

import { DynamoDBClient, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { getGithubToken, ghJson, parsePackageJson } from "./github.mjs";
import { bumpPackage, resolvePatchedVersion } from "./decisions.mjs";
import { bedrockProse } from "./bedrock.mjs";
import { composeDigestText, sendDigest } from "./notify.mjs";
import { log } from "./logger.mjs";

const truncate = (s, n = 300) => (typeof s === "string" && s.length > n ? s.slice(0, n) + "…" : s);

// ---------------------------------------------------------------- test hooks
export const __test = { dynamo: null };
const db = () => __test.dynamo ?? new DynamoDBClient({});

/** DynamoDB attribute value -> plain JS (subset used by the digest scan). */
function unmarshallItem(item) {
  const out = {};
  for (const [k, v] of Object.entries(item ?? {})) {
    if ("S" in v) out[k] = v.S;
    else if ("N" in v) out[k] = Number(v.N);
    else if ("BOOL" in v) out[k] = v.BOOL;
    else if ("NULL" in v) out[k] = null;
  }
  return out;
}

async function updateJob(jobId, { status, prNumber = null, prUrl = null, error = null }) {
  const sets = ["#st = :st", "updatedAt = :now"];
  const names = { "#st": "status" };
  const values = { ":st": { S: status }, ":now": { N: String(Math.floor(Date.now() / 1000)) } };
  const removes = [];

  if (prNumber != null) {
    sets.push("prNumber = :pr");
    values[":pr"] = { N: String(prNumber) };
  }
  if (prUrl != null) {
    sets.push("prUrl = :url");
    values[":url"] = { S: prUrl };
  }
  if (error != null) {
    sets.push("#err = :err");
    names["#err"] = "error";
    values[":err"] = { S: truncate(error, 1000) };
  } else {
    removes.push("#err");
    names["#err"] = "error";
  }

  const expr = `SET ${sets.join(", ")}${removes.length ? ` REMOVE ${removes.join(", ")}` : ""}`;
  await db().send(
    new UpdateItemCommand({
      TableName: process.env.JOBS_TABLE,
      Key: { jobId: { S: jobId } },
      UpdateExpression: expr,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

/** Hidden HTML marker identifying this advisory in a PR body (idempotency + grouping). */
export function sentinelMarker(msg) {
  return `<!-- sentinel: ${JSON.stringify({
    ghsa_id: msg.ghsa_id,
    package: msg.package,
    from: msg.from_range,
    to: msg.toVersion ?? null,
  })} -->`;
}

/**
 * One advisory's body section: heading + summary + deterministic table.
 * Used standalone (new PR) and appended (grouped PR reuse).
 */
export function composeAdvisorySection(msg, toVersion) {
  const { package: pkg, from_range: fromRange, severity, summary, ghsa_id: ghsaId } = msg;
  const cap = (severity || "unknown").charAt(0).toUpperCase() + (severity || "unknown").slice(1);
  return [
    `## 🔐 Security remediation: ${pkg}`,
    "",
    `**${cap} severity** — ${summary}`,
    `Advisory: ${ghsaId} (https://github.com/advisories/${ghsaId})`,
    "",
    "| | |",
    "|---|---|",
    `| Your repo declares | \`${fromRange}\` |`,
    `| Fixed version | \`${toVersion}\` |`,
    `| Change | \`${pkg}\` bumped in package.json |`,
    "",
  ].join("\n");
}

/** Compose the PR body (§7 template). Deterministic fields only; Bedrock prose optional. */
export async function composePrBody(msg, toVersion) {
  const lines = [
    sentinelMarker({ ...msg, toVersion }),
    "",
    composeAdvisorySection(msg, toVersion).replace(/\n+$/, ""),
    "",
  ];
  const prose = await bedrockProse({ pkg: msg.package, fromRange: msg.from_range, severity: msg.severity, summary: msg.summary });
  if (prose) lines.push(prose, "");
  lines.push(
    "> 🤖 This PR was opened automatically by **Sentinel** — advisory-first, org-wide dependency impact analysis and coordinated remediation. Review and merge. Your repo's CI runs on this PR to verify the change."
  );
  return lines.join("\n");
}

/** Open a PR, or find + reuse the existing open PR for this branch. */
async function openOrFindPullRequest(ctx) {
  const { token, repo, branch, defaultBranch } = ctx;
  const title = `🔐 [Security] Update ${ctx.pkg} from ${ctx.fromRange} to ${ctx.toVersion}`;
  const body = await composePrBody(ctx.msg, ctx.toVersion);

  const created = await ghJson(`/repos/${repo}/pulls`, {
    token,
    method: "POST",
    body: { title, base: defaultBranch, head: branch, body },
  });
  if (created.status === 201) return { pr: created.data, reused: false };

  if (created.status === 422) {
    // "A pull request already exists" — find and reuse it (idempotent re-runs).
    const owner = repo.split("/")[0];
    const existing = await ghJson(
      `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`,
      { token }
    );
    const pr = existing.data?.[0];
    if (pr) {
      // R5 grouping: fold this advisory into the existing PR body (marker-idempotent).
      const detail = await ghJson(`/repos/${repo}/pulls/${pr.number}`, { token });
      const currentBody = detail.status === 200 ? detail.data?.body : pr.body;
      if (typeof currentBody === "string" && !currentBody.includes(sentinelMarker(ctx.msg))) {
        const extended = `${currentBody.replace(/\s+$/, "")}\n\n${composeAdvisorySection(ctx.msg, ctx.toVersion)}`;
        const updated = await ghJson(`/repos/${repo}/pulls/${pr.number}`, {
          token,
          method: "PATCH",
          body: { body: extended },
        });
        if (updated.status === 200) {
          log("pr_body_extended", { ghsaId: ctx.msg.ghsa_id, prNumber: pr.number, repo });
        } else {
          log("pr_body_extend_failed", { ghsaId: ctx.msg.ghsa_id, prNumber: pr.number, repo, status: updated.status }, "warn");
        }
      }
      return { pr, reused: true };
    }
  }
  throw new Error(`create PR HTTP ${created.status}: ${truncate(JSON.stringify(created.data))}`);
}

/** R5: apply policy metadata to the PR — labels and reviewers. Best-effort only. */
async function applyPrPolicy(token, repo, prNumber, msg) {
  const labels = ["security", "sentinel", ...(Array.isArray(msg.labels) ? msg.labels : [])];
  const apply = () =>
    ghJson(`/repos/${repo}/issues/${prNumber}/labels`, {
      token,
      method: "POST",
      body: { labels },
    });
  try {
    let res = await apply();
    if (res.status === 422) {
      // Labels likely don't exist in this repo yet (fresh demo repos) — create
      // the two defaults, then retry once. Unknown custom labels still fail soft.
      await Promise.all(
        ["security", "sentinel"].map((name) =>
          ghJson(`/repos/${repo}/labels`, {
            token,
            method: "POST",
            body: { name, color: name === "security" ? "d73a4a" : "0366d6" },
          })
        )
      );
      res = await apply();
    }
    if (res.status !== 200 && res.status !== 201) {
      log("pr_labels_failed", { prNumber, repo, status: res.status }, "warn");
    }
  } catch (err) {
    log("pr_labels_failed", { prNumber, repo, error: String(err?.message ?? err) }, "warn");
  }

  if (Array.isArray(msg.reviewers) && msg.reviewers.length > 0) {
    try {
      const res = await ghJson(`/repos/${repo}/pulls/${prNumber}/requested_reviewers`, {
        token,
        method: "POST",
        body: { reviewers: msg.reviewers },
      });
      if (res.status !== 200 && res.status !== 201) {
        log("pr_reviewers_failed", { prNumber, repo, status: res.status }, "warn");
      }
    } catch (err) {
      log("pr_reviewers_failed", { prNumber, repo, error: String(err?.message ?? err) }, "warn");
    }
  }
}

/** R6: when the last job for this advisory settles, send ONE digest to the webhook. */
async function maybeSendDigest(msg) {
  const webhook = process.env.NOTIFY_WEBHOOK_URL;
  if (!webhook) return;

  let jobs;
  try {
    const scan = await db().send(
      new ScanCommand({
        TableName: process.env.JOBS_TABLE,
        FilterExpression: "ghsaId = :g",
        ExpressionAttributeValues: { ":g": { S: msg.ghsa_id } },
      })
    );
    jobs = (scan.Items ?? []).map(unmarshallItem);
    if (jobs.length === 0 || jobs.some((j) => j.status === "queued")) return;

    // Atomic "only one digest per advisory" claim (concurrent patch runs race here).
    await db().send(
      new UpdateItemCommand({
        TableName: process.env.ADVISORIES_TABLE,
        Key: { ghsa_id: { S: msg.ghsa_id } },
        UpdateExpression: "SET digestSentAt = :t",
        ExpressionAttributeValues: { ":t": { N: String(Math.floor(Date.now() / 1000)) } },
        ConditionExpression: "attribute_not_exists(digestSentAt)",
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") return; // another invoker sent it
    log("digest_scan_failed", { ghsaId: msg.ghsa_id, error: String(err?.message ?? err) }, "warn");
    return;
  }

  const text = composeDigestText({
    ghsaId: msg.ghsa_id,
    package: msg.package,
    severity: msg.severity,
    summary: msg.summary,
    jobs,
  });
  const res = await sendDigest(webhook, text);
  if (res.ok) log("digest_sent", { ghsaId: msg.ghsa_id, jobCount: jobs.length });
  else log("digest_failed", { ghsaId: msg.ghsa_id, status: res.status, error: res.error }, "warn");
}

async function patchRepo(msg) {
  const { jobId, repo, package: pkg, from_range: fromRange, default_branch: defaultBranch } = msg;
  const token = await getGithubToken();

  const toVersion = resolvePatchedVersion(msg.first_patched_version, msg.vulnerable_range);
  if (!toVersion) throw new Error("no patched version in advisory");
  const branch = `security/${pkg}-${msg.ghsa_id}`;

  // 1. Current package.json from the default branch (capture sha + content).
  const file = await ghJson(
    `/repos/${repo}/contents/package.json?ref=${encodeURIComponent(defaultBranch)}`,
    { token }
  );
  if (file.status !== 200) throw new Error(`package.json fetch HTTP ${file.status}`);
  let fileSha = file.data?.sha;
  let pkgJson = parsePackageJson(file);

  // 2. Edit: exact patched version, all other fields untouched.
  const updated = bumpPackage(pkgJson, pkg, fromRange, toVersion);
  if (!updated.changed) {
    throw new Error(
      updated.reason === "missing"
        ? `package.json no longer declares ${pkg}`
        : `already at ${toVersion} on ${defaultBranch}`
    );
  }

  // 3. Branch security/{package}-{ghsa_id} from the default branch (reuse on 422).
  const headRef = await ghJson(
    `/repos/${repo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`,
    { token }
  );
  if (headRef.status !== 200) throw new Error(`default branch ref HTTP ${headRef.status}`);
  const baseSha = headRef.data?.object?.sha;

  const createRef = await ghJson(`/repos/${repo}/git/refs`, {
    token,
    method: "POST",
    body: { ref: `refs/heads/${branch}`, sha: baseSha },
  });

  let skipCommit = false;
  if (createRef.status === 422) {
    // Branch exists (previous run) — rebase the edit onto the branch head.
    const branchFile = await ghJson(
      `/repos/${repo}/contents/package.json?ref=${encodeURIComponent(branch)}`,
      { token }
    );
    if (branchFile.status === 200) {
      const branchPkg = parsePackageJson(branchFile);
      const already = bumpPackage(branchPkg, pkg, fromRange, toVersion);
      if (!already.changed) {
        if (already.reason === "already") {
          skipCommit = true; // branch already carries the fix
        } else {
          throw new Error(`package.json no longer declares ${pkg} on branch`);
        }
      } else {
        fileSha = branchFile.data?.sha;
        pkgJson = already.pkg;
      }
    } else {
      throw new Error(`branch exists but package.json HTTP ${branchFile.status} on branch`);
    }
  } else if (createRef.status !== 201) {
    throw new Error(`create branch HTTP ${createRef.status}: ${truncate(JSON.stringify(createRef.data))}`);
  }

  // 4. Commit the bump (content computed from the final package.json state —
  //    default branch or reused branch head, whichever the commit lands on).
  if (!skipCommit) {
    const newContent = `${JSON.stringify(pkgJson, null, 2)}\n`;
    const commit = await ghJson(`/repos/${repo}/contents/package.json`, {
      token,
      method: "PUT",
      body: {
        message: `chore(security): bump ${pkg} to ${toVersion}`,
        content: Buffer.from(newContent).toString("base64"),
        sha: fileSha,
        branch,
      },
    });
    if (commit.status !== 200 && commit.status !== 201) {
      throw new Error(`commit HTTP ${commit.status}: ${truncate(JSON.stringify(commit.data))}`);
    }
  }

  // 5. PR (create or reuse + group).
  const { pr, reused } = await openOrFindPullRequest({
    token,
    repo,
    branch,
    defaultBranch,
    pkg,
    fromRange,
    toVersion,
    msg: { ...msg, toVersion },
  });
  await applyPrPolicy(token, repo, pr.number, msg);

  // 6. Job => patched.
  await updateJob(jobId, { status: "patched", prNumber: pr.number, prUrl: pr.html_url });
  log("pr_created", {
    ghsaId: msg.ghsa_id,
    jobId,
    repo,
    prNumber: pr.number,
    reused,
    msg: `PR #${pr.number} created: ${pr.html_url}`,
  });

  await maybeSendDigest(msg);
}

export const handler = async (event) => {
  for (const record of event.Records ?? []) {
    let msg;
    try {
      msg = JSON.parse(record.body);
    } catch {
      log("patch_unparseable_message", { messageId: record.messageId }, "error");
      continue;
    }
    try {
      await patchRepo(msg);
    } catch (err) {
      const message = String(err?.message ?? err);
      log("job_failed", { ghsaId: msg.ghsa_id, jobId: msg.jobId, repo: msg.repo, error: message }, "error");
      try {
        await updateJob(msg.jobId, { status: "failed", error: message });
      } catch (dbErr) {
        log("job_failure_not_recorded", { jobId: msg.jobId, error: String(dbErr?.message ?? dbErr) }, "error");
      }
      await maybeSendDigest(msg);
    }
    // Return normally => SQS deletes the message. No poison-pill loops.
  }
  return { processed: event.Records?.length ?? 0 };
};
