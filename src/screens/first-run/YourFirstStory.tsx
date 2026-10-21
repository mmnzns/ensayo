// Draft generated from Design/screens/html/1-7-your-first-story.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { startFirstRep } from "../practice/practiceFlow";
import { useState } from "react";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { useStore } from "../../data/store";
import StepHeader from "./StepHeader";

export default function YourFirstStory() {
  const { screens } = useStore();
  const { raw: sampleRaw, parsed } = screens.firstRun.firstStory;
  const [raw, setRaw] = useState(sampleRaw);
  const [read, setRead] = useState(true);

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%", gap: "28px" }}>
        <StepHeader step={7} skipTo="2-1-home" />
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "760px" }}>
          <span className="e-label">Step 7 of 7</span>
          <h1 className="e-h1">Add one story you're proud of</h1>
          <p className="e-meta" style={{ margin: "0" }}>Paste it however you have it: notes, a resume bullet, a paragraph. Ensayo pulls out the parts, and your first question will fit it.</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "stretch" }}>
          <div className="e-card" style={{ flex: "1 1 460px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
            <label htmlFor="raw" className="e-h3">Your story</label>
            <textarea
              id="raw"
              className="e-input"
              rows={9}
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setRead(false);
              }}
            />
            <button type="button" className="e-btn e-btn-soft" style={{ alignSelf: "flex-start" }} onClick={() => setRead(true)} disabled={!raw.trim()}>
              Read it
            </button>
          </div>
          {read && raw.trim() ? (
            <div className="e-card" style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <span className="e-label">What Ensayo found</span>
                <Link to="5-3-add-a-story-review" className="e-small">Review all fields</Link>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-small">Headline</span>
                <span className="e-h3">{parsed.headline}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <span className="e-pill" style={{ background: "var(--e-tint)", color: "var(--e-primary-dark)", fontWeight: "600" }}>{parsed.proof}</span>
                <span className="e-pill" style={{ background: "var(--e-ground)" }}>{parsed.employer}</span>
              </div>
              <div className="e-rowline" style={{ padding: "10px 0" }}>
                <span className="e-badge">Gap</span>{" "}<span className="e-meta" style={{ flex: "1" }}>{parsed.gap}</span>
              </div>
              <span className="e-small">{parsed.footnote}</span>
            </div>
          ) : (
            <div className="e-card" style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px", justifyContent: "center" }}>
              <span className="e-label">What Ensayo found</span>
              <span className="e-meta">{raw.trim() ? "Press Read it to see the parts Ensayo pulls out." : "Paste a story and press Read it. You can also skip this and add one later."}</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <Link to="1-6-feedback-engine" className="e-btn e-btn-ghost">← Back</Link>
          <Link to="3-1-practice-interviewer-asking" onClick={startFirstRep} className="e-btn e-btn-primary e-btn-big">Try your first answer</Link>
        </div>
      </div>
    </FocusShell>
  );
}
