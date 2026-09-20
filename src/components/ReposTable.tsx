import { useState, useMemo } from "react";
import type { Repo } from "../services/types";

interface ReposTableProps {
  repos?: Repo[];
  onRescan?: () => void;
}

export function ReposTable({ repos, onRescan }: ReposTableProps) {
  const items = repos || [];

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "monitored" | "excluded" | "private" | "public">("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Counts
  const totalCount = items.length;
  const monitoredCount = items.filter((r) => !r.excluded && r.status !== "excluded").length;
  const excludedCount = items.filter((r) => r.excluded || r.status === "excluded").length;
  const privateCount = items.filter((r) => r.private).length;
  const publicCount = items.filter((r) => !r.private).length;

  const filtered = useMemo(() => {
    return items.filter((r) => {
      if (filter === "monitored" && (r.excluded || r.status === "excluded")) return false;
      if (filter === "excluded" && !r.excluded && r.status !== "excluded") return false;
      if (filter === "private" && !r.private) return false;
      if (filter === "public" && r.private) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = r.repo.toLowerCase().includes(q);
        const matchDesc = r.description ? r.description.toLowerCase().includes(q) : false;
        if (!matchName && !matchDesc) return false;
      }
      return true;
    });
  }, [items, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const displayedItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="repos-view">
      {/* View Header */}
      <div className="view-header">
        <div>
          <div className="view-subhead">
            <span className="pulse-dot"></span>
            <span>FLEET INVENTORY MANAGEMENT</span>
            <span>·</span>
            <span>GITHUB ORG: ANSUJKMEHER</span>
          </div>
          <h1 className="view-title">Monitored Repositories</h1>
          <p className="view-desc">
            Continuous inventory and manifest inspection for all active repositories in ANSUJKMEHER.
          </p>
        </div>
        <div className="view-actions" style={{ gap: "16px" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-main)", lineHeight: 1 }}>{totalCount}</div>
            <div style={{ fontSize: "10.5px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>TOTAL Repositories</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--amber-light)", lineHeight: 1 }}>● {monitoredCount}</div>
            <div style={{ fontSize: "10.5px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>MONITORED Repos</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-muted)", lineHeight: 1 }}>{excludedCount}</div>
            <div style={{ fontSize: "10.5px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>EXCLUDED ({excludedCount})</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filters-bar">
        <div className="filter-pills-group">
          <button
            className={`filter-pill ${filter === "all" ? "active" : ""}`}
            onClick={() => { setFilter("all"); setPage(1); }}
          >
            All ({totalCount})
          </button>
          <button
            className={`filter-pill ${filter === "monitored" ? "active" : ""}`}
            onClick={() => { setFilter("monitored"); setPage(1); }}
          >
            Monitored ({monitoredCount})
          </button>
          <button
            className={`filter-pill ${filter === "excluded" ? "active" : ""}`}
            onClick={() => { setFilter("excluded"); setPage(1); }}
          >
            Excluded ({excludedCount})
          </button>
          <button
            className={`filter-pill ${filter === "private" ? "active" : ""}`}
            onClick={() => { setFilter("private"); setPage(1); }}
          >
            Private ({privateCount})
          </button>
          <button
            className={`filter-pill ${filter === "public" ? "active" : ""}`}
            onClick={() => { setFilter("public"); setPage(1); }}
          >
            Public ({publicCount})
          </button>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div className="filter-search-box">
            <input
              className="filter-search-input"
              placeholder="Filter repositories by name..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            <span className="kbd-badge" style={{ top: "6px", right: "6px" }}>ESC</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onRescan ?? (() => {})}>
            <span>🔄</span> Re-scan Organization Repositories
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className="table-card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Repository Name</th>
                <th>Branch</th>
                <th>Visibility</th>
                <th>Status</th>
                <th>Manifest Engines</th>
                <th>Dependency Graph</th>
                <th>Last Sync</th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--text-dim)" }}>
                    No repositories matched your filters.
                  </td>
                </tr>
              ) : (
                displayedItems.map((r) => {
                  const isExcluded = r.excluded || r.status === "excluded";
                  const deps = r.dependencyCount ?? 100;
                  const depPct = Math.min(100, Math.round((deps / 450) * 100));

                  return (
                    <tr key={r.repo}>
                      <td>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                          <span style={{ fontSize: "16px", color: "var(--amber-light)", marginTop: "2px" }}>
                            {r.archived ? "📦" : r.private ? "🔒" : "📁"}
                          </span>
                          <div>
                            <a
                              className="link-ghsa"
                              href={`https://github.com/${r.repo}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ textDecoration: r.archived ? "line-through" : "none" }}
                            >
                              {r.repo}
                            </a>
                            <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "2px" }}>
                              {r.description ?? "Repository manifest"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <code className="cell-mono" style={{ color: "var(--text-muted)", background: "var(--gh-badge-bg)", padding: "2px 6px", borderRadius: "3px" }}>
                          {r.defaultBranch ?? "main"}
                        </code>
                      </td>
                      <td>
                        <span
                          className="cell-mono"
                          style={{
                            fontSize: "11px",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            background: r.private ? "var(--gh-badge-bg)" : "rgba(6, 182, 212, 0.12)",
                            color: r.private ? "var(--text-muted)" : "var(--cyan)",
                            border: `1px solid ${r.private ? "var(--border-subtle)" : "rgba(6, 182, 212, 0.3)"}`,
                          }}
                        >
                          {r.private ? "🔒 Private" : "🌐 Public"}
                        </span>
                      </td>
                      <td>
                        <span
                          className="cell-mono"
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: isExcluded ? "var(--text-dim)" : "var(--amber-light)",
                          }}
                        >
                          {isExcluded ? (r.archived ? "● Excluded (Archived)" : "● Excluded (Non-JS)") : "● Monitored"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                          {r.manifestEngines ? (
                            r.manifestEngines.map((m, idx) => (
                              <span key={idx}>{m}</span>
                            ))
                          ) : (
                            <span>package.json v2, lockfile v3</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {!isExcluded && deps > 0 ? (
                          <div className="dep-graph-bar">
                            <div className="dep-track">
                              <div className="dep-fill" style={{ width: `${depPct}%` }}></div>
                            </div>
                            <span className="cell-mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              {deps} pkgs
                            </span>
                          </div>
                        ) : (
                          <span className="cell-mono" style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                      <td className="cell-mono" style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                        {r.lastSeenAt ? `${Math.max(1, Math.floor((Date.now() / 1000 - r.lastSeenAt) / 60))} mins ago` : "recently"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="table-pagination">
          <span>
            Showing {displayedItems.length > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} repositories
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

      {/* Bottom Engine Architecture Cards */}
      <div className="engines-grid">
        <div className="engine-card">
          <div className="engine-card-head">
            <span className="engine-tag">TELEMETRY DAEMON</span>
            <span className="engine-ver">v1.115</span>
          </div>
          <div className="engine-title">Discovery Bus</div>
          <p className="engine-desc">
            Powered by <strong>LocalStack SAM CLI</strong>. Listens to GitHub webhook emissions and triggers instant isolated enclave inventory sweeps upon every pull request and trunk merge.
          </p>
          <div className="engine-footer">
            <span>● Event Queue: SQS-acme-repo-sync</span>
            <span style={{ color: "var(--emerald)" }}>0 ms delay</span>
          </div>
        </div>

        <div className="engine-card">
          <div className="engine-card-head">
            <span className="engine-tag">PARSER ENGINE</span>
            <span className="engine-ver">AST v4.2</span>
          </div>
          <div className="engine-title">Manifest Engine</div>
          <p className="engine-desc">
            High-performance <strong>npm / yarn / pnpm AST parser</strong>. Unpacks nested lockfiles into deterministic dependency graphs, resolving exact semver ranges against the global advisory database in under 12ms.
          </p>
          <div className="engine-footer">
            <span>● Lockfile formats: npm v1-v3, Yarn v1/berry, pnpm v9</span>
            <span style={{ color: "var(--amber-light)" }}>Deterministic</span>
          </div>
        </div>
      </div>
    </div>
  );
}
