// Draft generated from Design/screens/html/1-2-about-you.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useState } from "react";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { useStore } from "../../data/store";
import StepHeader from "./StepHeader";

export default function AboutYou() {
  const { profile, screens } = useStore();
  const { seniorityOptions, sellsToOptions } = screens.firstRun;
  const [role, setRole] = useState(profile.targetRole);
  const [industry, setIndustry] = useState(profile.industry);
  const [seniority, setSeniority] = useState(profile.seniority);
  const [sellsTo, setSellsTo] = useState(profile.sellsTo);
  const [who, setWho] = useState(profile.identityStatement);
  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%", gap: "32px" }}>
        <StepHeader step={2} skipTo="1-3-what-to-work-on" />
        <div className="e-narrow" style={{ gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 2 of 7</span>
            <h1 className="e-h1">About you</h1>
            <p className="e-meta" style={{ margin: "0" }}>This tailors the questions and the feedback. You can change it any time in Settings.</p>
          </div>
          <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
              <div className="e-field">
                <label htmlFor="role">Role you're going for</label>
                <input id="role" className="e-input" value={role} onChange={(e) => setRole(e.target.value)} />
              </div>
              <div className="e-field">
                <label htmlFor="ind">Industry</label>
                <input id="ind" className="e-input" value={industry} onChange={(e) => setIndustry(e.target.value)} />
              </div>
            </div>
            <div className="e-field">
              <span style={{ fontSize: "14px", fontWeight: "600" }}>Seniority</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {seniorityOptions.map((o) => (
                  <button key={o.value} type="button" className={o.value === seniority ? "e-chip e-chip-on" : "e-chip"} aria-pressed={o.value === seniority} onClick={() => setSeniority(o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="e-field">
              <span style={{ fontSize: "14px", fontWeight: "600" }}>You sell to</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {sellsToOptions.map((o) => (
                  <button key={o.value} type="button" className={o.value === sellsTo ? "e-chip e-chip-on" : "e-chip"} aria-pressed={o.value === sellsTo} onClick={() => setSellsTo(o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="e-field">
              <label htmlFor="who">
                Who you are at work, in one sentence <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>(optional)</span>
              </label>
              <textarea id="who" className="e-input" rows={3} value={who} onChange={(e) => setWho(e.target.value)} />
              <span className="e-small">Ensayo checks that this comes through early when you answer "Tell me about yourself".</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <Link to="1-1-welcome" className="e-btn e-btn-ghost">← Back</Link>
            <Link to="1-3-what-to-work-on" className="e-btn e-btn-primary">Continue</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
