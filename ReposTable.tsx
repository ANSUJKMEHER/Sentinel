import type { Repo } from "./types";

export function ReposTable({ repos }: { repos: Repo[] }) {
  if (repos.length === 0) {
    return <p className="muted">No repos discovered yet — the first advisory run refreshes the org repo list.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Repo</th>
            <th>Default branch</th>
            <th>Visibility</th>
            <th>Policy</th>
            <th>Archived</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {repos.map((r) => (
            <tr key={r.repo}>
              <td>
                <a className="link" href={`https://github.com/${r.repo}`} target="_blank" rel="noreferrer">
                  <code>{r.repo}</code>
                </a>
              </td>
              <td>
                <code>{r.defaultBranch ?? "—"}</code>
              </td>
              <td>
                <span className={`badge ${r.private ? "private" : "public"}`}>{r.private ? "private" : "public"}</span>
              </td>
              <td>
                {r.excluded ? <span className="badge report">excluded</span> : <span className="badge queued">monitored</span>}
              </td>
              <td>{r.archived ? "yes" : "no"}</td>
              <td className="muted nowrap">{r.lastSeenAt ? new Date(r.lastSeenAt * 1000).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
