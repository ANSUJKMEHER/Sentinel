import http from "node:http";
import { execSync } from "node:child_process";
import { handler } from "../backend/state.mjs";

const PORT = process.env.PORT || 3001;

// Read GitHub token from gh auth token if not already in env
try {
  process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || execSync("gh auth token", { encoding: "utf8" }).trim();
} catch {}

// Configure AWS SDK environment for LocalStack
process.env.AWS_REGION = "us-east-1";
process.env.AWS_DEFAULT_REGION = "us-east-1";
process.env.AWS_ENDPOINT_URL = process.env.AWS_ENDPOINT_URL || "http://localhost:4566";
process.env.AWS_ACCESS_KEY_ID = "test";
process.env.AWS_SECRET_ACCESS_KEY = "test";
process.env.ADVISORIES_TABLE = process.env.ADVISORIES_TABLE || "sentinel-local-AdvisoriesTable-b83d610f";
process.env.REPOS_TABLE = process.env.REPOS_TABLE || "sentinel-local-ReposTable-046e9214";
process.env.JOBS_TABLE = process.env.JOBS_TABLE || "sentinel-local-JobsTable-3b9bcbbd";
process.env.ADVISORY_QUEUE_URL = process.env.ADVISORY_QUEUE_URL || "http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/sentinel-local-AdvisoryQueue-daa50dbc";

const server = http.createServer(async (req, res) => {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  // Collect request body
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf8");

  // Format as Lambda HttpApi event
  const event = {
    rawPath: req.url.split("?")[0],
    requestContext: {
      http: {
        method: req.method,
        path: req.url.split("?")[0],
      },
    },
    body: body || undefined,
  };

  try {
    const result = await handler(event);
    const headers = { ...(result.headers || {}) };
    delete headers["access-control-allow-origin"];
    delete headers["Access-Control-Allow-Origin"];
    headers["Access-Control-Allow-Origin"] = "*";
    
    res.writeHead(result.statusCode || 200, headers);
    res.end(result.body);
  } catch (err) {
    console.error("Handler error:", err);
    res.writeHead(500, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`\n✔ Sentinel LocalStack API Gateway running at: http://localhost:${PORT}`);
  console.log(`  - GET  http://localhost:${PORT}/state`);
  console.log(`  - POST http://localhost:${PORT}/advisories/simulate`);
  console.log(`  - GET  http://localhost:${PORT}/report\n`);
});
