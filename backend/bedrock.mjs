// Optional Bedrock prose for the PR body (§9 of the spec).
// One call per PR, model amazon.nova-lite-v1:0 (env-overridable).
// The LLM NEVER decides security — it only writes plain-language prose.
// On any error/timeout: omit the section, still create the PR.

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

/**
 * @returns {Promise<string | null>} Markdown section, or null to omit.
 */
export async function bedrockProse({ pkg, fromRange, summary, severity }) {
  if (process.env.BEDROCK_ENABLED !== "true") return null;

  const modelId = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";
  const prompt =
    `Given this security advisory summary and the package, write 2–3 plain-language sentences ` +
    `for a developer explaining (1) what the vulnerability is, (2) whether their repo is likely ` +
    `exposed given they use ${pkg} ${fromRange}, (3) what to do. No markdown headers, no ` +
    `speculation about their code beyond the version fact.\n\n` +
    `Package: ${pkg}\nDeclared range: ${fromRange}\nAdvisory summary: ${summary}\nSeverity: ${severity}`;

  try {
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
    const res = await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          messages: [{ role: "user", content: [{ text: prompt }] }],
          inferenceConfig: { maxTokens: 300, temperature: 0.4 },
        }),
      }),
      { abortSignal: AbortSignal.timeout(8000) }
    );
    const parsed = JSON.parse(Buffer.from(res.body).toString("utf8"));
    const text = parsed?.output?.message?.content
      ?.map((c) => c?.text ?? "")
      .join(" ")
      .trim();
    if (!text) return null;
    return `### What this means for you\n\n${text}`;
  } catch (err) {
    console.warn("BEDROCK: prose generation failed, omitting section —", err?.message ?? err);
    return null;
  }
}
