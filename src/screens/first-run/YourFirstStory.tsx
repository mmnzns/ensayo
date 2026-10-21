// Draft generated from Design/screens/html/1-7-your-first-story.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function YourFirstStory() {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ gap: "28px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
            <Wordmark size={24} />
          </span>
          <div className="e-steps" aria-label="Step 7 of 7">
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
            <span className="on" />
          </div>
          <Link to="2-1-home" className="e-btn e-btn-ghost e-btn-sm">Skip</Link>
        </header>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "760px" }}>
          <span className="e-label">Step 7 of 7</span>
          <h1 className="e-h1">Add one story you're proud of</h1>
          <p className="e-meta" style={{ margin: "0" }}>Paste it however you have it: notes, a resume bullet, a paragraph. Ensayo pulls out the parts, and your first question will fit it.</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "stretch" }}>
          <div className="e-card" style={{ flex: "1 1 460px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
            <label htmlFor="raw" className="e-h3">Your story</label>
            <textarea id="raw" className="e-input" rows={9} defaultValue={"Fernhill onboarding, 2025. 7-day activation stuck around 31% for two quarters, team assumed welcome emails were weak. Looked at the funnel: people opened and clicked but stalled on bank linking. Rebuilt the trigger to fire when someone stalled on that step, worked with the designer to cut the screen from 3 steps to 1. Activation went to 44% in a quarter."} />
            <button type="button" className="e-btn e-btn-soft" style={{ alignSelf: "flex-start" }}>Read it</button>
          </div>
          <div className="e-card" style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <span className="e-label">What Ensayo found</span>
              <Link to="5-3-add-a-story-review" className="e-small">Review all fields</Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-small">Headline</span>
              <span className="e-h3">I moved seven-day activation from 31 to 44 percent by fixing what happened after signup.</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <span className="e-pill" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }}>7-day activation 31% → 44%</span>
              <span className="e-pill" style={{ background: "var(--e-ground)" }}>Fernhill</span>
            </div>
            <div className="e-rowline" style={{ padding: "10px 0" }}>
              <span className="e-badge">Gap</span>{" "}<span className="e-meta" style={{ flex: "1" }}>No strategy yet: what did you notice, and why that fix? You can add it later.</span>
            </div>
            <span className="e-small">Nothing was added that isn't in your text.</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <Link to="1-6-feedback-engine" className="e-btn e-btn-ghost">← Back</Link>
          <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-big">Try your first answer</Link>
        </div>
      </div>
    </FocusShell>
  );
}
