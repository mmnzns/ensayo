// Draft generated from Design/screens/html/2-2-home-empty.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useStore } from "../../data/store";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { longDate } from "./format";

const NUMBER_WORDS: Record<number, string> = { 3: "three", 5: "five", 10: "ten" };

export default function HomeEmpty() {
  const store = useStore();
  const { profile } = store;
  const { drill } = store.screens.home;
  return (
    <AppShell nav="home">
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span className="e-meta">{longDate(store.now())}</span>
        <h1 className="e-h1">Welcome, {profile.name}</h1>
      </div>
      <section className="e-card" style={{ padding: "40px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "28px" }}>
        <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-label">Start here</span>
          <h2 className="e-h1" style={{ fontSize: "28px" }}>Answer {NUMBER_WORDS[drill.questions] ?? drill.questions} questions out loud</h2>
          <p className="e-meta" style={{ margin: "0" }}>General questions for a {profile.targetRole.toLowerCase()} role. About {drill.minutes} minutes. You'll get one fix after each answer, and a chance to say it again.</p>
        </div>
        <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-big">Practice</Link>
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "20px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-presence" style={{ width: "44px", height: "44px" }} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--e-primary)" }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2z" />
              <path d="M6 21h13" />
            </svg>
          </span>
          <span className="e-h2">Add your stories</span>
          <span className="e-meta">With your real stories and numbers, Ensayo can tell you when you forgot the proof, or when a number drifted.</span>
          <Link to="5-2-add-a-story-paste" className="e-btn e-btn-line e-btn-sm" style={{ alignSelf: "flex-start", marginTop: "4px" }}>Add a story</Link>
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-presence" style={{ width: "44px", height: "44px" }} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--e-primary)" }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="7" width="18" height="13" rx="2" />
              <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            </svg>
          </span>
          <span className="e-h2">Got an interview coming?</span>
          <span className="e-meta">Paste the job posting. Ensayo works out what they'll ask at each stage and which of your stories fits.</span>
          <Link to="6-2-new-application" className="e-btn e-btn-line e-btn-sm" style={{ alignSelf: "flex-start", marginTop: "4px" }}>Add an application</Link>
        </section>
      </div>
      <section className="e-soft" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px" }}>
        <span style={{ flex: "1 1 360px" }} className="e-meta">Right now Ensayo can judge timing, length and filler words. Add an AI engine to hear whether you answered the question and said your numbers.</span>
        <Link to="8-5-settings-ai" className="e-btn e-btn-white e-btn-sm">Add an engine</Link>
      </section>
    </AppShell>
  );
}
