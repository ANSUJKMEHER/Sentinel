import { useState, useMemo } from "react";
import type { Advisory } from "../services/types";

interface AdvisoriesTableProps {
  advisories?: Advisory[];
  onPoll?: () => void;
}

export function AdvisoriesTable({ advisories, onPoll }: AdvisoriesTableProps) {
  const items = advisories || [];

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Counts
  const criticalCount = items.filter((a) => a.severity.toLowerCase() === "critical").length;
  const highCount = items.filter((a) => a.severity.toLowerCase() === "high").length;
  const moderateCount = items.filter((a) => a.severity.toLowerCase() === "moderate").length;
  const lowCount = items.filter((a) => a.severity.toLowerCase() === "low").length;

  const cronCount = items.filter((a) => a.source !== "simulate").length;
  const simCount = items.filter((a) => a.source === "simulate").length;
  const dispatchedCount = items.filter((a) => a.dispatchStatus === "merged" || a.dispatchStatus === "pushed" || a.prNumber).length;

  // Filtered items
  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (severityFilter !== "all" && a.severity.toLowerCase() !== severityFilter) {
        return false;
      }
      if (sourceFilter !== "all") {
        const src = a.source === "simulate" ? "simulate" : "cron";
        if (src !== sourceFilter) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchGhsa = a.ghsa_id.toLowerCase().includes(q);
        const matchPkg = a.package.toLowerCase().includes(q);
        const matchSummary = a.summary.toLowerCase().includes(q);
        const matchCve = a.cve ? a.cve.toLowerCase().includes(q) : false;
        if (!matchGhsa && !matchPkg && !matchSummary && !matchCve) return false;
      }
      return true;
    });
  }, [items, severityFilter, sourceFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const displayedItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  // CSV Export
  const handleExportCSV = () => {
    const headers = ["GHSA_ID", "Package", "Severity", "Summary", "Vulnerable_Range", "Patched_Version", "Source", "CVE"];
    const rows = filtered.map((a) => [
      a.ghsa_id,
      a.package,
      a.severity,
      `"${a.summary.replace(/"/g, '""')}"`,
      `"${a.vulnerableRange}"`,
      a.firstPatchedVersion ?? "",
      a.source ?? "cron",
      a.cve ?? "",
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sentinel_advisories_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="advisories-view">
      {/* Header */}
      <div className="view-header">
        <div>
          <div className="view-subhead">
            <span className="pulse-dot"></span>
            <span>INTELLIGENCE FEED</span>
            <span>/</span>
            <span style={{ color: "var(--amber-light)" }}>GHSA-SYNCED</span>
          </div>
          <h1 className="view-title">Security Advisories</h1>
          <p className="view-desc">
            Global and simulated GitHub Security Advisories impacting ANSUJKMEHER manifests across 30 repositories.
          </p>
        </div>
        <div className="view-actions">
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <span>📥</span> Export CSV
          </button>
          <button className="btn btn-primary" onClick={onPoll ?? (() => {})}>
            <span>⚡</span> Poll GitHub Advisory DB (GHSA)
          </button>
        </div>
      </div>

      {/* 4 Metric Boxes */}
      <div className="stat-cards-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginBottom: "20px" }}>
        <div className="stat-card-elevated" style={{ padding: "16px" }}>
          <div className="stat-card-head">
            <div className="stat-card-label">CRITICAL CVES</div>
            <span style={{ color: "var(--red)" }}>⚠</span>
          </div>
          <div className="stat-value-wrap">
            <span className="stat-big-num" style={{ color: "var(--red)", fontSize: "28px" }}>
              {String(criticalCount).padStart(2, "0")}
            </span>
            <span className="stat-big-sub">/ {items.length} flagged</span>
          </div>
        </div>

        <div className="stat-card-elevated" style={{ padding: "16px" }}>
          <div className="stat-card-head">
            <div className="stat-card-label">HIGH SEVERITY</div>
            <span style={{ color: "var(--amber-light)" }}>🛡</span>
          </div>
          <div className="stat-value-wrap">
            <span className="stat-big-num" style={{ color: "var(--amber-light)", fontSize: "28px" }}>
              {String(highCount).padStart(2, "0")}
            </span>
            <span className="stat-big-sub">active impact</span>
          </div>
        </div>

        <div className="stat-card-elevated" style={{ padding: "16px" }}>
          <div className="stat-card-head">
            <div className="stat-card-label">AUTO-DISPATCHED</div>
            <span style={{ color: "var(--cyan)" }}>⚡</span>
          </div>
          <div className="stat-value-wrap">
            <span className="stat-big-num" style={{ color: "var(--cyan)", fontSize: "28px" }}>
              {String(dispatchedCount).padStart(2, "0")}
            </span>
            <span className="stat-big-sub">PRs pushed</span>
          </div>
        </div>

        <div className="stat-card-elevated" style={{ padding: "16px" }}>
          <div className="stat-card-head">
            <div className="stat-card-label">FEED LATENCY</div>
            <span style={{ color: "var(--text-dim)" }}>⏱</span>
          </div>
          <div className="stat-value-wrap">
            <span className="stat-big-num" style={{ fontSize: "28px" }}>42s</span>
            <span className="stat-big-sub">GHSA webhook</span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="filters-bar">
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {/* Severity Pills */}
          <div className="filter-pills-group">
            <button
              className={`filter-pill ${severityFilter === "all" ? "active" : ""}`}
              onClick={() => { setSeverityFilter("all"); setPage(1); }}
            >
              All {items.length}
            </button>
            <button
              className={`filter-pill ${severityFilter === "critical" ? "active" : ""}`}
              onClick={() => { setSeverityFilter("critical"); setPage(1); }}
            >
              <span style={{ color: "var(--red)" }}>●</span> Critical {criticalCount}
            </button>
            <button
              className={`filter-pill ${severityFilter === "high" ? "active" : ""}`}
              onClick={() => { setSeverityFilter("high"); setPage(1); }}
            >
              <span style={{ color: "var(--amber-light)" }}>●</span> High {highCount}
            </button>
            <button
              className={`filter-pill ${severityFilter === "moderate" ? "active" : ""}`}
              onClick={() => { setSeverityFilter("moderate"); setPage(1); }}
            >
              <span style={{ color: "var(--cyan)" }}>●</span> Moderate {moderateCount}
            </button>
            <button
              className={`filter-pill ${severityFilter === "low" ? "active" : ""}`}
              onClick={() => { setSeverityFilter("low"); setPage(1); }}
            >
              <span style={{ color: "var(--text-dim)" }}>●</span> Low {lowCount}
            </button>
          </div>

          {/* Source Pills */}
          <div className="filter-pills-group">
            <button
              className={`filter-pill ${sourceFilter === "all" ? "active" : ""}`}
              onClick={() => { setSourceFilter("all"); setPage(1); }}
            >
              All Sources
            </button>
            <button
              className={`filter-pill ${sourceFilter === "cron" ? "active" : ""}`}
              onClick={() => { setSourceFilter("cron"); setPage(1); }}
            >
              Cron ({cronCount})
            </button>
            <button
              className={`filter-pill ${sourceFilter === "simulate" ? "active" : ""}`}
              onClick={() => { setSourceFilter("simulate"); setPage(1); }}
            >
              Simulate ({simCount})
            </button>
          </div>
        </div>

        {/* Search Box */}
        <div className="filter-search-box">
          <input
            className="filter-search-input"
            placeholder="Search by GHSA ID, CVE, or npm package..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <span className="kbd-badge" style={{ top: "6px", right: "6px" }}>⌘K</span>
        </div>
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Advisory</th>
                <th>Package</th>
                <th>Severity</th>
                <th>Advisory Summary</th>
                <th>Vulnerable</th>
                <th>Patched</th>
                <th>Source</th>
                <th>Dispatched Status</th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "32px", color: "var(--text-dim)" }}>
                    No advisories matched the current filters.
                  </td>
                </tr>
              ) : (
                displayedItems.map((a) => (
                  <tr key={a.ghsa_id}>
                    <td>
                      <div>
                        <a
                          className="link-ghsa"
                          href={`https://github.com/advisories/${a.ghsa_id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {a.ghsa_id}
                        </a>
                        {a.cve && (
                          <div style={{ fontSize: "10.5px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                            {a.cve}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <code className="cell-mono" style={{ color: "var(--text-main)", background: "var(--gh-badge-bg)", padding: "2px 6px", borderRadius: "4px" }}>
                        {a.package}
                      </code>
                    </td>
                    <td>
                      <span className={`badge-tag ${a.severity.toLowerCase()}`}>
                        ● {a.severity}
                      </span>
                    </td>
                    <td className="cell-summary" title={a.summary}>
                      {a.summary}
                    </td>
                    <td className="cell-mono" style={{ color: "var(--red)" }}>
                      {a.vulnerableRange}
                    </td>
                    <td className="cell-mono" style={{ color: "var(--emerald)", fontWeight: 600 }}>
                      {a.firstPatchedVersion ?? "—"}
                    </td>
                    <td>
                      <span className={`source-badge ${a.source === "simulate" ? "simulate" : "cron"}`}>
                        {a.source ?? "cron:sync"}
                      </span>
                    </td>
                    <td>
                      {a.dispatchStatus === "merged" || a.prNumber ? (
                        <span className="dispatch-badge merged">
                          ✔ PR #{a.prNumber ?? 142} Merged
                        </span>
                      ) : a.dispatchStatus === "pushed" ? (
                        <span className="dispatch-badge pushed">
                          📦 PR #{a.prNumber ?? 80} Pushed
                        </span>
                      ) : a.dispatchStatus === "queued" ? (
                        <span className="dispatch-badge queued">
                          ⏳ PR Queued
                        </span>
                      ) : (
                        <span className="dispatch-badge simulated">
                          ⚡ Simulated (Dry-Run)
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="table-pagination">
          <span>
            Showing {displayedItems.length > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} advisories
          </span>
          <div className="pagination-controls">
            <button className="page-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>
              &lt;
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                className={`page-btn ${page === p ? "active" : ""}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
              &gt;
            </button>
          </div>
        </div>
      </div>

      {/* Real-Time Manifest Observer Banner */}
      <div className="observer-banner">
        <div className="observer-left">
          <div className="observer-icon">❄</div>
          <div>
            <div className="observer-title">Sentinel Real-Time Manifest Observer</div>
            <div className="observer-desc">
              Sentinel automatically correlates GHSA stream events with dependencies across GitHub, GitLab, and Bitbucket cloud enclaves.
            </div>
          </div>
        </div>
        <div className="observer-right">
          <span className="next-poll">Next poll in <strong>03:42</strong></span>
          <button className="btn btn-secondary btn-sm" onClick={onPoll ?? (() => {})}>
            Configure Sync Frequency
          </button>
        </div>
      </div>
    </div>
  );
}
