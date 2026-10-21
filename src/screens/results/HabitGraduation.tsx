import { useState } from "react";
import { habitStatus, useStore } from "../../data/store";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";

export default function HabitGraduation() {
  const { habits, screens } = useStore();
  const g = screens.results.graduation;
  const habit = habits.find((h) => h.id === g.habitId);
  const label = habit?.label ?? "";
  const status = habitStatus(g.results);
  const last10 = g.results.slice(-10);
  const choices = g.nextChoices.map((id) => habits.find((h) => h.id === id)).filter((h): h is NonNullable<typeof h> => !!h);
  const [picked, setPicked] = useState<string>(g.suggestedNextId);
  const [confirmed, setConfirmed] = useState(false);
  const pickedHabit = habits.find((h) => h.id === picked);
  const choose = (id: string) => {
    setPicked(id);
    setConfirmed(false);
  };
  return (
    <FocusShell style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="e-card e-glow" style={{ width: "100%", maxWidth: "760px", padding: "48px", display: "flex", flexDirection: "column", alignItems: "center", gap: "28px", textAlign: "center" }}>
        <span className="e-hand" style={{ fontSize: "62px", color: "var(--e-win)" }}>It stuck.</span>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
          <span className="e-label">Habit</span>
          <h1 className="e-h1">{label}</h1>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }} aria-label={`${status.passes} of your last ${status.of} answers ${g.passLine.replace(/\.$/, "")}`}>
          <div style={{ display: "flex", gap: "8px" }}>
            {last10.map((ok, i) => (
              <span key={i} style={ok ? { width: "22px", height: "22px", borderRadius: "50%", background: "var(--e-sunrise)" } : { width: "22px", height: "22px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-line)" }} />
            ))}
          </div>
          <span className="e-meta">
            {status.passes} of your last {status.of} answers {g.passLine}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", width: "100%" }}>
          <div className="e-soft" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-small">{g.before.when}</span>
            <span className="e-h2">{g.before.seconds}s to your point</span>
          </div>
          <div className="e-soft" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-small">Now</span>
            <span className="e-h2">{g.nowSeconds}s to your point</span>
          </div>
        </div>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", borderTop: "1px solid var(--e-line)", paddingTop: "24px" }}>
          <span className="e-h3">What do you want to work on next?</span>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px" }} role="group" aria-label="Next habit">
            {choices.map((h) => (
              <button key={h.id} type="button" className={h.id === picked ? "e-chip e-chip-on" : "e-chip"} aria-pressed={h.id === picked} onClick={() => choose(h.id)}>
                {h.label}
                {h.id === g.suggestedNextId && (
                  <>
                    {" "}
                    <span className="e-small" style={{ fontWeight: "400" }}>suggested</span>
                  </>
                )}
              </button>
            ))}
          </div>
          {pickedHabit && <span className="e-small">When it sticks you'll see things like: {pickedHabit.delta}</span>}
          <span className="e-small">Ensayo still keeps an eye on {label.toLowerCase()}. If it slips, you'll hear about it.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          {confirmed && pickedHabit && (
            <span className="e-meta" role="status" style={{ color: "var(--e-ok)" }}>
              Done. {pickedHabit.label} is your focus now.
            </span>
          )}
          <div style={{ display: "flex", gap: "12px" }}>
            {confirmed ? (
              <Link to="4-3-session-results-drill" className="e-btn e-btn-primary e-btn-big">Back to results</Link>
            ) : (
              <>
                <Link to="4-3-session-results-drill" className="e-btn e-btn-ghost">Back to results</Link>
                <button type="button" className="e-btn e-btn-primary e-btn-big" disabled={!pickedHabit} onClick={() => setConfirmed(true)}>Make it my focus</button>
              </>
            )}
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
