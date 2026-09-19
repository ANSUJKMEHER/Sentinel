// Sentinel Advisor Lambda — detect new npm GitHub Security Advisories.
// Trigger: EventBridge rate(5 minutes).
// For each new advisory: PutItem (dedupe) + SendMessage to advisory-queue.
// Severity gating (R4): advisories below AUTO_REMEDIATE_SEVERITIES are stored
// with action=report and NOT queued for remediation (report-only).
//
// Log line the demo needs: ADVISORY {ghsa_id} {package} {severity}

import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { getGithubTokenAgeDays, getGithubTokenMeta, ghJson } from "./github.mjs";
import { isGatedSeverity, parseSeverityGate } from "./decisions.mjs";
import { log } from "./logger.mjs";

// ---------------------------------------------------------------- test hooks
export const __test = { dynamo: null, sqs: null };
const db = () => __test.dynamo ?? new DynamoDBClient({});
const queue = () => __test.sqs ?? new SQSClient({});

const TOKEN_ROTATION_DAYS = 90;

export const handler = async () => {
  const { token } = await getGithubTokenMeta();

  // R7: watchdog — warn when the PAT is older than the rotation policy.
  const tokenAgeDays = await getGithubTokenAgeDays();
  if (tokenAgeDays != null && tokenAgeDays >= TOKEN_ROTATION_DAYS) {
    log("token_check", { tokenAgeDays, rotationDays: TOKEN_ROTATION_DAYS }, "warn");
  }

  const { status, data } = await ghJson(
    "/advisories?ecosystem=npm&state=published&sort=published&direction=desc&per_page=30",
    { token }
  );
  if (status !== 200 || !Array.isArray(data)) {
    throw new Error(`GitHub advisories API HTTP ${status}`);
  }

  const gate = parseSeverityGate(process.env.AUTO_REMEDIATE_SEVERITIES);

  let newCount = 0;
  let gatedCount = 0;
  for (const advisory of data) {
    const vuln = advisory.vulnerabilities?.[0]; // FIRST vulnerability entry only (per spec)
    if (!vuln || vuln.package?.ecosystem !== "npm") continue;

    const ghsaId = advisory.ghsa_id;
    const pkg = vuln.package.name;
    const severity = advisory.severity || "unknown";
    const summary = advisory.summary || "";
    const vulnerableRange = vuln.vulnerable_version_range || "";
    const firstPatched = vuln.first_patched_version ?? null;
    if (!ghsaId || !pkg || !vulnerableRange) continue;

    const gated = isGatedSeverity(severity, gate);
    const action = gated ? "report" : "remediate";

    // Dedupe: attribute_not_exists(ghsa_id). Conditional failure => already processed.
    try {
      await db().send(
        new PutItemCommand({
          TableName: process.env.ADVISORIES_TABLE,
          Item: {
            ghsa_id: { S: ghsaId },
            package: { S: pkg },
            severity: { S: severity },
            summary: { S: summary },
            vulnerableRange: { S: vulnerableRange },
            ...(firstPatched ? { firstPatchedVersion: { S: firstPatched } } : { firstPatchedVersion: { NULL: true } }),
            publishedAt: { S: advisory.published_at || new Date().toISOString() },
            source: { S: "cron" },
            action: { S: action },
          },
          ConditionExpression: "attribute_not_exists(ghsa_id)",
        })
      );
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") continue; // already processed
      log("advisory_store_failed", { ghsaId, error: err.message }, "warn");
      continue;
    }

    if (gated) {
      // Report-only: recorded above, never queued for remediation.
      log("advisory_gated", {
        ghsaId,
        package: pkg,
        severity,
        gate: gate.join(","),
        msg: `ADVISORY ${ghsaId} ${pkg} ${severity} GATED (report-only)`,
      });
      gatedCount += 1;
      continue;
    }

    const message = {
      ghsa_id: ghsaId,
      package: pkg,
      severity,
      summary,
      vulnerable_range: vulnerableRange,
      first_patched_version: firstPatched,
      source: "cron",
    };
    await queue().send(
      new SendMessageCommand({
        QueueUrl: process.env.ADVISORY_QUEUE_URL,
        MessageBody: JSON.stringify(message),
      })
    );

    log("advisory_detected", {
      ghsaId,
      package: pkg,
      severity,
      msg: `ADVISORY ${ghsaId} ${pkg} ${severity}`,
    });
    newCount += 1;
  }

  log("advisor_run_complete", { newCount, gatedCount });
  return { newCount, gatedCount };
};
