import type { State } from "../services/types";
import { MOCK_STATS, MOCK_JOBS } from "../services/mockData";

interface OverviewProps {
  state: State | null;
  onNewSimulation: () => void;
  onViewJobs: () => void;
  onRefresh: () => void;
}

export function OverviewView({ state, onNewSimulation, onViewJobs, onRefresh }: OverviewProps) {
  const stats = state?.stats ?? MOCK_STATS;
  const jobs = (state?.jobs && state.jobs.length > 0) ? state.jobs : MOCK_JOBS;
  const recentJobs = jobs.slice(0, 5);

  const cleanRepos = stats.cleanRepos ?? 42;
  const totalRepos = stats.reposMonitored ?? 47;
  const pendingRepos = stats.pendingPatchRepos ?? 5;
  const cleanPercent = Math.round((cleanRepos / Math.max(totalRepos, 1)) * 100);

  const prsDispatched = stats.prsOpened ?? 31;
  const prsMerged = stats.prsMerged ?? 27;
  const acceptanceRate = stats.acceptanceRate ?? 87.1;

  const criticalHigh = stats.criticalHighCount ?? 3;

  return (
    <div className="overview-view">
      {/* View Header */}
      <div className="view-header">
        <div>
          <div className="view-subhead">
            <span>TELEMETRY ENGINE</span>
            <span>/</span>
            <span className="pulse-dot"></span>
            <span style={{ color: "var(--emerald)" }}>Live Sync Active</span>
          </div>
          <h1 className="view-title">Security Overview</h1>
          <p className="view-desc">
            Organization-wide dependency vulnerability mitigation and automated pull request orchestration across{" "}
            <strong style={{ color: "#fff" }}>{totalRepos} repositories</strong>.
          </p>
        </div>
        <div className="view-actions">
          <button className="btn btn-secondary" onClick={onRefresh} title="Trigger real-time scan">
            <span>🔄</span> Trigger Scan
          </button>
          <button className="btn btn-primary" onClick={onNewSimulation}>
            <span>⚡</span> New Simulation ➔
          </button>
        </div>
      </div>

      {/* 3 Elevated Stat Cards */}
      <div className="stat-cards-grid">
        {/* Card 1: Remediation Velocity */}
        <div className="stat-card-elevated">
          <div className="stat-card-head">
            <div className="stat-card-label">
              <span>🚀</span> REMEDIATION VELOCITY
            </div>
            <span className="stat-badge amber">↗ +12% this week</span>
          </div>
          <div>
            <div className="stat-value-wrap">
              <span className="stat-big-num">{prsDispatched}</span>
              <span className="stat-big-sub">Automated PRs Dispatched</span>
            </div>
            <div className="stat-meta-line">
              <span style={{ color: "var(--amber-light)" }}>●</span>
              <span>{prsMerged} merged</span>
              <span>·</span>
              <span style={{ color: "var(--amber-light)", fontWeight: 600 }}>{acceptanceRate}%</span>
              <span>acceptance rate</span>
            </div>
            <div className="stat-progress-track">
              <div className="stat-progress-fill amber" style={{ width: `${acceptanceRate}%` }}></div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span>Goal: 85% Auto-merge</span>
            <span className="status-target">SLA Met</span>
          </div>
        </div>

        {/* Card 2: Fleet Integrity */}
        <div className="stat-card-elevated">
          <div className="stat-card-head">
            <div className="stat-card-label">
              <span>❄</span> FLEET INTEGRITY
            </div>
            <span className="stat-badge muted">100% Manifest Scan</span>
          </div>
          <div>
            <div className="stat-value-wrap">
              <span className="stat-big-num">
                {cleanRepos}<span style={{ fontSize: "24px", color: "var(--text-dim)", fontWeight: 400 }}>/{totalRepos}</span>
              </span>
              <span className="stat-big-sub">Clean Repositories</span>
            </div>
            <div className="stat-meta-line">
              <span style={{ color: "var(--red)" }}>●</span>
              <span>{pendingRepos} pending patch</span>
              <span>·</span>
              <span>All lockfiles synced</span>
            </div>
            <div className="stat-progress-track">
              <div className="stat-progress-fill amber" style={{ width: `${cleanPercent}%` }}></div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span>{cleanPercent}% Zero Vulnerabilities</span>
            <span className="status-ok">Cluster OK</span>
          </div>
        </div>

        {/* Card 3: Active Threat Exposure */}
        <div className="stat-card-elevated">
          <div className="stat-card-head">
            <div className="stat-card-label">
              <span>🛡</span> ACTIVE THREAT EXPOSURE
            </div>
            <span className="stat-badge red">Action Required</span>
          </div>
          <div>
            <div className="stat-value-wrap">
              <span className="stat-big-num" style={{ color: "var(--red)" }}>{criticalHigh}</span>
              <span className="stat-big-sub">Critical &amp; High CVEs</span>
            </div>
            <div className="stat-meta-line">
              <span>⏱</span>
              <span>SLA Mean Resolution: 42m</span>
            </div>
            <div className="stat-progress-track">
              <div className="stat-progress-fill red" style={{ width: "70%" }}></div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span>Target: &lt; 60m response</span>
            <span className="status-target">Within Target</span>
          </div>
        </div>
      </div>

      {/* Two Column Grid */}
      <div className="overview-grid">
        {/* Left Column: Recent Automated Remediation PRs */}
        <div className="panel-card">
          <div className="panel-header-row">
            <div className="panel-header-title">
              <span>⚡</span> Recent Automated Remediation PRs
            </div>
            <div className="panel-header-sub">{recentJobs.length} latest auto-dispatches</div>
          </div>

          <div className="recent-prs-list">
            {recentJobs.map((j) => (
              <div key={j.jobId} className="recent-pr-item">
                <div className="pr-icon-badge">⚡</div>
                <div className="pr-content">
                  <div className="pr-top-line">
                    <span className="pr-repo">{j.repo}</span>
                    <span className="pr-number">#{j.prNumber ?? 100}</span>
                    <span className="pr-manifest">{j.manifest ?? "package.json"}</span>
                  </div>
                  <div className="pr-diff-line">
                    <span className="diff-pkg">{j.package}</span>
                    <span className="diff-from">{j.fromRange ?? "unknown"}</span>
                    <span className="diff-arrow">➔</span>
                    <span className="diff-to">{j.toVersion ?? "latest"}</span>
                    <span>·</span>
                    <span className="diff-summary">{j.ciDetails ?? "Vulnerability mitigation"}</span>
                  </div>
                </div>
                <div className="pr-status-col">
                  <span className={`ci-pill ${j.ciStatus === "passing" ? "passed" : j.ciStatus === "conflict" ? "conflict" : "pending"}`}>
                    {j.ciStatus === "passing" ? "✔ CI Passed" : j.ciStatus === "conflict" ? "⚠ Conflict" : "● CI Pending"}
                  </span>
                  <div className="time-ago">
                    {j.updatedAt ? `${Math.max(1, Math.floor((Date.now() / 1000 - j.updatedAt) / 60))}m ago` : "recently"}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="panel-footer-link">
            <span>Showing latest {recentJobs.length} of {jobs.length} dispatched PRs</span>
            <span className="panel-link" onClick={onViewJobs}>
              View remediation pipeline ➔
            </span>
          </div>
        </div>

        {/* Right Column: Fleet Protection Pulse & Callout */}
        <div>
          <div className="panel-card pulse-card">
            <div className="panel-header-row">
              <div className="panel-header-title">
                <span>🛡</span> Fleet Protection Pulse
              </div>
              <span className="pulse-dot" style={{ backgroundColor: "var(--amber-light)", boxShadow: "0 0 8px var(--amber-light)" }}></span>
            </div>

            <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "8px", fontWeight: 700 }}>
              High Surface Packages
            </div>
            <div className="surface-packages-list">
              <div className="surface-item">
                <span className="surface-pkg-name">lodash</span>
                <span className="surface-clean-count">28 repos clean</span>
              </div>
              <div className="surface-item">
                <span className="surface-pkg-name">axios</span>
                <span className="surface-clean-count">26 repos clean</span>
              </div>
              <div className="surface-item">
                <span className="surface-pkg-name">jsonwebtoken</span>
                <span className="surface-clean-count">27 repos clean</span>
              </div>
              <div className="surface-item">
                <span className="surface-pkg-name">semver</span>
                <span className="surface-clean-count">30 repos clean</span>
              </div>
            </div>

            <div className="cadence-block">
              <div className="cadence-head">
                <span>SYNC CADENCE</span>
                <span className="cadence-badge">AWS EventBridge</span>
              </div>
              <div className="cadence-cron">⏱ Cron: Every 5 minutes</div>
              <p className="cadence-desc">
                Manifest digests calculated via AWS Lambda micro-workers running in isolated VPC enclaves.
              </p>
            </div>

            <div className="metrics-key-value">
              <div className="metric-kv-row">
                <span className="metric-kv-key">Daemon Uptime</span>
                <span className="metric-kv-val">99.98% (42d 16h)</span>
              </div>
              <div className="metric-kv-row">
                <span className="metric-kv-key">Scan Latency Avg</span>
                <span className="metric-kv-val">418ms / manifest</span>
              </div>
              <div className="metric-kv-row">
                <span className="metric-kv-key">GitHub App Bot</span>
                <span className="metric-kv-val healthy">sentinel[bot] • Active</span>
              </div>
              <div className="metric-kv-row">
                <span className="metric-kv-key">GitHub API Tokens</span>
                <span className="metric-kv-val healthy">Healthy (94% quota)</span>
              </div>
            </div>
          </div>

          <div className="callout-card">
            <div className="callout-title">
              <span>💡</span> Need zero-friction testing?
            </div>
            <p className="callout-text">
              Use the dry-run simulator to synthesize mock CVE advisories against real org repositories without triggering live GitHub pull requests.
            </p>
            <button className="callout-btn" onClick={onNewSimulation}>
              Launch simulation workbench ↗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
