// Draft generated from Design/screens/html/4-4-session-results-mock-debrief.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

export default function SessionResultsMockDebrief() {
  return (
    <FocusShell>
      <div className="e-wrap">
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
              <Wordmark size={24} />
            </span>
            <span className="e-pill" style={{ background: "var(--e-ink)", color: "#FFFFFF", fontWeight: "600" }} title="A whole stage straight through, notes at the end">Mock</span>
            <span className="e-pill">Kestrel Pay · Leadership, startup · 14 min</span>
          </div>
          <Link to="2-1-home" className="e-btn e-btn-white e-btn-sm">Done</Link>
        </header>
        <section className="e-card" style={{ padding: "36px", display: "flex", flexWrap: "wrap", gap: "32px", alignItems: "center" }}>
          <div style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">How it went</span>
            <span className="e-hand" style={{ fontSize: "38px", color: "var(--e-win)" }}>5 of 6 opened with the point</span>
            <span className="e-meta">Your commitment answer was clean. The builder or operator question is the one to rehearse before Friday.</span>
          </div>
          <div style={{ flex: "1 1 280px", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
            <div className="e-soft" style={{ padding: "16px" }}>
              <span className="e-small">Follow-ups</span>
              <div className="e-h2">3 of 3 held</div>
            </div>
            <div className="e-soft" style={{ padding: "16px" }}>
              <span className="e-small">Average answer</span>
              <div className="e-h2">0:52</div>
            </div>
            <div className="e-soft" style={{ padding: "16px" }}>
              <span className="e-small">Numbers said</span>
              <div className="e-h2">4 of 5</div>
            </div>
            <div className="e-soft" style={{ padding: "16px", background: "var(--e-highlight)" }}>
              <span className="e-small">To check</span>
              <div className="e-h2">1 mismatch</div>
            </div>
          </div>
        </section>
        <section className="e-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px", boxShadow: "inset 0 0 0 2px #D5DAE3" }}>
          <span className="e-badge">Said differently</span>
          <span style={{ flex: "1 1 420px", fontSize: "16px", lineHeight: "1.5" }}>
            In the recruiter stage you said <strong>four weeks' notice</strong>. Here you said <strong>two weeks</strong>. Pick one and say it the same way every time.
          </span>
          <button type="button" className="e-btn e-btn-line e-btn-sm">Two weeks is right now</button>
          <Link to="6-8-application-what-you-ve-said" className="e-btn e-btn-ghost e-btn-sm">See what you've said</Link>
        </section>
        <section className="e-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 20px", padding: "20px 28px" }}>
          <span className="e-h3" style={{ flex: "1 1 100%" }}>From your resume, said out loud</span>
          <span className="e-badge e-badge-ok">No ops team behind you</span>
          <span className="e-badge e-badge-ok">Activation 31% to 44%</span>
          <span className="e-badge">Weekly reporting to leadership · not said</span>
          <Link to="6-5-application-the-resume-you-sent" className="e-btn e-btn-ghost e-btn-sm" style={{ marginLeft: "auto" }}>See your resume</Link>
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "0", padding: "12px 28px" }}>
          <div className="e-rowline" style={{ alignItems: "flex-start", padding: "22px 0" }}>
            <span className="e-small" style={{ width: "28px", paddingTop: "3px" }}>1</span>
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span className="e-h3">Are you looking for a full-time role, or doing your own thing, or both?</span>
              <span className="e-hand" style={{ fontSize: "21px" }}>Full-time came first, side work came second and short. Clean.</span>
            </div>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm">Listen</button>
          </div>
          <div className="e-rowline" style={{ alignItems: "flex-start", padding: "22px 0", background: "var(--e-ground)", margin: "0 -28px", paddingLeft: "28px", paddingRight: "28px" }}>
            <span className="e-small" style={{ width: "28px", paddingTop: "3px" }}>2</span>
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "8px" }}>
              <span className="e-h3">Are you more of a builder, or the person who runs it day to day?</span>
              <span className="e-hand" style={{ fontSize: "21px" }}>You described the system for 50 seconds before saying you'd run it. Start with "Both."</span>
              <span style={{ fontSize: "16px", lineHeight: "1.5" }}>
                <span className="e-small">Try saying</span>"Both. I build it and I run it: at Fernhill I rebuilt the trigger, then tested it every week until activation moved."
              </span>
            </div>
            <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-sm">Rehearse</Link>
          </div>
          <div className="e-rowline" style={{ alignItems: "flex-start", padding: "22px 0" }}>
            <span className="e-small" style={{ width: "28px", paddingTop: "3px" }}>2a</span>
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span className="e-meta">Follow-up · "Wouldn't activation have gone up anyway?"</span>
              <span className="e-hand" style={{ fontSize: "21px" }}>You held your ground and named the control group. Good.</span>
            </div>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm">Listen</button>
          </div>
          <div className="e-rowline" style={{ alignItems: "flex-start", padding: "22px 0" }}>
            <span className="e-small" style={{ width: "28px", paddingTop: "3px" }}>3</span>
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span className="e-h3">Why are you leaving Fernhill?</span>
              <span className="e-hand" style={{ fontSize: "21px" }}>Forward-looking and specific. The notice period changed from last time, see above.</span>
            </div>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm">Listen</button>
          </div>
          <div className="e-rowline" style={{ alignItems: "flex-start", padding: "22px 0" }}>
            <span className="e-small" style={{ width: "28px", paddingTop: "3px" }}>4</span>
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span className="e-h3">Tell me about a decision you made with incomplete data.</span>
              <span className="e-hand" style={{ fontSize: "21px" }}>Strong story. You said 5 percent; your story bank says 4.8. Say the real number.</span>
            </div>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm">Listen</button>
          </div>
          <div className="e-rowline" style={{ alignItems: "flex-start", padding: "22px 0", borderBottom: "none" }}>
            <span className="e-small" style={{ width: "28px", paddingTop: "3px" }}>Q</span>
            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span className="e-h3">Your questions for them</span>
              <span className="e-hand" style={{ fontSize: "21px" }}>The first one opened with what you expected. The second asked about team size, which they'd already told you.</span>
            </div>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm">Listen</button>
          </div>
        </section>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <span className="e-meta">Next time: open with "Both." when they ask builder or operator.</span>
          <div style={{ display: "flex", gap: "12px" }}>
            <Link to="2-1-home" className="e-btn e-btn-ghost">Back home</Link>
            <Link to="4-1-mock-in-progress" className="e-btn e-btn-primary e-btn-big">Run it again</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
