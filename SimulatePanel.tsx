import { useState, type FormEvent } from "react";
import type { SimulatePayload } from "./types";

const DEFAULT: SimulatePayload = {
  ghsa_id: "GHSA-jf85-cpcp-j695",
  package: "lodash",
  severity: "high",
  summary: "Command injection in lodash",
  vulnerable_range: ">= 4.0.0, < 4.17.21",
  first_patched_version: "4.17.21",
  cve: "CVE-2021-23337",
};

const FIELDS: { key: keyof SimulatePayload; label: string; optional?: boolean }[] = [
  { key: "ghsa_id", label: "GHSA ID" },
  { key: "package", label: "npm package" },
  { key: "severity", label: "Severity" },
  { key: "summary", label: "Summary" },
  { key: "vulnerable_range", label: "Vulnerable range" },
  { key: "first_patched_version", label: "First patched version", optional: true },
  { key: "cve", label: "CVE", optional: true },
];

interface Props {
  busy: boolean;
  error: string | null;
  lastQueuedId: string | null;
  onSimulate: (payload: SimulatePayload) => void;
}

export function SimulatePanel({ busy, error, lastQueuedId, onSimulate }: Props) {
  const [form, setForm] = useState<SimulatePayload>(DEFAULT);

  const set = (key: keyof SimulatePayload, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSimulate({
      ...form,
      first_patched_version: form.first_patched_version || null,
      cve: form.cve || null,
    });
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Trigger advisory</h3>
        <span className="muted">POST /advisories/simulate — deterministic trigger, identical pipeline to the 5-min cron</span>
      </div>
      <form onSubmit={submit} className="simulate-form">
        {FIELDS.map((f) => (
          <label key={f.key} className="field">
            <span>
              {f.label}
              {f.optional && <em className="muted"> (optional)</em>}
            </span>
            <input
              value={form[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              required={!f.optional}
            />
          </label>
        ))}
        <button type="submit" disabled={busy} className="btn primary">
          {busy ? "Queueing…" : "Simulate advisory"}
        </button>
      </form>
      {lastQueuedId && (
        <div className="banner ok">
          Advisory queued: <code>{lastQueuedId}</code> — jobs appear in the Jobs tab within seconds.
        </div>
      )}
      {error && <div className="banner err">{error}</div>}
    </div>
  );
}
