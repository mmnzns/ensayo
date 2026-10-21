// Draft generated from Design/screens/html/2-3-start-a-session.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";

export default function StartASession() {
  return (
    <FocusShell style={{ background: "rgba(43,39,34,0.32)", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ss-title" className="e-card" style={{ width: "100%", maxWidth: "680px", padding: "36px", display: "flex", flexDirection: "column", gap: "24px", boxShadow: "0 24px 64px rgba(43,39,34,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <h1 id="ss-title" className="e-h2" style={{ fontSize: "24px" }}>Start a session</h1>
          <Link to="2-1-home" className="e-btn e-btn-ghost e-btn-sm" aria-label="Close">✕</Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
          <label className="e-card" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "18px", cursor: "pointer", boxShadow: "inset 0 0 0 2px var(--e-primary)", background: "var(--e-tint)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input type="radio" name="mode" className="e-check" defaultChecked />
              <span className="e-h3">Drill</span>
            </span>
            <ul className="e-meta" style={{ margin: "0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px", lineHeight: "1.45" }}>
              <li>A note right after every answer, with a line to say instead</li>
              <li>Answer the same question again, up to 3 tries, and see what changed</li>
              <li>Timer on screen; follow-ups when your answer leaves a gap</li>
            </ul>
            <span className="e-small" style={{ paddingTop: "4px" }}>
              <strong style={{ color: "var(--e-ink)" }}>Best for:</strong> building a habit, fixing one answer, the days before an interview
            </span>
          </label>
          <label className="e-card" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "18px", cursor: "pointer", boxShadow: "inset 0 0 0 1.5px var(--e-line)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input type="radio" name="mode" className="e-check" />
              <span className="e-h3">Mock</span>
            </span>
            <ul className="e-meta" style={{ margin: "0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px", lineHeight: "1.45" }}>
              <li>A whole interview stage, start to finish, like the real call</li>
              <li>No notes, no retries and no timer until it ends</li>
              <li>Ends with your own questions for them, then a full debrief</li>
            </ul>
            <span className="e-small" style={{ paddingTop: "4px" }}>
              <strong style={{ color: "var(--e-ink)" }}>Best for:</strong> testing whether the habit holds under pressure, the day before
            </span>
          </label>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <span style={{ fontSize: "14px", fontWeight: "600" }}>Questions from</span>
          <label className="e-rowline" style={{ padding: "12px 0", cursor: "pointer" }}>
            <input type="radio" name="src" className="e-check" defaultChecked />
            <span style={{ flex: "1" }}>
              <span className="e-h3" style={{ fontSize: "16px" }}>Kestrel Pay</span>{" "}<span className="e-meta">· Hiring manager stage</span>
            </span>
            <span className="e-badge">Friday</span>
          </label>
          <label className="e-rowline" style={{ padding: "12px 0", cursor: "pointer" }}>
            <input type="radio" name="src" className="e-check" />
            <span style={{ flex: "1", fontSize: "16px" }}>A stage</span>
            <select className="e-input" style={{ width: "200px", minHeight: "44px" }} aria-label="Stage">
              <option>Recruiter</option>
              <option>Hiring manager</option>
              <option>Panel</option>
              <option>Leadership</option>
              <option>Technical</option>
            </select>
          </label>
          <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "14px 18px", margin: "4px 0 8px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>What the hiring manager stage is like</span>
            <span className="e-meta">They're deciding whether you can do this job and how you work. Answers of 60 to 90 seconds. Follow-ups dig into what you owned and your numbers.</span>
          </div>
          <label className="e-rowline" style={{ padding: "12px 0", cursor: "pointer" }}>
            <input type="radio" name="src" className="e-check" />
            <span style={{ flex: "1", fontSize: "16px" }}>One of your stories</span>
            <select className="e-input" style={{ width: "200px", minHeight: "44px" }} aria-label="Story">
              <option>Onboarding drop-off</option>
              <option>Reactivation program</option>
              <option>Deliverability rescue</option>
            </select>
          </label>
          <label className="e-rowline" style={{ padding: "12px 0", borderBottom: "none", cursor: "pointer" }}>
            <input type="radio" name="src" className="e-check" />
            <span style={{ flex: "1", fontSize: "16px" }}>Your own question</span>
          </label>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>Questions</span>
            <button type="button" className="e-chip">3</button>
            <button type="button" className="e-chip e-chip-on" aria-pressed="true">5</button>
            <button type="button" className="e-chip">10</button>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "15px", cursor: "pointer" }}>
            <input type="checkbox" className="e-check" defaultChecked />Follow-up questions
          </label>
        </div>
        <div className="e-soft" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px" }}>
          <span className="e-dot" aria-hidden="true" />
          <span className="e-meta" style={{ flex: "1" }}>
            Focus this session: <strong style={{ color: "var(--e-ink)" }}>getting to the point</strong>
          </span>
          <Link to="8-1-settings-profile" className="e-small">Change</Link>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <Link to="2-1-home" className="e-btn e-btn-ghost">Cancel</Link>
          <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-big">Start</Link>
        </div>
      </div>
    </FocusShell>
  );
}
