import { useState, useEffect, useRef } from "react";
import type { State } from "../services/types";

export type Tab = "overview" | "simulate" | "advisories" | "repos" | "jobs";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  state: State | null;
  onNavigate: (tab: Tab) => void;
}

export function CommandPalette({ isOpen, onClose, state, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      // slight delay to allow rendering before focus
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.toLowerCase();

  // Filter logic
  const matchAdvisories = (state?.advisories || []).filter(
    (a) =>
      a.ghsaId.toLowerCase().includes(q) ||
      a.package.toLowerCase().includes(q) ||
      (a.cve && a.cve.toLowerCase().includes(q))
  ).slice(0, 5);

  const matchRepos = (state?.repos || []).filter(
    (r) => r.name.toLowerCase().includes(q)
  ).slice(0, 5);

  const matchJobs = (state?.jobs || []).filter(
    (j) => j.repo.toLowerCase().includes(q) || j.package.toLowerCase().includes(q)
  ).slice(0, 5);

  const commands = [
    { label: "Go to Overview", action: () => onNavigate("overview"), icon: "📊" },
    { label: "Simulate Advisory", action: () => onNavigate("simulate"), icon: "⚡" },
    { label: "View All Advisories", action: () => onNavigate("advisories"), icon: "🛡" },
    { label: "View All Repositories", action: () => onNavigate("repos"), icon: "📁" },
    { label: "View All Jobs", action: () => onNavigate("jobs"), icon: "🔄" },
  ].filter(c => c.label.toLowerCase().includes(q));

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="palette-backdrop" onClick={handleBackdropClick}>
      <div className="palette-modal">
        <div className="palette-input-wrap">
          <span className="palette-search-icon">🔍</span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search commands, CVEs, repositories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="kbd-badge">ESC</span>
        </div>

        <div className="palette-results">
          {query.trim() === "" && (
            <div className="palette-section">
              <div className="palette-section-title">Quick Commands</div>
              {commands.map((c, i) => (
                <div key={i} className="palette-item" onClick={() => handleAction(c.action)}>
                  <span className="palette-item-icon">{c.icon}</span>
                  <span className="palette-item-text">{c.label}</span>
                </div>
              ))}
            </div>
          )}

          {query.trim() !== "" && (
            <>
              {commands.length > 0 && (
                <div className="palette-section">
                  <div className="palette-section-title">Commands</div>
                  {commands.map((c, i) => (
                    <div key={i} className="palette-item" onClick={() => handleAction(c.action)}>
                      <span className="palette-item-icon">{c.icon}</span>
                      <span className="palette-item-text">{c.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {matchAdvisories.length > 0 && (
                <div className="palette-section">
                  <div className="palette-section-title">Advisories</div>
                  {matchAdvisories.map((a) => (
                    <div key={a.ghsaId} className="palette-item" onClick={() => handleAction(() => onNavigate("advisories"))}>
                      <span className="palette-item-icon">🛡</span>
                      <span className="palette-item-text">{a.ghsaId} • {a.package}</span>
                    </div>
                  ))}
                </div>
              )}

              {matchRepos.length > 0 && (
                <div className="palette-section">
                  <div className="palette-section-title">Repositories</div>
                  {matchRepos.map((r) => (
                    <div key={r.name} className="palette-item" onClick={() => handleAction(() => onNavigate("repos"))}>
                      <span className="palette-item-icon">📁</span>
                      <span className="palette-item-text">{r.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {matchJobs.length > 0 && (
                <div className="palette-section">
                  <div className="palette-section-title">Remediation Jobs</div>
                  {matchJobs.map((j) => (
                    <div key={j.jobId} className="palette-item" onClick={() => handleAction(() => onNavigate("jobs"))}>
                      <span className="palette-item-icon">⚡</span>
                      <span className="palette-item-text">{j.repo} • {j.package}</span>
                    </div>
                  ))}
                </div>
              )}

              {commands.length === 0 && matchAdvisories.length === 0 && matchRepos.length === 0 && matchJobs.length === 0 && (
                <div className="palette-empty">No results found for "{query}"</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
