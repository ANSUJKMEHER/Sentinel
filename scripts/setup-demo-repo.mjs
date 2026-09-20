import { execSync } from "node:child_process";

const ORG = "ANSUJKMEHER";
const REPO = "sentinel-demo-service";

// Get token from gh CLI
const token = execSync("gh auth token", { encoding: "utf8" }).trim();

const packageJson = {
  name: "sentinel-demo-service",
  version: "1.0.0",
  description: "Live vulnerable service monitored by Sentinel",
  dependencies: {
    lodash: "4.17.20",
    axios: "0.21.1"
  }
};

const contentBase64 = Buffer.from(JSON.stringify(packageJson, null, 2)).toString("base64");

// 1. Check if package.json exists to get sha (if updating)
let sha = undefined;
try {
  const getRes = await fetch(`https://api.github.com/repos/${ORG}/${REPO}/contents/package.json`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (getRes.ok) {
    const data = await getRes.json();
    sha = data.sha;
  }
} catch {}

// 2. Put package.json
const putRes = await fetch(`https://api.github.com/repos/${ORG}/${REPO}/contents/package.json`, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
  body: JSON.stringify({
    message: "feat: add vulnerable lodash@4.17.20 and axios@0.21.1 for Sentinel demonstration",
    content: contentBase64,
    sha: sha,
  }),
});

if (!putRes.ok) {
  const err = await putRes.text();
  console.error("Failed to commit package.json:", err);
  process.exit(1);
}

console.log(`\n✔ Successfully committed package.json to https://github.com/${ORG}/${REPO}`);
console.log("  Dependencies added:");
console.log('    - lodash: "4.17.20" (Vulnerable to GHSA-jf85-cpcp-j695)');
console.log('    - axios: "0.21.1"   (Vulnerable to GHSA-rp65-9cf3-cjxr)\n');
