// Shared GitHub API + token helpers. Native fetch only — no Octokit.
// All calls: Authorization: Bearer {token}, Accept: application/vnd.github+json,
// X-GitHub-Api-Version: 2022-11-28. 403/429 => retry x2 with backoff.

import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

// ---------------------------------------------------------------- test hooks
// Used by handlers.test.mjs to inject doubles without any dependency-mocking
// framework (works on Node 20). Never set in production.
let testFetcher = null;
let testToken = null;

export function __setFetcherForTests(fn) {
  testFetcher = fn ?? null;
}

export function __setTokenForTests(token) {
  testToken = token ?? null;
}

export function __clearTestHooks() {
  testFetcher = null;
  testToken = null;
  tokenPromise = null;
}

// ---------------------------------------------------------------- token
let tokenPromise = null;

/**
 * Read the GitHub token from SSM Parameter Store at cold start (cached for the
 * lifetime of the Lambda instance). The token is never logged or serialized.
 * Returns the token plus the SSM LastModifiedDate (for token-age monitoring).
 *
 * @returns {Promise<{ token: string, lastModifiedAt: string | null }>}
 */
export function getGithubTokenMeta() {
  const name = process.env.SSM_PARAM_NAME || "/sentinel/github-token";
  if (!tokenPromise) {
    tokenPromise = (async () => {
      if (testToken !== null) return { token: testToken, lastModifiedAt: null };
      if (process.env.GITHUB_TOKEN) return { token: process.env.GITHUB_TOKEN, lastModifiedAt: new Date().toISOString() };
      const client = new SSMClient({
        endpoint: process.env.AWS_ENDPOINT_URL || undefined,
        region: process.env.AWS_REGION || "us-east-1",
      });
      const res = await client.send(
        new GetParameterCommand({ Name: name, WithDecryption: true })
      );
      const value = res.Parameter?.Value || "";
      let token = value;
      let appMeta = null;
      if (value.startsWith("{")) {
        try {
          const parsed = JSON.parse(value);
          token = parsed.token || parsed.installationToken || value;
          appMeta = { appId: parsed.appId, installationId: parsed.installationId };
        } catch {
          // not valid JSON, use raw value
        }
      }
      return { token, lastModifiedAt: res.Parameter?.LastModifiedDate ?? null, appMeta };
    })().catch((err) => {
      tokenPromise = null; // allow retry on next invocation (fresh cold start)
      throw err;
    });
  }
  return tokenPromise;
}

/** @returns {Promise<string>} */
export async function getGithubToken() {
  return (await getGithubTokenMeta()).token;
}

/** Age of the SSM token in whole days, or null if unknown (e.g. test hook). */
export async function getGithubTokenAgeDays() {
  const { lastModifiedAt } = await getGithubTokenMeta();
  if (!lastModifiedAt) return null;
  const ms = Date.now() - new Date(lastModifiedAt).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

const GITHUB_API = "https://api.github.com";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Core GitHub request with retry on 403/429 (honours retry-after, min 2s, max 15s).
 *
 * @param {string} path  Path like "/repos/org/repo/..." or a full URL (for pagination).
 * @param {{ token: string, method?: string, body?: object, raw?: boolean }} opts
 * @returns {Promise<Response>}
 */
export async function ghRequest(path, { token, method = "GET", body, raw = false } = {}) {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  let attempts = 0;
  for (;;) {
    const res = await (testFetcher ?? fetch)(url, {
      method,
      headers: {
        Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if ((res.status === 403 || res.status === 429) && attempts < 2) {
      const retryAfter = Number.parseInt(res.headers.get("retry-after") || "2", 10);
      const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2;
      await sleep(Math.min(Math.max(seconds * 1000, 2000), 15000));
      attempts += 1;
      continue;
    }
    return res;
  }
}

/**
 * GitHub request returning { status, data, text, headers } with the body parsed
 * as JSON when possible (raw file bodies like package.json also parse as JSON).
 */
export async function ghJson(path, opts = {}) {
  const res = await ghRequest(path, opts);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { status: res.status, data, text, headers: res.headers };
}

/** Extract the `rel="next"` URL from a Link header, if any. */
export function nextLink(headers) {
  const link = headers?.get?.("link") || "";
  const m = /<([^>]+)>;\s*rel="next"/.exec(link);
  return m ? m[1] : null;
}

/**
 * Parse package.json from a GitHub contents response.
 * Non-raw responses are JSON envelopes ({ type, sha, content(base64), ... });
 * raw responses are the file body itself (which for package.json is JSON).
 */
export function parsePackageJson(fetched) {
  if (!fetched) throw new Error("empty response");
  if (fetched.data?.type === "file" && typeof fetched.data?.content === "string") {
    return JSON.parse(Buffer.from(fetched.data.content, "base64").toString("utf8"));
  }
  if (typeof fetched.text === "string" && fetched.text.trim()) {
    return JSON.parse(fetched.text);
  }
  throw new Error("package.json body missing");
}
