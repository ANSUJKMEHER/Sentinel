import { useCallback, useEffect, useState } from "react";
import { API_URL, getState, simulate } from "./api";
import type { SimulatePayload, State } from "./types";
import { StatCards } from "./StatCards";
import { SimulatePanel } from "./SimulatePanel";
import { AdvisoriesTable } from "./AdvisoriesTable";
import { ReposTable } from "./ReposTable";
import { JobsTable } from "./JobsTable";

type Tab = "overview" | "advisories" | "repos" | "jobs";

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [queuedId, setQueuedId] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<State | null> => {
    try {
      const s = await getState();
      setState(s);
      setStateError(null);
      return s;
    } catch (err) {
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

  const handleSimulate = useCallback(async (payload: SimulatePayload) => {
    setBusy(true);
    setSimError(null);
    try {
      const res = await simulate(payload);
      setQueuedId(res.queued.ghsa_id);
      setTab("jobs");
    } catch (err) {
      setSimError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "advisories", label: `Advisories (${state?.advisories.length ?? 0})` },
    { id: "repos", label: `Repos (${state?.repos.length ?? 0})` },
    { id: "jobs", label: `Jobs (${state?.jobs.length ?? 0})` },
  ];

  const queuedJobs = state?.jobs.filter((j) => j.ghsaId === queuedId) ?? [];
  const queuedOpen = queuedJobs.filter((j) => j.status === "queued").length;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>🔐 Sentinel</h1>
          <p className="tagline">Advisory-first, org-wide dependency security automation for GitHub</p>
        </div>
        <div className="header-right">
          {API_URL ? (
            <span className="muted mono">{API_URL}</span>
          ) : (
            <span className="banner warn">VITE_API_URL not configured — rebuild with it set</span>
          )}
        </div>
      </header>

      {state?.tokenConfigured === false && (
        <div className="banner warn">
          GitHub token is not configured in SSM (/sentinel/github-token) — cron detection and live PR status are disabled.
        </div>
      )}
      {stateError && <div className="banner err">Cannot reach /state: {stateError}</div>}

      <nav className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <main>
          <StatCards stats={state?.stats} />
          <SimulatePanel busy={busy} error={simError} lastQueuedId={queuedId} onSimulate={handleSimulate} />
          {queuedId && (
            <div className="banner info">
              Advisory <code>{queuedId}</code> is flowing through the pipeline — {queuedJobs.length} job(s) so far,{" "}
              {queuedOpen} still queued.
            </div>
          )}
          {state && (
            <>
              <div className="panel-head">
                <h3>Latest advisories</h3>
              </div>
              <AdvisoriesTable advisories={state.advisories.slice(0, 5)} />
            </>
          )}
        </main>
      )}
      {tab === "advisories" && (
        <main>
          <AdvisoriesTable advisories={state?.advisories ?? []} />
        </main>
      )}
      {tab === "repos" && (
        <main>
          <ReposTable repos={state?.repos ?? []} />
        </main>
      )}
      {tab === "jobs" && (
        <main>
          <JobsTable jobs={state?.jobs ?? []} highlightGhsa={queuedId} />
        </main>
      )}

      <footer className="footer">
        <p>
          <strong>Dependabot is per-repo. Sentinel is org-wide:</strong> one security event → impact analysis across
          every repo → coordinated remediation PRs.
        </p>
        <p className="muted">
          v1 scope: npm ecosystem + package.json (dependencies &amp; devDependencies). Lockfile and
          transitive-dependency analysis are on the roadmap. Detection unit: the advisory, not the repo.
        </p>
      </footer>
    </div>
  );
}
