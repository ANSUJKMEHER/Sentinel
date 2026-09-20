import { useState, useEffect, useRef, type FormEvent } from "react";
import type { SimulatePayload, PipelineStep, LogEntry } from "../services/types";
import { PRESETS } from "../services/mockData";

interface SimulatePanelProps {
  busy: boolean;
  error: string | null;
  lastQueuedId: string | null;
  onSimulate: (payload: SimulatePayload) => void;
}

export function SimulatePanel({ busy, error, lastQueuedId, onSimulate }: SimulatePanelProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>("lodash");
  const [form, setForm] = useState<SimulatePayload>(PRESETS[0].payload);
  const [severity, setSeverity] = useState<string>("high");
  const [resolveTransitive, setResolveTransitive] = useState(true);
  const [atomicFanout, setAtomicFanout] = useState(true);



  // Handle preset selection
  const handleSelectPreset = (presetId: string) => {
    const p = PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setSelectedPresetId(presetId);
    setForm(p.payload);
    setSeverity(p.payload.severity);
  };

  const handleReset = () => {
    handleSelectPreset("lodash");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const payload: SimulatePayload = {
      ...form,
      severity,
      resolve_transitive: resolveTransitive,
      atomic_fanout: atomicFanout,
    };

    onSimulate(payload);
  };

  const currentPreset = PRESETS.find((p) => p.id === selectedPresetId) ?? PRESETS[0];

  return (
    <div className="simulation-sandbox-view">
      {/* Top Enclave Subheader */}
      <div className="enclave-banner">
        <div className="enclave-left">
          <span className="pulse-dot"></span>
          <strong style={{ color: "var(--text-main)" }}>SIMULATION ENCLAVE ONLINE</strong>
          <span>/</span>
          <span>Deterministic Sandbox: <span style={{ color: "var(--text-main)" }}>env-stage-sam-09</span></span>
          <span>/</span>
          <span>Queue: <span style={{ color: "var(--amber-light)" }}>sqs-dispatch-fanout.fifo</span></span>
        </div>
        <div className="enclave-right">
          <span>⚙ Alloc: 4 Core / 8GB</span>
          <span>|</span>
          <span>Batch Latency: 42ms</span>
          <span>|</span>
          <span>LocalStack 3.1.0</span>
        </div>
      </div>

      {/* Main View Header */}
      <div className="view-header">
        <div>
          <div className="view-subhead">
            <span style={{ color: "var(--amber-light)", background: "var(--amber-dim)", padding: "1px 6px", borderRadius: "3px" }}>
              POST /advisories/simulate
            </span>
            <span>idempotency-key: auto</span>
            <span>dry-run: true</span>
          </div>
          <h1 className="view-title">Advisory Simulation Sandbox</h1>
          <p className="view-desc">
            Trigger deterministic end-to-end fanout testing across all org repositories before upstream GHSA release.
            Simulates payload ingest, lockfile AST resolution, atomic branch creation, and dispatch to SQS enclaves.
          </p>
        </div>
        <div className="view-actions" style={{ flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
          <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
            GLOBAL TARGET BASE: <strong style={{ color: "var(--text-main)" }}>47 Monitored Repos</strong>
          </div>
          <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--amber-light)", fontWeight: 600 }}>
            DRY-RUN LOCK: PRs Diverted (Mock)
          </div>
        </div>
      </div>

      {/* Single Column Layout: Form & Presets */}
      <div className="simulate-layout" style={{ gridTemplateColumns: "1fr", maxWidth: "800px", margin: "0 auto" }}>
        {/* Form & Presets */}
        <div className="panel-card">
          {/* Presets Bar */}
          <div className="presets-section">
            <div className="presets-label">
              <span>Pre-fill Verified Scenarios</span>
              <span>{PRESETS.length} presets ready</span>
            </div>
            <div className="presets-buttons">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`preset-btn ${selectedPresetId === p.id ? "active" : ""}`}
                  onClick={() => handleSelectPreset(p.id)}
                >
                  <span>⚡</span> {p.name}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="sim-form-grid">
            <div className="field-group">
              <label className="field-label">
                <span>GHSA Identifier <span className="required">*</span></span>
              </label>
              <input
                className="sim-input"
                value={form.ghsa_id}
                onChange={(e) => setForm({ ...form, ghsa_id: e.target.value })}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label">
                <span>Target NPM Package <span className="required">*</span></span>
              </label>
              <input
                className="sim-input"
                value={form.package}
                onChange={(e) => setForm({ ...form, package: e.target.value })}
                required
              />
            </div>

            {/* Severity Pill Selector */}
            <div className="field-group">
              <label className="field-label">
                <span>Advisory Severity Tier</span>
                <span className="indicator">{currentPreset.cvss}</span>
              </label>
              <div className="severity-selector">
                <button
                  type="button"
                  className={`sev-btn ${severity === "critical" ? "selected-critical" : ""}`}
                  onClick={() => setSeverity("critical")}
                >
                  <span style={{ color: "var(--red)" }}>●</span> Critical
                </button>
                <button
                  type="button"
                  className={`sev-btn ${severity === "high" ? "selected-high" : ""}`}
                  onClick={() => setSeverity("high")}
                >
                  <span style={{ color: "var(--amber-light)" }}>●</span> High
                </button>
                <button
                  type="button"
                  className={`sev-btn ${severity === "moderate" ? "selected-moderate" : ""}`}
                  onClick={() => setSeverity("moderate")}
                >
                  <span style={{ color: "var(--cyan)" }}>●</span> Moderate
                </button>
                <button
                  type="button"
                  className={`sev-btn ${severity === "low" ? "selected-low" : ""}`}
                  onClick={() => setSeverity("low")}
                >
                  <span style={{ color: "var(--text-muted)" }}>●</span> Low
                </button>
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">
                <span>Vulnerable Range (SemVer)</span>
              </label>
              <input
                className="sim-input"
                value={form.vulnerable_range}
                onChange={(e) => setForm({ ...form, vulnerable_range: e.target.value })}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label">
                <span>First Patched Version</span>
              </label>
              <input
                className="sim-input"
                value={form.first_patched_version ?? ""}
                onChange={(e) => setForm({ ...form, first_patched_version: e.target.value })}
                placeholder="4.17.21"
              />
            </div>

            <div className="field-group">
              <label className="field-label">
                <span>CVE Identifier</span>
              </label>
              <input
                className="sim-input"
                value={form.cve ?? ""}
                onChange={(e) => setForm({ ...form, cve: e.target.value })}
                placeholder="CVE-2021-23337"
              />
            </div>

            <div className="field-group">
              <label className="field-label">
                <span>Target Org Scope</span>
                <span className="indicator">47 repos in scope ALL</span>
              </label>
            </div>

            {/* AST Solver Checkboxes */}
            <div className="checkbox-row">
              <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "2px" }}>
                Deterministic AST Solver (yarn.lock / package-lock.json / pnpm)
              </div>
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  checked={resolveTransitive}
                  onChange={(e) => setResolveTransitive(e.target.checked)}
                />
                <span>Resolve transitive chains</span>
              </label>
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  checked={atomicFanout}
                  onChange={(e) => setAtomicFanout(e.target.checked)}
                />
                <span>Atomic branch fanout</span>
              </label>
            </div>

            {/* Buttons */}
            <div className="form-actions-row">
              <button type="submit" disabled={busy} className="btn btn-primary" style={{ flex: 1 }}>
                <span>⚡</span> {busy ? "Dispatching..." : "Dispatch Simulation"}
              </button>
              <button type="button" onClick={handleReset} className="btn btn-secondary">
                <span>🔄</span> Reset
              </button>
            </div>

            {lastQueuedId && (
              <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--emerald)", background: "var(--emerald-dim)", padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                ✔ Advisory queued: <code>{lastQueuedId}</code> — jobs streaming to Jobs tab.
              </div>
            )}
            {error && (
              <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--red)", background: "var(--red-dim)", padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
                ⚠ {error}
              </div>
            )}
          </form>

          {/* Engine Spec & Guardrails */}
          <div className="engine-specs-box">
            <div className="engine-specs-head">
              <span>ENGINE SPEC &amp; PIPELINE GUARDRAILS</span>
              <span style={{ color: "var(--emerald)" }}>RFC-7921 compliant</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span>PR GENERATION CAP:</span>
              <span style={{ color: "var(--text-main)" }}>Unlimited (Sandbox mode)</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>DIFF ENGINE:</span>
              <span style={{ color: "var(--text-main)" }}>@npmcli/arborist v7.0</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Affected Monitored Repositories Sample */}
      <div className="affected-sample-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 700, color: "var(--text-main)" }}>
            <span>❄</span> Affected Monitored Repositories (AST Ingest Sample)
          </div>
          <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
            Sample: {currentPreset.affectedSample.length} of {currentPreset.affectedCount}
          </span>
        </div>

        <div className="affected-sample-grid">
          {currentPreset.affectedSample.map((item) => (
            <div key={item.repo} className="affected-card">
              <div className="affected-card-head">
                <span className="affected-repo-name">{item.repo}</span>
                <span className={`affected-status-pill ${item.status}`}>{item.status}</span>
              </div>
              <div className="affected-path">Path: {item.path}</div>
              <div className="affected-bump">
                <span className="from">{item.fromVersion}</span>
                <span className="arrow">➔</span>
                <span className="to">{item.toVersion}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
