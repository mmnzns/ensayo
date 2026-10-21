/** The three steps of the loop (answer out loud, get one fix, say it again), shown on Welcome and on "That's the loop". */
export default function LoopSteps() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px", width: "100%", maxWidth: "860px" }}>
      <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", textAlign: "left" }}>
        <span className="e-presence" style={{ width: "44px", height: "44px" }} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--e-primary)" }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <path d="M12 18v3" />
          </svg>
        </span>
        <span className="e-h3">Answer out loud</span>
        <span className="e-meta">A real interview question, spoken. You answer the way you would on the call.</span>
      </div>
      <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", textAlign: "left" }}>
        <span className="e-presence" style={{ width: "44px", height: "44px" }} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--e-primary)" }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </span>
        <span className="e-h3">Get one fix</span>
        <span className="e-meta">Not a scorecard. The one thing that would make the biggest difference, and a line to say instead.</span>
      </div>
      <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", textAlign: "left" }}>
        <span className="e-presence" style={{ width: "44px", height: "44px" }} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--e-primary)" }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
        </span>
        <span className="e-h3">Say it again</span>
        <span className="e-meta">Same question, second try. You see what changed, and the habit starts to stick.</span>
      </div>
    </div>
  );
}
