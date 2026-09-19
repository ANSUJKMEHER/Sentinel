import type { Job } from "./types";

export function JobsTable({ jobs, highlightGhsa }: { jobs: Job[]; highlightGhsa?: string | null }) {
  if (jobs.length === 0) {
    return <p className="muted">No remediation jobs yet — simulate an advisory to kick one off.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Repo</th>
            <th>Package</th>
            <th>Range → fixed</th>
            <th>Status</th>
            <th>PR</th>
            <th>CI</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.jobId} className={j.ghsaId === highlightGhsa ? "row-highlight" : undefined}>
              <td>
                <code>{j.repo}</code>
              </td>
              <td>
                <code>{j.package}</code>
              </td>
              <td>
                <code>
                  {j.fromRange ?? "?"} → {j.toVersion ?? "?"}
                </code>
              </td>
              <td>
                <span className={`badge ${j.status}`}>{j.status}</span>
                {j.status === "failed" && j.error ? (
                  <span className="muted" title={j.error}>
                    {" "}
                    ⚠
                  </span>
                ) : null}
              </td>
              <td>
                {j.prUrl ? (
                  <a className="link" href={j.prUrl} target="_blank" rel="noreferrer">
                    #{j.prNumber}
                  </a>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <span className={`ci ${j.ciStatus ?? "unknown"}`}>{j.ciStatus ?? "—"}</span>
              </td>
              <td className="muted nowrap">{j.updatedAt ? new Date(j.updatedAt * 1000).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
