import type { Advisory } from "./types";

export function severityClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "sev critical";
    case "high":
      return "sev high";
    case "moderate":
      return "sev moderate";
    case "low":
      return "sev low";
    default:
      return "sev unknown";
  }
}

export function AdvisoriesTable({ advisories }: { advisories: Advisory[] }) {
  if (advisories.length === 0) {
    return (
      <p className="muted">
        No advisories yet — the 5-minute cron poll (or a simulate) will fill this table.
      </p>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Advisory</th>
            <th>Package</th>
            <th>Severity</th>
            <th>Summary</th>
            <th>Vulnerable range</th>
            <th>Patched</th>
            <th>Source</th>
            <th>Published</th>
          </tr>
        </thead>
        <tbody>
          {advisories.map((a) => (
            <tr key={a.ghsa_id}>
              <td>
                <a className="link" href={`https://github.com/advisories/${a.ghsa_id}`} target="_blank" rel="noreferrer">
                  <code>{a.ghsa_id}</code>
                </a>
              </td>
              <td>
                <code>{a.package}</code>
              </td>
              <td>
                <span className={severityClass(a.severity)}>{a.severity}</span>
              </td>
              <td className="summary-cell">{a.summary}</td>
              <td>
                <code>{a.vulnerableRange}</code>
              </td>
              <td>
                <code>{a.firstPatchedVersion ?? "—"}</code>
              </td>
              <td>
                <span className={`badge ${a.source === "simulate" ? "simulate" : "cron"}`}>{a.source ?? "cron"}</span>{" "}
                {a.action === "report" && <span className="badge report">report-only</span>}
              </td>
              <td className="muted nowrap">{a.publishedAt ? new Date(a.publishedAt).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
