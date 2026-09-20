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

  // Stepper state
  const [currentStep, setCurrentStep] = useState<number>(3);
  const [step3Progress, setStep3Progress] = useState<number>(71.4);

  // Logs state
  const [logsPaused, setLogsPaused] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: "1", timestamp: "14:02:18.102", level: "INIT", message: "SAM LocalStack Enclave bound to unix:///var/run/docker.sock" },
    { id: "2", timestamp: "14:02:18.120", level: "SQS", message: "Queue URL resolved: arn:aws:sqs:us-east-1:000000000000:sqs-dispatch-fanout.fifo" },
    { id: "3", timestamp: "14:02:18.144", level: "VALIDATE", message: `Advisory ${form.ghsa_id} schema verified against GitHub Advisory DB Mirror` },
    { id: "4", timestamp: "14:02:18.168", level: "SCAN", message: `Scanning 47 repository lockfiles. Matched target "${form.package}" in 14 trees.` },
    { id: "5", timestamp: "14:02:18.210", level: "SQS:BATCH", message: "Sent MessageBatch [size=14, deduplication_id=sim-88f2a9-root] (latency 42ms)" },
    { id: "6", timestamp: "14:02:18.330", level: "WORKER-01", message: `PR mock generated: ANSUJKMEHER/Sentinel (lockfile upgraded: 4.17.15 -> ${form.first_patched_version ?? "4.17.21"})` },
    { id: "7", timestamp: "14:02:18.412", level: "WORKER-03", message: `PR mock generated: ANSUJKMEHER/The-Lenny-Growth-Assistant (lockfile upgraded: 4.17.19 -> ${form.first_patched_version ?? "4.17.21"})` },
  ]);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (!logsPaused && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, logsPaused]);

  // Handle preset selection
  const handleSelectPreset = (presetId: string) => {
    const p = PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setSelectedPresetId(presetId);
    setForm(p.payload);
    setSeverity(p.payload.severity);

    // Append log event
    const timeStr = new Date().toTimeString().split(" ")[0] + "." + Math.floor(Math.random() * 900 + 100);
    setLogs((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        timestamp: timeStr,
        level: "VALIDATE",
        message: `Loaded verified scenario preset: ${p.name} (${p.payload.ghsa_id})`,
      },
    ]);
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

    // Append log event
    const timeStr = new Date().toTimeString().split(" ")[0] + "." + Math.floor(Math.random() * 900 + 100);
    setLogs((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        timestamp: timeStr,
        level: "SQS",
        message: `Dispatching simulation run for ${payload.ghsa_id} (${payload.package}) across monitored repositories...`,
      },
    ]);

    // Animate pipeline
    setCurrentStep(3);
    setStep3Progress(20);
    const interval = setInterval(() => {
      setStep3Progress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setCurrentStep(4);
          return 100;
        }
        return prev + 15;
      });
    }, 400);

    onSimulate(payload);
  };

  const currentPreset = PRESETS.find((p) => p.id === selectedPresetId) ?? PRESETS[0];

  const steps: PipelineStep[] = [
    {
      id: 1,
      title: "1. Detect GHSA-PAYLOAD",
      tag: "Completed in 14ms",
      status: "completed",
      statusText: "Completed in 14ms",
      description: `GHSA payload validated against cryptographic upstream schema. SemVer range ${form.vulnerable_range} parsed with zero syntax errors.`,
    },
    {
      id: 2,
      title: `2. Org Scan 47 Repos Scanned`,
      tag: `${currentPreset.affectedCount} Affected`,
      status: "completed",
      statusText: `${currentPreset.affectedCount} Affected`,
      description: `Found ${currentPreset.affectedCount} repository manifests containing ${form.package}@${form.vulnerable_range} across 8 service clusters and 6 core libraries.`,
      progressPercent: Math.round((currentPreset.affectedCount / 47) * 100),
      progressLabel: `${currentPreset.affectedCount} Affected Repositories (Lockfiles Outdated) | ${47 - currentPreset.affectedCount} Repos Clear`,
    },
    {
      id: 3,
      title: `3. Atomic PR Generation`,
      tag: currentStep === 3 ? "IN PROGRESS" : currentStep > 3 ? "COMPLETED" : "QUEUED",
      status: currentStep === 3 ? "in_progress" : currentStep > 3 ? "completed" : "queued",
      statusText: currentStep === 3 ? "10 of 14 lockfiles created" : "14 of 14 lockfiles created",
      description: "Synthesizing lockfile patches and generating mock git commit signatures. Arborist AST recalculations ongoing for monorepo graphs.",
      progressPercent: currentStep > 3 ? 100 : step3Progress,
      progressLabel: `Current: ANSUJKMEHER/Sentinel (${currentStep > 3 ? 100 : step3Progress}% fanout)`,
    },
    {
      id: 4,
      title: "4. CI Webhook Verification",
      tag: currentStep === 4 ? "IN PROGRESS" : "QUEUED",
      status: currentStep === 4 ? "in_progress" : "queued",
      statusText: currentStep === 4 ? "Running test matrix..." : "Awaiting Step 3",
      description: "Synthetic webhook dispatch to local test matrix. Validates PR status checks and deterministic branch deployment triggers without alerting external subscribers.",
    },
  ];

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

      {/* Two Column Layout: Left Form, Right Stepper + Terminal */}
      <div className="simulate-layout">
        {/* Left Column: Form & Presets */}
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

        {/* Right Column: Active Pipeline Stepper & SQS Log Console */}
        <div>
          {/* Pipeline Stepper */}
          <div className="panel-card" style={{ marginBottom: "16px" }}>
            <div className="panel-header-row">
              <div className="panel-header-title">
                <span>⚡</span> Active Pipeline Stepper
              </div>
              <div className="panel-header-sub">
                Run ID: <strong style={{ color: "var(--amber-light)" }}>{lastQueuedId ?? "sim-88f2a9"}</strong>
              </div>
            </div>

            <div className="stepper-container">
              {steps.map((s) => (
                <div key={s.id} className={`stepper-step ${s.status}`}>
                  <div className="stepper-step-head">
                    <div className="stepper-step-title">
                      <span className={`stepper-icon-circle ${s.status}`}>
                        {s.status === "completed" ? "✔" : s.id}
                      </span>
                      <span>{s.title}</span>
                    </div>
                    <span className={`stepper-tag ${s.status}`}>{s.tag}</span>
                  </div>
                  <p className="stepper-step-desc">{s.description}</p>
                  {s.progressPercent !== undefined && (
                    <div>
                      <div className="stepper-progress-bar">
                        <div className="stepper-progress-fill" style={{ width: `${s.progressPercent}%` }}></div>
                      </div>
                      {s.progressLabel && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px", fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginTop: "4px" }}>
                          <span>{s.progressLabel}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* SQS Log Console */}
          <div className="log-console">
            <div className="log-console-head">
              <div className="log-console-title">
                <span>&lt;&gt;</span> Live Event Stream / SQS Log Console
              </div>
              <div className="log-console-actions">
                <button type="button" className="log-text-btn" onClick={() => setLogs([])}>
                  Clear
                </button>
                <button type="button" className="log-text-btn" onClick={() => setLogsPaused(!logsPaused)}>
                  {logsPaused ? "Resume" : "Pause"}
                </button>
                <div className="log-receiving-pill">
                  <span className="pulse-dot" style={{ backgroundColor: "var(--amber-light)" }}></span>
                  <span>{logsPaused ? "PAUSED" : "RECEIVING"}</span>
                </div>
              </div>
            </div>

            <div className="log-stream-body" ref={logContainerRef}>
              {logs.map((l) => (
                <div key={l.id} className="log-row">
                  <span className="log-time">{l.timestamp}</span>
                  <span className={`log-level ${l.level.replace(":", "\\:")}`}>[{l.level}]</span>
                  <span className="log-msg">{l.message}</span>
                </div>
              ))}
            </div>

            <div className="log-console-footer">
              <div>
                FIFO Message Group: <code>org.acme.sim</code> | Active Lambda Enclaves: <code>4 / 8</code>
              </div>
              <div className="leak-status">
                ✔ Deterministic zero-leak dry run active
              </div>
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
