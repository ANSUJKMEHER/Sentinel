import { DynamoDBClient, CreateTableCommand, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { SQSClient, CreateQueueCommand, ListQueuesCommand } from "@aws-sdk/client-sqs";
import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";
import { execSync } from "node:child_process";

const endpoint = "http://localhost:4566";
const region = "us-east-1";

const ddb = new DynamoDBClient({
  endpoint,
  region,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

const sqs = new SQSClient({
  endpoint,
  region,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

const ssm = new SSMClient({
  endpoint,
  region,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

const ADVISORIES_TABLE = process.env.ADVISORIES_TABLE || "sentinel-local-AdvisoriesTable-b83d610f";
const REPOS_TABLE = process.env.REPOS_TABLE || "sentinel-local-ReposTable-046e9214";
const JOBS_TABLE = process.env.JOBS_TABLE || "sentinel-local-JobsTable-3b9bcbbd";

console.log("Checking LocalStack resources...");

const existingTables = (await ddb.send(new ListTablesCommand({}))).TableNames || [];

async function ensureTable(tableName, keyName) {
  if (existingTables.includes(tableName)) {
    console.log(`✔ Table ${tableName} exists.`);
    return;
  }
  console.log(`Creating table ${tableName}...`);
  await ddb.send(
    new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [{ AttributeName: keyName, AttributeType: "S" }],
      KeySchema: [{ AttributeName: keyName, KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    })
  );
  console.log(`✔ Created table ${tableName}.`);
}

await ensureTable(ADVISORIES_TABLE, "ghsa_id");
await ensureTable(REPOS_TABLE, "repo");
await ensureTable(JOBS_TABLE, "jobId");

// Ensure SQS queues
const existingQueues = (await sqs.send(new ListQueuesCommand({}))).QueueUrls || [];

async function ensureQueue(queueName) {
  const exists = existingQueues.some((q) => q.includes(queueName));
  if (exists) {
    console.log(`✔ Queue ${queueName} exists.`);
    return;
  }
  console.log(`Creating queue ${queueName}...`);
  await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
  console.log(`✔ Created queue ${queueName}.`);
}

await ensureQueue("sentinel-local-AdvisoryQueue-daa50dbc");
await ensureQueue("sentinel-local-PatchQueue-ae91ce92");

// Store GitHub token in SSM
let token = "";
try {
  token = execSync("gh auth token", { encoding: "utf8" }).trim();
} catch {}

if (token) {
  await ssm.send(
    new PutParameterCommand({
      Name: "/sentinel/github-token",
      Value: token,
      Type: "SecureString",
      Overwrite: true,
    })
  );
  console.log("✔ Stored GitHub token in LocalStack SSM.");
}

console.log("🎉 LocalStack resources are ready!");
