import { useState, useMemo } from "react";
import type { Job } from "../services/types";
import { MOCK_JOBS } from "../services/mockData";

interface JobsTableProps {
  jobs?: Job[];
  highlightGhsa?: string | null;
  onTriggerBatchSweep?: () => void;
}

export function JobsTable({ jobs, highlightGhsa, onTriggerBatchSweep }: JobsTableProps) {
  const items = (jobs && jobs.length > 0) ? jobs : MOCK_JOBS;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ciFilter, setCiFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Counts
  const totalCount = items.length;
  const patchedCount = items.filter((j) => j.status === "patched").length;
  const queuedCount = items.filter((j) => j.status === "queued").length;
  const failedCount = items.filter((j) => j.status === "failed" || j.status === "conflict" || j.status === "blocked").length;

  const ciPassedCount = items.filter((j) => j.ciStatus === "passing").length;
  const ciPendingCount = items.filter((j) => j.ciStatus === "pending").length;
  const ciFailedCount = items.filter((j) => j.ciStatus === "failing" || j.ciStatus === "conflict").length;

  const filtered = useMemo(() => {
    return items.filter((j) => {
      if (statusFilter === "patched" && j.status !== "patched") return false;
      if (statusFilter === "queued" && j.status !== "queued") return false;
      if (statusFilter === "failed" && j.status !== "failed" && j.status !== "conflict" && j.status !== "blocked") return false;

      if (ciFilter === "passed" && j.ciStatus !== "passing") return false;
      if (ciFilter === "pending" && j.ciStatus !== "pending") return false;
      if (ciFilter === "failed" && j.ciStatus !== "failing" && j.ciStatus !== "conflict") return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchRepo = j.repo.toLowerCase().includes(q);
        const matchPkg = j.package.toLowerCase().includes(q);
        const matchPr = j.prNumber ? String(j.prNumber).includes(q) : false;
        const matchGhsa = j.ghsaId ? j.ghsaId.toLowerCase().includes(q) : false;
        if (!matchRepo && !matchPkg && !matchPr && !matchGhsa) return false;
      }
      return true;
    });
  }, [items, statusFilter, ciFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const displayedItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="jobs-view">
      {/* View Header */}
      <div className="view-header">
        <div>
          <div className="view-subhead">
            <span>DISPATCH ENGINE v2.4</span>
            <span>·</span>
            <span className="pulse-dot"></span>
            <span style={{ color: "var(--amber-light)" }}>EventBridge Polling active (500ms)</span>
          </div>
          <h1 className="view-title">Remediation Jobs</h1>
          <p className="view-desc">
            Live tracking of automated dependency bump jobs, pull request dispatches, and CI check status.
          </p>
        </div>
        <div className="view-actions">
          <button className="btn btn-secondary">
            <span>⚙</span> Concurrency (16)
          </button>
          <button className="btn btn-primary" onClick={onTriggerBatchSweep ?? (() => {})}>
            <span>⚡</span> Trigger Batch Sweep
          </button>
        </div>
      </div>

      {/* 4 Pipeline Stat Boxes */}
      <div className="stat-cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginBottom: "20px" }}>
        <div className="stat-card-elevated" style={{ padding: "16px" }}>
          <div className="stat-card-head">
            <div className="stat-card-label">TOTAL PIPELINE JOBS</div>
            <span style={{ color: "var(--amber-light)" }}>📄</span>
          </div>
          <div className="stat-value-wrap">
            <span className="stat-big-num" style={{ fontSize: "28px" }}>{totalCount}</span>
          </div>
          <div className="stat-card-footer">
            <span>Targeting 14 Repos</span>
            <span style={{ color: "var(--emerald)", fontWeight: 600 }}>Auto-pilot ON</span>
          </div>
        </div>

        <div className="stat-card-elevated" style={{ padding: "16px" }}>
          <div className="stat-card-head">
            <div className="stat-card-label">PATCHED &amp; MERGED</div>
            <span style={{ color: "var(--emerald)" }}>✔</span>
          </div>
          <div className="stat-value-wrap">
            <span className="stat-big-num" style={{ color: "var(--emerald)", fontSize: "28px" }}>{patchedCount}</span>
            <span className="stat-big-sub">77.4%</span>
          </div>
          <div className="stat-card-footer">
            <span>Automated merge rate</span>
            <span style={{ color: "var(--emerald)" }}>{patchedCount} / {totalCount} OK</span>
          </div>
        </div>

        <div className="stat-card-elevated" style={{ padding: "16px" }}>
          <div className="stat-card-head">
            <div className="stat-card-label">IN FLIGHT / QUEUED</div>
            <span style={{ color: "var(--cyan)" }}>🔄</span>
          </div>
          <div className="stat-value-wrap">
            <span className="stat-big-num" style={{ color: "var(--amber-light)", fontSize: "28px" }}>{queuedCount}</span>
            <span className="stat-big-sub">active SQS</span>
          </div>
          <div className="stat-card-footer">
            <span>Worker Latency: 42ms avg</span>
          </div>
        </div>

        <div className="stat-card-elevated" style={{ padding: "16px" }}>
          <div className="stat-card-head">
            <div className="stat-card-label">FAILED TRANSITIONS</div>
            <span style={{ color: "var(--red)" }}>⚠</span>
          </div>
          <div className="stat-value-wrap">
            <span className="stat-big-num" style={{ color: "var(--red)", fontSize: "28px" }}>{failedCount}</span>
            <span className="stat-big-sub">Requires triage</span>
          </div>
          <div className="stat-card-footer">
            <span>1 lockfile conflict</span>
            <span style={{ color: "var(--red)" }}>2 branch rules</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="filters-bar">
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <div className="filter-search-box" style={{ width: "320px" }}>
            <input
              className="filter-search-input"
              placeholder="Filter jobs by repository, PR#, or package..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            <span className="kbd-badge" style={{ top: "6px", right: "6px" }}>ESC</span>
          </div>

          <div className="filter-pills-group">
            <button
              className={`filter-pill ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => { setStatusFilter("all"); setPage(1); }}
            >
              All {totalCount}
            </button>
            <button
              className={`filter-pill ${statusFilter === "patched" ? "active" : ""}`}
              onClick={() => { setStatusFilter("patched"); setPage(1); }}
            >
              Patched {patchedCount}
            </button>
            <button
              className={`filter-pill ${statusFilter === "queued" ? "active" : ""}`}
              onClick={() => { setStatusFilter("queued"); setPage(1); }}
            >
              Queued {queuedCount}
            </button>
            <button
              className={`filter-pill ${statusFilter === "failed" ? "active" : ""}`}
              onClick={() => { setStatusFilter("failed"); setPage(1); }}
            >
              Failed {failedCount}
            </button>
          </div>

          <div className="filter-pills-group" style={{ marginLeft: "6px" }}>
            <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>CI:</span>
            <button
              className={`filter-pill ${ciFilter === "all" ? "active" : ""}`}
              onClick={() => { setCiFilter("all"); setPage(1); }}
            >
              All
            </button>
            <button
              className={`filter-pill ${ciFilter === "passed" ? "active" : ""}`}
              onClick={() => { setCiFilter("passed"); setPage(1); }}
            >
              <span style={{ color: "var(--emerald)" }}>●</span> {ciPassedCount}
            </button>
            <button
              className={`filter-pill ${ciFilter === "pending" ? "active" : ""}`}
              onClick={() => { setCiFilter("pending"); setPage(1); }}
            >
              <span style={{ color: "var(--amber-light)" }}>●</span> {ciPendingCount}
            </button>
            <button
              className={`filter-pill ${ciFilter === "failed" ? "active" : ""}`}
              onClick={() => { setCiFilter("failed"); setPage(1); }}
            >
              <span style={{ color: "var(--red)" }}>●</span> {ciFailedCount}
            </button>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="table-card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Target Repository</th>
                <th>Package</th>
                <th>Range → Fixed Bump</th>
                <th>Job Status</th>
                <th>GitHub Pull Request</th>
                <th>CI Status</th>
                <th>Last Update</th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--text-dim)" }}>
                    No remediation jobs match your filters.
                  </td>
                </tr>
              ) : (
                displayedItems.map((j) => {
                  const isHighlighted = j.ghsaId === highlightGhsa;
                  return (
                    <tr
                      key={j.jobId}
                      style={{
                        backgroundColor: isHighlighted ? "rgba(245, 158, 11, 0.08)" : undefined,
                      }}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                          <span style={{ fontSize: "16px", color: "var(--amber-light)", marginTop: "2px" }}>⚡</span>
                          <div>
                            <div className="cell-mono" style={{ fontWeight: 700, color: "#fff" }}>{j.repo}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "2px" }}>
                              {j.branch ?? "main branch • npm"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <code className="cell-mono" style={{ color: "#fff", background: "rgba(255, 255, 255, 0.06)", padding: "2px 6px", borderRadius: "4px" }}>
                            {j.package}
                          </code>
                          {j.isSimulated && (
                            <span style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)", background: "var(--amber-dim)", color: "var(--amber-light)", padding: "1px 5px", borderRadius: "3px", fontWeight: 700 }}>
                              ACTIVE SIM
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="cell-mono" style={{ fontSize: "11.5px" }}>
                          <span style={{ color: "var(--red)" }}>{j.fromRange ?? "unknown"}</span>
                          <span style={{ color: "var(--text-dim)", margin: "0 6px" }}>➔</span>
                          <span style={{ color: "var(--amber-light)", fontWeight: 600 }}>{j.toVersion ?? "latest"}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className="cell-mono"
                          style={{
                            fontSize: "11px",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            display: "inline-block",
                            background:
                              j.status === "patched"
                                ? "rgba(16, 185, 129, 0.12)"
                                : j.status === "queued"
                                ? "rgba(245, 158, 11, 0.12)"
                                : "rgba(239, 68, 68, 0.12)",
                            color:
                              j.status === "patched"
                                ? "var(--emerald)"
                                : j.status === "queued"
                                ? "var(--amber-light)"
                                : "var(--red)",
                            border: `1px solid ${
                              j.status === "patched"
                                ? "rgba(16, 185, 129, 0.3)"
                                : j.status === "queued"
                                ? "rgba(245, 158, 11, 0.3)"
                                : "rgba(239, 68, 68, 0.3)"
                            }`,
                            fontWeight: 600,
                          }}
                        >
                          {j.status === "patched"
                            ? "✔ Patched"
                            : j.status === "queued"
                            ? "● Queued"
                            : j.status === "conflict"
                            ? "Lockfile Conflict"
                            : j.status === "blocked"
                            ? "Branch Rule Block"
                            : "Failed"}
                        </span>
                      </td>
                      <td>
                        {j.prNumber ? (
                          <a
                            className="link-ghsa"
                            href={j.prUrl ?? `https://github.com/${j.repo}/pull/${j.prNumber}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            #{j.prNumber} ↗
                          </a>
                        ) : (
                          <span className="cell-mono" style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontFamily: "var(--font-mono)" }}>
                          {j.ciStatus === "passing" ? (
                            <>
                              <span style={{ color: "var(--emerald)" }}>✔</span>
                              <span style={{ color: "var(--text-muted)" }}>{j.ciDetails ?? "Checks Passed"}</span>
                            </>
                          ) : j.ciStatus === "pending" ? (
                            <>
                              <span className="pulse-dot" style={{ backgroundColor: "var(--amber-light)" }}></span>
                              <span style={{ color: "var(--amber-light)" }}>{j.ciDetails ?? "Executing tests"}</span>
                            </>
                          ) : j.ciStatus === "conflict" ? (
                            <>
                              <span style={{ color: "var(--red)" }}>⚠</span>
                              <span style={{ color: "var(--red)" }}>{j.ciDetails ?? "Merge Conflict"}</span>
                            </>
                          ) : (
                            <>
                              <span style={{ color: "var(--red)" }}>✕</span>
                              <span style={{ color: "var(--red)" }}>{j.ciDetails ?? "Failed"}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="cell-mono" style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                        {j.updatedAt ? `${Math.max(1, Math.floor((Date.now() / 1000 - j.updatedAt) / 60))} mins ago` : "recently"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom LocalStack Worker Pool Status */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "rgba(18, 22, 32, 0.4)", borderTop: "1px solid var(--border-subtle)", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "var(--amber-light)" }}>⚡</span>
            <span>LocalStack Worker Pool: <strong>4 / 4 Online</strong></span>
            <span style={{ color: "var(--amber-light)" }}>●●●●</span>
            <span>|</span>
            <span>SQS Queue: <strong>0 dropped messages</strong></span>
          </div>
          <div className="pagination-controls">
            <button className="page-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>&lt;</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p} className={`page-btn ${page === p ? "active" : ""}`} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(page + 1)}>&gt;</button>
          </div>
        </div>
      </div>

      {/* SQS Execution banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: "6px", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>📄</span>
          <span>Last SQS worker execution: <code>job-uuid: 9b2d8f-4ac1-921f</code> • merged #142 into ANSUJKMEHER/Sentinel</span>
        </div>
        <div>
          <span>Dispatched via Dedicated AWS Enclave</span>
          <span style={{ color: "var(--amber-light)", marginLeft: "12px", cursor: "pointer", fontWeight: 600 }}>
            View RAW Telemetry ↗
          </span>
        </div>
      </div>
    </div>
  );
}
