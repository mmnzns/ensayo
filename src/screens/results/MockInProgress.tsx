// Draft generated from Design/screens/html/4-1-mock-in-progress.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useStore } from "../../data/store";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import Wordmark from "../../ui/Wordmark";
import { stageWithKind, useSpaceKey } from "./speak";

export default function MockInProgress() {
  const { applications, screens } = useStore();
  const mock = screens.results.mock;
  const app = applications.find((a) => a.id === mock.applicationId);
  const stageText = stageWithKind(mock.stageLabel, app?.startup);
  const total = mock.questions.length;
  const current = mock.questions[0];
  useSpaceKey("4-1-mock-in-progress", () => go("4-2-mock-your-questions"));
  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
              <Wordmark size={24} />
            </span>
            <span className="e-pill" style={{ background: "var(--e-ink)", color: "var(--e-surface)", fontWeight: "600" }} title="A whole stage straight through, notes at the end">Mock</span>
            <span className="e-small">notes at the end</span>
            <span className="e-pill">{app ? `${app.company} · ${stageText}` : stageText}</span>
          </div>
          <div className="e-steps" aria-label={`Question 1 of ${total}`}>
            {mock.questions.map((q, i) => (
              <span key={q.id} className={i === 0 ? "on" : undefined} />
            ))}
          </div>
          <Link to="4-4-session-results-mock-debrief" className="e-btn e-btn-white e-btn-sm">End mock</Link>
        </header>
      </div>
      <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "36px", textAlign: "center", padding: "32px 0" }}>
        <div aria-hidden="true" style={{ width: "140px", height: "140px", borderRadius: "50%", background: "color-mix(in srgb, var(--e-primary) 8%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "104px", height: "104px", borderRadius: "50%", background: "color-mix(in srgb, var(--e-primary) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "var(--e-primary)" }} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center", maxWidth: "860px" }}>
          <span className="e-label">{current?.asker}</span>
          <h1 className="e-h1" style={{ fontSize: "34px", fontWeight: "600" }}>{current?.text}</h1>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <Link to="4-2-mock-your-questions" aria-label="Start answering" style={{ width: "96px", height: "96px", borderRadius: "50%", background: "var(--e-primary)", color: "var(--e-primary-ink)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px color-mix(in srgb, var(--e-primary) 28%, transparent)" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v3" />
            </svg>
          </Link>
          <span className="e-meta">
            Press <span className="e-kbd">Space</span> to answer
          </span>
        </div>
      </div>
      <div className="e-wrap" style={{ width: "100%" }}>
        <div className="e-soft" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "14px 20px", background: "var(--e-surface)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          <span className="e-meta">Like the real thing: no clock and no notes until the end. Follow-ups come when they come.</span>
        </div>
      </div>
    </FocusShell>
  );
}
