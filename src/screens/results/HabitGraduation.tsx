// Draft generated from Design/screens/html/4-5-habit-graduation.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";

export default function HabitGraduation() {
  return (
    <FocusShell style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="e-card e-glow" style={{ width: "100%", maxWidth: "760px", padding: "48px", display: "flex", flexDirection: "column", alignItems: "center", gap: "28px", textAlign: "center" }}>
        <span className="e-hand" style={{ fontSize: "62px", color: "var(--e-win)" }}>It stuck.</span>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
          <span className="e-label">Habit</span>
          <h1 className="e-h1">Getting to the point</h1>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }} aria-label="Passed 8 of your last 10 answers">
          <div style={{ display: "flex", gap: "8px" }}>
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--e-sunrise)" }} />
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--e-sunrise)" }} />
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-line)" }} />
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--e-sunrise)" }} />
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--e-sunrise)" }} />
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--e-sunrise)" }} />
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-line)" }} />
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--e-sunrise)" }} />
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--e-sunrise)" }} />
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--e-sunrise)" }} />
          </div>
          <span className="e-meta">8 of your last 10 answers opened with the point.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", width: "100%" }}>
          <div className="e-soft" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-small">Three weeks ago</span>
            <span className="e-h2">41s to your point</span>
          </div>
          <div className="e-soft" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-small">Now</span>
            <span className="e-h2">8s to your point</span>
          </div>
        </div>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", borderTop: "1px solid var(--e-line)", paddingTop: "24px" }}>
          <span className="e-h3">What do you want to work on next?</span>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px" }}>
            <button type="button" className="e-chip e-chip-on" aria-pressed="true">
              Saying what I decided <span className="e-small" style={{ fontWeight: "400" }}>suggested</span>
            </button>
            <button type="button" className="e-chip">Saying my numbers</button>
            <button type="button" className="e-chip">Fewer filler words</button>
          </div>
          <span className="e-small">Ensayo still keeps an eye on getting to the point. If it slips, you'll hear about it.</span>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <Link to="4-3-session-results-drill" className="e-btn e-btn-ghost">Back to results</Link>
          <Link to="2-1-home" className="e-btn e-btn-primary e-btn-big">Make it my focus</Link>
        </div>
      </div>
    </FocusShell>
  );
}
