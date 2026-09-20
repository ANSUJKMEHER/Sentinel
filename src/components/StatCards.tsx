import type { StateStats } from "../services/types";

export function StatCards({ stats }: { stats: StateStats | undefined }) {
  const cards = [
    { label: "Advisories seen", value: stats?.advisoriesSeen, hint: "cron + simulate" },
    { label: "Repos monitored", value: stats?.reposMonitored, hint: "org-wide" },
    { label: "PRs opened", value: stats?.prsOpened, hint: "coordinated remediation" },
  ];
  return (
    <div className="stat-grid">
      {cards.map((c) => (
        <div className="stat-card" key={c.label}>
          <div className="stat-value">{c.value ?? "—"}</div>
          <div className="stat-label">{c.label}</div>
          <div className="stat-hint">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}
