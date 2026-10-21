import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

/** Stories before the first one is added. */
export default function StoriesEmpty() {
  return (
    <AppShell nav="stories">
      <header style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <h1 className="e-h1">Stories</h1>
        <span className="e-meta">The work you'll talk about. Ensayo uses these to check your numbers and pick follow-ups.</span>
      </header>
      <section className="e-card" style={{ padding: "40px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "28px" }}>
        <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-presence" style={{ width: "44px", height: "44px" }} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--e-primary)" }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2z" />
              <path d="M6 21h13" />
            </svg>
          </span>
          <h2 className="e-h1" style={{ fontSize: "28px" }}>No stories yet</h2>
          <p className="e-meta" style={{ margin: "0" }}>A story is a piece of real work you'd talk about in an interview: what was going on, what you did, what changed. With yours here, Ensayo can ask questions that fit and tell you when a number drifted.</p>
        </div>
        <Link to="5-2-add-a-story-paste" className="e-btn e-btn-primary e-btn-big">Add a story</Link>
      </section>
      <span className="e-small">The general questions work without any stories, so you can practice whenever you like.</span>
    </AppShell>
  );
}
