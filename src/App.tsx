import { useCallback, useEffect, useState } from "react";
import { API_URL, getState, simulate } from "./services/api";
import type { SimulatePayload, State } from "./services/types";
import { OverviewView } from "./components/OverviewView";
import { SimulatePanel } from "./components/SimulatePanel";
import { AdvisoriesTable } from "./components/AdvisoriesTable";
import { ReposTable } from "./components/ReposTable";
import { JobsTable } from "./components/JobsTable";
import { CommandPalette } from "./components/CommandPalette";

export type Tab = "overview" | "simulate" | "advisories" | "repos" | "jobs";

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [queuedId, setQueuedId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("theme") as "dark" | "light") || (localStorage.getItem("theme") as "dark" | "light") || "dark";
  });

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  const refresh = useCallback(async (): Promise<State | null> => {
    try {
      const s = await getState();
      setState(s);
      setStateError(null);
      return s;
    } catch (err) {
      // Backend not running or VITE_API_URL not configured:
      // Keep state null or fallback, but don't crash
      setStateError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  // Poll: fast (2s) while a simulate run is in flight, otherwise every 10s.
  useEffect(() => {
    const interval = setInterval(
      () => {
        void refresh().then((s) => {
          if (queuedId && s) {
            const jobs = s.jobs.filter((j) => j.ghsaId === queuedId);
            if (jobs.length > 0 && jobs.every((j) => j.status !== "queued")) {
              setQueuedId(null); // run settled — back to normal cadence
            }
          }
        });
      },
      queuedId ? 2000 : 10000
    );
    return () => clearInterval(interval);
  }, [refresh, queuedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSimulate = useCallback(async (payload: SimulatePayload) => {
    setBusy(true);
    setSimError(null);
    try {
      if (API_URL) {
        const res = await simulate(payload);
        setQueuedId(res.queued.ghsa_id);
      } else {
        // In local demo mode, simulate success locally
        setQueuedId(payload.ghsa_id);
      }
    } catch (err) {
      setSimError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const totalAdvisories = state?.advisories?.length ?? 0;
  const totalRepos = state?.repos?.length ?? 0;
  const totalJobs = state?.jobs?.length ?? 0;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "simulate", label: "Simulate" },
    { id: "advisories", label: "Advisories", count: totalAdvisories },
    { id: "repos", label: "Repositories", count: totalRepos },
    { id: "jobs", label: "Jobs", count: totalJobs },
  ];

  const isBackendConnected = Boolean(state && !stateError);

  return (
    <div className="app-root">
      {/* ---------------- Topbar ---------------- */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-section">
            <a href="#overview" className="brand-logo" onClick={(e) => { e.preventDefault(); setTab("overview"); }}>
              <span className="brand-icon">🔐</span>
              <span>Sentinel</span>
              <span className="brand-version">v2.4</span>
            </a>

            <div className="org-selector" title="Organization Context">
              <span className="org-icon">🏢</span>
              <span className="org-current">ANSUJKMEHER</span>
              <span>↕</span>
              <span className="org-divider">/</span>
              <span>security-ops</span>
            </div>
          </div>

          <div className="search-container" onClick={() => setPaletteOpen(true)} style={{ cursor: "pointer" }}>
            <div className="search-input-wrap" style={{ pointerEvents: "none" }}>
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                placeholder="Search commands, CVEs, targets..."
                readOnly
              />
              <span className="kbd-badge">⌘K</span>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="status-indicator">
              <span className={`status-dot ${isBackendConnected ? "online" : ""}`}></span>
              <span>LocalStack / SAM {isBackendConnected ? "LIVE" : "READY"}</span>
            </div>
            <button className="icon-btn" title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`} onClick={toggleTheme}>
              <span>{theme === "dark" ? "☀️" : "🌙"}</span>
            </button>
            <button className="icon-btn" title="Notifications">
              <span>🔔</span>
            </button>
            <div className="avatar" title="Security Admin">
              <span>👤</span>
            </div>
          </div>
        </div>
      </header>

      {/* ---------------- Nav Tabs Bar ---------------- */}
      <nav className="nav-tabs-bar">
        <div className="nav-tabs-inner">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`nav-tab-item ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.label}</span>
              {t.count !== undefined && <span className="tab-badge">{t.count}</span>}
            </button>
          ))}
        </div>
      </nav>

      {stateError && (
        <div style={{ background: "var(--gh-danger-bg)", color: "var(--gh-text-danger)", border: "1px solid var(--gh-danger-border)", padding: "10px 16px", margin: "16px 24px 0", borderRadius: "6px", fontSize: "13px" }}>
          ⚠️ <strong>Backend Error:</strong> {stateError}
        </div>
      )}

      {/* ---------------- Main Content ---------------- */}
      <main className="main-wrapper">
        {tab === "overview" && (
          <OverviewView
            state={state}
            onNewSimulation={() => setTab("simulate")}
            onViewJobs={() => setTab("jobs")}
            onRefresh={refresh}
          />
        )}

        {tab === "simulate" && (
          <SimulatePanel
            busy={busy}
            error={simError}
            lastQueuedId={queuedId}
            onSimulate={handleSimulate}
          />
        )}

        {tab === "advisories" && (
          <AdvisoriesTable
            advisories={state?.advisories}
            onPoll={refresh}
          />
        )}

        {tab === "repos" && (
          <ReposTable
            repos={state?.repos}
            onRescan={refresh}
          />
        )}

        {tab === "jobs" && (
          <JobsTable
            jobs={state?.jobs}
            highlightGhsa={queuedId}
            onTriggerBatchSweep={refresh}
          />
        )}
      </main>

      {/* ---------------- Global Footer ---------------- */}
      <footer className="global-footer">
        <div className="global-footer-inner">
          <div className="footer-left">
            <span>🛡</span>
            <span>Dependabot is per-repo. <strong>Sentinel is org-wide.</strong></span>
          </div>
          <div className="footer-right">
            <span className="footer-status-dot"></span>
            <span>Runtime: AWS us-east-1 (Dedicated Enclave)</span>
            <span>|</span>
            <span>Cluster v2.4.11-rc4</span>
          </div>
        </div>
      </footer>

      <CommandPalette 
        isOpen={paletteOpen} 
        onClose={() => setPaletteOpen(false)} 
        state={state} 
        onNavigate={setTab} 
      />
    </div>
  );
}
