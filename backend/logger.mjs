// Structured JSON logger — every Lambda logs one JSON object per line so
// CloudWatch can filter/metric by fields (event, ghsaId, jobId, repo).
//
// Convention: `event` is a stable machine name (e.g. "advisory_detected"),
// everything else is correlation/context fields. Any message the demo or an
// operator greps for goes into `msg` verbatim, so the historical demo log
// lines ("ADVISORY {ghsa} {pkg} {severity}", "PR #{n} created: {url}") remain
// greppable inside the JSON line.

const fn = () => process.env.AWS_LAMBDA_FUNCTION_NAME ?? "local";

/**
 * @param {string} event  Stable event name (snake_case), e.g. "job_failed".
 * @param {object} [fields]  Correlation/context fields (ghsaId, jobId, repo, msg, ...).
 * @param {"info"|"warn"|"error"} [level]
 */
export function log(event, fields = {}, level = "info") {
  const entry = {
    ts: new Date().toISOString(),
    fn: fn(),
    stage: process.env.STAGE ?? "unknown",
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
