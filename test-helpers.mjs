// Test doubles for handler tests (R1: mock-GitHub wiring tests).
// No real network, no AWS SDK calls — used only by *.test.mjs files.

/**
 * Minimal Response stand-in for github.mjs's ghRequest/ghJson:
 * they use res.status, res.text(), res.headers.get(...).
 */
export function fakeResponse(status, body, headers = {}) {
  const get = (k) => (headers[String(k).toLowerCase()] ?? null);
  return {
    status,
    headers: { get },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

/** Base64-encode a JS object the way the GitHub contents API does. */
export function contentsEnvelope(sha, obj) {
  return {
    type: "file",
    sha,
    content: Buffer.from(JSON.stringify(obj)).toString("base64"),
  };
}

/** Route-based fake of the GitHub API for injection via github.mjs hooks. */
export class FakeGithub {
  constructor() {
    this.routes = [];
    this.calls = [];
  }

  /** @param {(url: string, init: object) => object} fn */
  on(method, regex, fn) {
    this.routes.push({ method: method.toUpperCase(), regex, fn });
    return this;
  }

  /** Returns the handler to pass to __setFetcherForTests. */
  handler() {
    return async (url, init = {}) => {
      const method = (init.method ?? "GET").toUpperCase();
      this.calls.push({ method, url, init });
      for (const r of this.routes) {
        if (r.method !== method) continue;
        const m = url.match(r.regex);
        if (m) {
          const res = r.fn(m, init);
          return res instanceof Promise ? res : Promise.resolve(res);
        }
      }
      throw new Error(`FakeGithub: no route for ${method} ${url}`);
    };
  }
}

/** Recording DynamoDB client double (implements .send). */
export class FakeDynamo {
  constructor() {
    this.calls = [];
    /** Keys to fail with ConditionalCheckFailedException: `${TableName}/${ghsa}` */
    this.conditionFailKeys = new Set();
    /** Table name -> Items returned for ScanCommand (with FilterExpression). */
    this.scanItems = {};
  }

  async send(cmd) {
    const input = cmd.input ?? {};
    this.calls.push({ name: cmd.constructor.name, input });
    if (cmd.constructor.name === "ScanCommand" && this.scanItems[input.TableName]) {
      return { Items: this.scanItems[input.TableName] };
    }
    const condKey = `${input.TableName}/${input.Item?.ghsa_id?.S ?? input.Key?.ghsa_id?.S ?? ""}`;
    if (
      (input.ConditionExpression ?? "").includes("attribute_not_exists") &&
      this.conditionFailKeys.has(condKey)
    ) {
      const err = new Error("The conditional request failed");
      err.name = "ConditionalCheckFailedException";
      throw err;
    }
    return {};
  }

  callsWhere(name) {
    return this.calls.filter((c) => c.name === name).map((c) => c.input);
  }
}

/** Recording SQS client double (implements .send). */
export class FakeSqs {
  constructor() {
    this.calls = [];
  }

  async send(cmd) {
    this.calls.push({ name: cmd.constructor.name, input: cmd.input ?? {} });
    return {};
  }

  messages() {
    return this.calls
      .filter((c) => c.name === "SendMessageCommand")
      .map((c) => JSON.parse(c.input.MessageBody));
  }
}
