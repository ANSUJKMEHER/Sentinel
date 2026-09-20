# 🔐 Sentinel — GitHub App Integration Guide

Sentinel operates as a native **GitHub App**, opening automated security remediation pull requests under the enterprise identity **`sentinel[bot]`**.

---

## 🚀 Quick Setup (2 Minutes)

### Step 1: Create the GitHub App

1. Go to your GitHub account:
   - **Personal Account**: [github.com/settings/apps/new](https://github.com/settings/apps/new)
   - **Organization**: `https://github.com/organizations/<YOUR_ORG>/settings/apps/new`
2. Enter the App details:
   - **GitHub App name**: `Sentinel Security Bot` (or `sentinel-<yourname>`)
   - **Homepage URL**: `https://github.com/ANSUJKMEHER/Sentinel`
   - **Webhook**: Uncheck *Active* for local development (or enter your LocalStack/ngrok webhook URL).
3. Set **Permissions**:
   - **Repository permissions**:
     - `Contents`: **Read & write** (to create branches and update `package.json`)
     - `Pull requests`: **Read & write** (to open and label remediation PRs)
     - `Issues`: **Read & write** (for notifications)
     - `Dependabot alerts` / `Vulnerability alerts`: **Read-only**
4. Click **Create GitHub App**.

---

### Step 2: Generate a Private Key & Install the App

1. On your newly created GitHub App page, scroll down to **Private keys** and click **Generate a private key**.
   - A `.pem` file will download to your computer.
2. Note your **App ID** (shown near the top).
3. On the left sidebar, click **Install App**, and install it on your organization or selected repositories.
4. Note your **Installation ID** (visible in the URL after clicking install, e.g. `https://github.com/settings/installations/12345678` -> `12345678`).

---

### Step 3: Connect to Sentinel

#### Option A: Quick Installation Token (Fastest for testing)
You can generate a temporary installation token using the GitHub CLI:
```powershell
# Using GitHub CLI
gh auth token
```
Store it into LocalStack SSM:
```powershell
awslocal ssm put-parameter --name "/sentinel/github-token" --value "<TOKEN>" --type "SecureString" --overwrite
```

#### Option B: Full GitHub App Credentials in LocalStack SSM
Store your GitHub App config in SSM so Sentinel automatically generates fresh installation tokens:
```powershell
$appConfig = @{
    appId = "123456"
    installationId = "12345678"
    privateKey = (Get-Content -Raw "path/to/your-private-key.pem")
} | ConvertTo-Json -Compress

awslocal ssm put-parameter --name "/sentinel/github-app" --value $appConfig --type "SecureString" --overwrite
```

---

## 🎯 What Happens Next

1. Sentinel detects any new npm GitHub Security Advisory (GHSA).
2. It scans all repositories where the Sentinel App is installed.
3. Sentinel automatically creates a fix branch: `sentinel/ghsa-xxxx`
4. Sentinel opens a pull request authored by **`sentinel[bot]`**:
   - Title: `fix(deps): bump <package> to <version> (GHSA-xxxx)`
   - Includes full CVE summary, semver range diff, and Bedrock AI explanation.
   - Automatically tagged with `security`, `dependencies`, and `sentinel-automerge`.
