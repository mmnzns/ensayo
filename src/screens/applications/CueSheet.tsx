// Draft generated from Design/screens/html/6-7-cue-sheet.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";

export default function CueSheet() {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ gap: "24px" }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <Link to="6-6-application-stages-and-night-before" className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }}>‹ Kestrel Pay</Link>
          <span className="e-meta">Keep it off camera. Beats, not a script.</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="e-btn e-btn-white e-btn-sm">Markdown</button>
            <button type="button" className="e-btn e-btn-primary e-btn-sm">Save as PDF</button>
          </div>
        </header>
        <article style={{ width: "100%", maxWidth: "760px", margin: "0 auto", background: "#FFFFFF", borderRadius: "8px", boxShadow: "0 1px 2px rgba(43,39,34,0.06), 0 12px 40px rgba(43,39,34,0.08)", padding: "56px 64px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "26px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", borderBottom: "2px solid var(--e-ink)", paddingBottom: "14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="e-hand" style={{ fontSize: "25px" }}>Kestrel Pay</span>
              <span className="e-meta">Hiring manager · Friday, October 23 · 2:00 PM</span>
            </div>
            <span className="e-small">ensayo</span>
          </div>
          <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Opener · tell me about yourself</span>
            <ul style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "15px", lineHeight: "1.5" }}>
              <li>Lifecycle marketer: I find where activation breaks, then build the fix.</li>
              <li>Now: Fernhill, owning onboarding and retention.</li>
              <li>Before: Brightwave, email and deliverability.</li>
              <li>
                Why you: you want one person who builds it <strong>and</strong> runs it.
              </li>
            </ul>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Power story · onboarding drop-off</span>
            <div style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr)", rowGap: "8px", columnGap: "16px", fontSize: "15px", lineHeight: "1.5" }}>
              <span className="e-small" style={{ paddingTop: "2px" }}>Headline</span>
              <span>
                Activation <strong>31% → 44%</strong> by fixing what happened after signup. <span className="e-small">Resume says the same</span>
              </span>
              <span className="e-small" style={{ paddingTop: "2px" }}>Noticed</span>
              <span>People clicked, then stalled on bank linking. Not an email problem.</span>
              <span className="e-small" style={{ paddingTop: "2px" }}>Decided</span>
              <span>Fix the handoff. Prove it with 7-day activation.</span>
              <span className="e-small" style={{ paddingTop: "2px" }}>Did</span>
              <span>
                Trigger on the stall. Screen from 3 steps to 1 (with design). <span className="e-badge">Resume says 5 to 1</span>
              </span>
              <span className="e-small" style={{ paddingTop: "2px" }}>Result</span>
              <span>
                <strong>44%</strong> in a quarter · 40k signups a quarter.
              </span>
              <span className="e-small" style={{ paddingTop: "2px" }}>If pushed</span>
              <span>Data: funnel by step. Failure: first trigger fired mid-flow, moved to 20 min.</span>
            </div>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Ask them</span>
            <ol style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "15px", lineHeight: "1.5" }}>
              <li>Beyond activation and first-month retention, how will you judge this hire?</li>
              <li>What's the biggest thing in the way of that?</li>
            </ol>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Say the same way every time</span>
            <div style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr)", rowGap: "6px", columnGap: "16px", fontSize: "15px" }}>
              <span className="e-small">Notice</span>
              <span>Two weeks</span>
              <span className="e-small">Why leaving</span>
              <span>Want to own lifecycle end to end, not one channel.</span>
            </div>
          </section>
          <div style={{ borderTop: "1px solid var(--e-line)", paddingTop: "16px", display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
            <span className="e-hand" style={{ fontSize: "18px" }}>Answer first.</span>
            <span className="e-hand" style={{ fontSize: "18px" }}>One story.</span>
            <span className="e-hand" style={{ fontSize: "18px" }}>Stop when the number lands.</span>
          </div>
        </article>
      </div>
    </FocusShell>
  );
}
