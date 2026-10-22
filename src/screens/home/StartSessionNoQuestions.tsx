import { useStore } from "../../data/store";
import { practiceTarget } from "../../practice/applied";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { peekBlocked } from "./preset";

/** The session sheet when the chosen source has nothing to ask yet: an application with no job posting pasted. */
export default function StartSessionNoQuestions() {
  const store = useStore();
  const next = practiceTarget(store.applications, store.now(), peekBlocked() ?? {});
  const company = next?.application.company ?? "This application";
  return (
    <FocusShell style={{ background: "rgba(43,39,34,0.32)", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ssn-title" className="e-card" style={{ width: "100%", maxWidth: "680px", padding: "36px", display: "flex", flexDirection: "column", gap: "24px", boxShadow: "0 24px 64px rgba(43,39,34,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <h1 id="ssn-title" className="e-h2" style={{ fontSize: "24px" }}>Start a session</h1>
          <Link to="2-1-home" className="e-btn e-btn-ghost e-btn-sm" aria-label="Close">✕</Link>
        </div>
        <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "24px" }}>
          <span className="e-h3">No questions for {company} yet</span>
          <span className="e-meta">Ensayo writes the questions for an application from its job posting, and {company} doesn't have one yet. Paste the posting and the questions show up here.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "14px", fontWeight: "600" }}>Two ways forward</span>
          <span className="e-meta">Paste the posting into the application, or pick a stage instead and practice with general questions for it.</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "12px" }}>
          <Link to="2-3-start-a-session" className="e-btn e-btn-line">Pick a stage instead</Link>
          <Link to="6-4-application-edit-details" className="e-btn e-btn-primary e-btn-big">Paste the posting</Link>
        </div>
      </div>
    </FocusShell>
  );
}
