import { execSync } from "node:child_process";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { handler as impactHandler } from "../backend/impact.mjs";
import { handler as patchHandler } from "../backend/patch.mjs";

const ORG = "ANSUJKMEHER";
const token = execSync("gh auth token", { encoding: "utf8" }).trim();
process.env.GITHUB_TOKEN = token;

// LocalStack environment
process.env.AWS_REGION = "us-east-1";
process.env.AWS_DEFAULT_REGION = "us-east-1";
process.env.AWS_ENDPOINT_URL = "http://localhost:4566";
process.env.AWS_ACCESS_KEY_ID = "test";
process.env.AWS_SECRET_ACCESS_KEY = "test";
process.env.GITHUB_ORG = ORG;
process.env.ADVISORIES_TABLE = "sentinel-local-AdvisoriesTable-b83d610f";
process.env.REPOS_TABLE = "sentinel-local-ReposTable-046e9214";
process.env.JOBS_TABLE = "sentinel-local-JobsTable-3b9bcbbd";
process.env.PATCH_QUEUE_URL = "http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/sentinel-local-PatchQueue-ae91ce92";
process.env.ADVISORY_QUEUE_URL = "http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/sentinel-local-AdvisoryQueue-daa50dbc";

// Store token in SSM
execSync(`awslocal ssm put-parameter --name "/sentinel/github-token" --value "${token}" --type "SecureString" --overwrite`, { stdio: "ignore" });

console.log("=================================================");
console.log(`🚀 Running Live Sentinel Pipeline for: ${ORG}`);
console.log("=================================================");

// 1. First populate real repos from GitHub into DynamoDB
console.log("\n[1/4] Fetching real repositories from GitHub for " + ORG + "...");
const reposRes = await fetch(`https://api.github.com/users/${ORG}/repos?per_page=30&sort=updated`, {
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
});

const ddb = new DynamoDBClient({ endpoint: "http://localhost:4566", region: "us-east-1" });

if (reposRes.ok) {
  const repos = await reposRes.json();
  console.log(`✔ Found ${repos.length} real repositories on GitHub.`);
  for (const r of repos) {
    await ddb.send(
      new PutItemCommand({
        TableName: process.env.REPOS_TABLE,
        Item: {
          repo: { S: r.full_name },
          defaultBranch: { S: r.default_branch || "main" },
          private: { BOOL: Boolean(r.private) },
          archived: { BOOL: Boolean(r.archived) },
          excluded: { BOOL: false },
          lastSeenAt: { N: String(Math.floor(Date.now() / 1000)) },
          description: { S: r.description || "Active repository" },
        },
      })
    );
  }
  console.log("✔ Stored all real repositories in LocalStack DynamoDB ReposTable.");
}

// 2. Advisory payload for lodash
const advisory = {
  ghsa_id: "GHSA-jf85-cpcp-j695",
  package: "lodash",
  severity: "high",
  summary: "Command injection in lodash via template function",
  vulnerable_range: ">= 4.0.0, < 4.17.21",
  first_patched_version: "4.17.21",
  cve: "CVE-2021-23337",
  source: "simulate",
};

// Store in AdvisoriesTable
await ddb.send(
  new PutItemCommand({
    TableName: process.env.ADVISORIES_TABLE,
    Item: {
      ghsa_id: { S: advisory.ghsa_id },
      package: { S: advisory.package },
      severity: { S: advisory.severity },
      summary: { S: advisory.summary },
      vulnerableRange: { S: advisory.vulnerable_range },
      firstPatchedVersion: { S: advisory.first_patched_version },
      cve: { S: advisory.cve },
      source: { S: advisory.source },
      action: { S: "remediate" },
      publishedAt: { S: new Date().toISOString() },
    },
  })
);
console.log("\n[2/4] Advisory GHSA-jf85-cpcp-j695 stored in LocalStack DynamoDB.");

// 3. Run Impact analysis
console.log("\n[3/4] Running Impact analysis across org repositories...");
const impactEvent = {
  Records: [
    {
      body: JSON.stringify(advisory),
    },
  ],
};

const impactResult = await impactHandler(impactEvent);
console.log("✔ Impact analysis complete:", impactResult);

// 4. Now find any queued jobs and run Patch handler to create real PR on GitHub
import { ScanCommand } from "@aws-sdk/client-dynamodb";
const jobsScan = await ddb.send(new ScanCommand({ TableName: process.env.JOBS_TABLE }));
const queuedJobs = jobsScan.Items || [];

console.log(`\n[4/4] Found ${queuedJobs.length} affected remediation job(s).`);

for (const item of queuedJobs) {
  const job = {
    jobId: item.jobId.S,
    ghsa_id: item.ghsaId.S,
    ghsaId: item.ghsaId.S,
    repo: item.repo.S,
    package: item.package.S,
    from_range: item.fromRange?.S,
    fromRange: item.fromRange?.S,
    toVersion: item.toVersion?.S,
    first_patched_version: item.toVersion?.S,
    vulnerable_range: advisory.vulnerable_range,
    default_branch: item.defaultBranch?.S || "main",
    defaultBranch: item.defaultBranch?.S || "main",
    severity: advisory.severity,
    summary: advisory.summary,
  };

  console.log(`\n⚡ Opening REAL Pull Request for ${job.repo} (${job.package} -> ${job.toVersion})...`);
  
  const patchEvent = {
    Records: [
      {
        body: JSON.stringify(job),
      },
    ],
  };

  try {
    const patchRes = await patchHandler(patchEvent);
    console.log("✔ Patch handler result:", patchRes);
  } catch (err) {
    console.error("Patch error:", err);
  }
}

console.log("\n=================================================");
console.log("🎉 Full Live Pipeline Execution Complete!");
console.log("=================================================\n");
