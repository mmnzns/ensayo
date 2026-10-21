// Draft generated from Design/screens/html/7-1-progress-habits.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function ProgressHabits() {
  return (
    <AppShell nav="progress">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <h1 className="e-h1">Progress</h1>
        <div style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)" }} role="tablist">
          <Link to="7-1-progress-habits" role="tab" aria-selected="true" className="e-btn e-btn-sm" style={{ background: "var(--e-tint)", color: "var(--e-ink)" }}>Habits</Link>
          <Link to="7-2-progress-sessions" role="tab" aria-selected="false" className="e-btn e-btn-sm e-btn-ghost">Sessions</Link>
        </div>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "16px" }}>
        <div className="e-card" style={{ padding: "20px" }}>
          <span className="e-small">Days in a row</span>
          <div className="e-hand" style={{ fontSize: "31px", color: "var(--e-win)" }}>5</div>
        </div>
        <div className="e-card" style={{ padding: "20px" }}>
          <span className="e-small">Answers practiced</span>
          <div className="e-hand" style={{ fontSize: "31px" }}>58</div>
        </div>
        <div className="e-card" style={{ padding: "20px" }}>
          <span className="e-small">Questions faced</span>
          <div className="e-hand" style={{ fontSize: "31px" }}>23</div>
        </div>
        <div className="e-card" style={{ padding: "20px" }}>
          <span className="e-small">Follow-ups handled</span>
          <div className="e-hand" style={{ fontSize: "31px" }}>11</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "14px", boxShadow: "inset 0 0 0 2px var(--e-primary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
            <span className="e-label" style={{ color: "var(--e-primary-dark)" }}>Focus</span>
            <span className="e-small">since Oct 21</span>
          </div>
          <span className="e-h2">Saying what you decided</span>
          <div style={{ display: "flex", gap: "6px" }} aria-label="Last 10 answers: 5 passed">
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-line)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-primary)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-line)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-line)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-primary)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-primary)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-line)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-primary)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-primary)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-line)" }} />
          </div>
          <span className="e-meta">5 of your last 10 first tries · the fix stuck on retry 4 of 5 times</span>
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "14px", boxShadow: "inset 0 0 0 2px var(--e-primary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
            <span className="e-label" style={{ color: "var(--e-primary-dark)" }}>Focus</span>
            <span className="e-small">since Oct 2</span>
          </div>
          <span className="e-h2">Stopping once the point lands</span>
          <div style={{ display: "flex", gap: "6px" }} aria-label="Last 10 answers: 4 passed">
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-line)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-line)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-primary)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-line)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-line)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-primary)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-line)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-primary)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-line)" }} />
            <span style={{ flex: "1", height: "28px", borderRadius: "6px", background: "var(--e-primary)" }} />
          </div>
          <span className="e-meta">4 of your last 10 first tries · about 14 seconds past the point, down from 31</span>
        </section>
      </div>
      <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "0", padding: "8px 28px" }}>
        <div className="e-rowline" style={{ padding: "14px 0" }}>
          <span className="e-h3" style={{ flex: "1" }}>All habits</span>
          <span className="e-small" style={{ width: "200px" }}>right first time</span>
          <span className="e-small" style={{ width: "120px", textAlign: "right" }}>fix stuck on retry</span>
        </div>
        <div className="e-rowline" style={{ padding: "14px 0" }}>
          <span style={{ flex: "1", display: "flex", alignItems: "center", gap: "10px" }}>
            Getting to the point <span className="e-badge" style={{ background: "#FFE7B8", color: "#7A4A12" }}>Graduated</span>
          </span>
          <div className="e-bar" style={{ width: "200px" }}>
            <span style={{ width: "80%" }} />
          </div>
          <span className="e-meta" style={{ width: "120px", textAlign: "right" }}>9 of 10</span>
        </div>
        <div className="e-rowline" style={{ padding: "14px 0" }}>
          <span style={{ flex: "1" }}>Saying your numbers</span>
          <div className="e-bar" style={{ width: "200px" }}>
            <span style={{ width: "90%" }} />
          </div>
          <span className="e-meta" style={{ width: "120px", textAlign: "right" }}>3 of 3</span>
        </div>
        <div className="e-rowline" style={{ padding: "14px 0" }}>
          <span style={{ flex: "1" }}>Picking a story that fits</span>
          <div className="e-bar" style={{ width: "200px" }}>
            <span style={{ width: "100%" }} />
          </div>
          <span className="e-meta" style={{ width: "120px", textAlign: "right" }}>n/a</span>
        </div>
        <div className="e-rowline" style={{ padding: "14px 0" }}>
          <span style={{ flex: "1" }}>Keeping the setup short</span>
          <div className="e-bar" style={{ width: "200px" }}>
            <span style={{ width: "70%" }} />
          </div>
          <span className="e-meta" style={{ width: "120px", textAlign: "right" }}>2 of 3</span>
        </div>
        <div className="e-rowline" style={{ padding: "14px 0" }}>
          <span style={{ flex: "1" }}>Opening with how you work</span>
          <div className="e-bar" style={{ width: "200px" }}>
            <span style={{ width: "30%" }} />
          </div>
          <span className="e-meta" style={{ width: "120px", textAlign: "right" }}>1 of 4</span>
        </div>
        <div className="e-rowline" style={{ padding: "14px 0" }}>
          <span style={{ flex: "1" }}>Saying it with conviction</span>
          <div className="e-bar" style={{ width: "200px" }}>
            <span style={{ width: "90%" }} />
          </div>
          <span className="e-meta" style={{ width: "120px", textAlign: "right" }}>1 of 1</span>
        </div>
        <div className="e-rowline" style={{ padding: "14px 0" }}>
          <span style={{ flex: "1" }}>
            Filler words <span className="e-small">· 3.1 a minute</span>
          </span>
          <div className="e-bar" style={{ width: "200px" }}>
            <span style={{ width: "60%" }} />
          </div>
          <span className="e-meta" style={{ width: "120px", textAlign: "right" }}>2 of 4</span>
        </div>
        <div className="e-rowline" style={{ padding: "14px 0", borderBottom: "none" }}>
          <span style={{ flex: "1" }}>No knocks on past teams</span>
          <div className="e-bar" style={{ width: "200px" }}>
            <span style={{ width: "100%" }} />
          </div>
          <span className="e-meta" style={{ width: "120px", textAlign: "right" }}>n/a</span>
        </div>
      </section>
      <span className="e-small">Based on your last 20 answers. How answers are judged was updated on Oct 18; older results keep their original marks.</span>
    </AppShell>
  );
}
