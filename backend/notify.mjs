// Advisory-completion digest → Slack-compatible webhook (R6: notifications).
// One digest per advisory run: sent when the last job for an advisory settles.
// Notification failures are logged and NEVER fail a job or the pipeline.

/**
 * Pure digest text for one advisory run. Grep-friendly and Slack-friendly.
 *
 * @param {{ ghsaId: string, package: string, severity: string, summary: string, jobs: {repo: string, status: string, prNumber?: number|null, prUrl?: string|null, error?: string|null}[] }} input
 * @returns {string}
 */
export function composeDigestText({ ghsaId, package: pkg, severity, summary, jobs }) {
  const patched = jobs.filter((j) => j.status === "patched");
  const failed = jobs.filter((j) => j.status === "failed");
  const prs = patched
    .map((j) => (j.prNumber != null ? `#${j.prNumber}` : null))
    .filter(Boolean)
    .join(", ");

  const lines = [
    `🔐 Sentinel — advisory ${ghsaId} (${pkg}, ${severity})`,
    summary ? `${summary}` : null,
    `${patched.length} remediation PR(s)${prs ? `: ${prs}` : ""}${
      failed.length ? ` · ${failed.length} job(s) failed` : ""
    }`,
    ...failed.map((f) => `❌ ${f.repo}: ${f.error ?? "unknown error"}`),
  ].filter((l) => l !== null);

  return lines.join("\n");
}

/**
 * POST the digest to a Slack-compatible incoming webhook (or any JSON webhook).
 * 5s timeout; never throws — failures are returned, not raised.
 *
 * @param {string} webhookUrl
 * @param {string} text
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function sendDigest(webhookUrl, text) {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}
