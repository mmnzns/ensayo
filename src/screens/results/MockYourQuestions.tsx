// Draft generated from Design/screens/html/4-2-mock-your-questions.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useStore } from "../../data/store";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import Wordmark from "../../ui/Wordmark";
import { useApplicationExtras } from "../../practice/extras";
import { cancelLive, currentQuestionText, liveSession, MOCK_DEBRIEF, useLive } from "../../practice/live";
import { stageWithKind, useSpaceKey } from "./speak";

export default function MockYourQuestions() {
  const { applications, screens } = useStore();
  const mock = screens.results.mock;
  const liveNow = useLive();
  const running0 = liveNow.active && liveNow.mode === "mock";
  const app = applications.find((a) => a.id === (running0 ? liveNow.applicationId : mock.applicationId));
  const stageText = stageWithKind(running0 ? liveSession().stage : mock.stageLabel, app?.startup);
  const live = useLive();
  const running = live.active && live.mode === "mock";
  const closing = running ? { asker: "Interviewer", text: currentQuestionText() } : mock.questions[mock.questions.length - 1];
  const dots = running ? live.questions : mock.questions;
  // Inside an application, the questions locked the night before for this stage; otherwise none yet (the preview shows its sample).
  const extras = useApplicationExtras(running ? live.applicationId : null);
  const lockedQuestions = running ? (live.stageId ? (extras?.lockedByStage?.[live.stageId]?.questions ?? []) : []) : mock.lockedQuestions;
  // Running: the mic records this moment on the practice screens. Demo: it goes straight on to the debrief.
  const answer = running ? "3-2-practice-recording" : MOCK_DEBRIEF;
  useSpaceKey("4-2-mock-your-questions", () => go(answer));
  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
              <Wordmark size={24} />
            </span>
            <span className="e-pill" style={{ background: "var(--e-ink)", color: "var(--e-surface)", fontWeight: "600" }} title="A whole stage straight through, notes at the end">Mock</span>
            <span className="e-pill">{app ? `${app.company} · ${stageText}` : stageText}</span>
          </div>
          <div className="e-steps" aria-label="Last part">
            {dots.map((q) => (
              <span key={q.id} className="on" />
            ))}
          </div>
          <Link to={MOCK_DEBRIEF} className="e-btn e-btn-white e-btn-sm" onClick={() => running && void cancelLive()}>End mock</Link>
        </header>
      </div>
      <div style={{ flex: "1", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "40px", padding: "32px 0" }}>
        <div style={{ flex: "1 1 420px", maxWidth: "520px", display: "flex", flexDirection: "column", gap: "28px", alignItems: "center", textAlign: "center" }}>
          <div aria-hidden="true" style={{ width: "120px", height: "120px", borderRadius: "50%", background: "color-mix(in srgb, var(--e-primary) 8%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "54px", height: "54px", borderRadius: "50%", background: "var(--e-primary)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="e-label">{closing?.asker}</span>
            <h1 className="e-h1" style={{ fontSize: "32px", fontWeight: "600" }}>{closing?.text}</h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
            <Link to={answer} aria-label="Ask your question" style={{ width: "96px", height: "96px", borderRadius: "50%", background: "var(--e-primary)", color: "var(--e-primary-ink)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px color-mix(in srgb, var(--e-primary) 28%, transparent)" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
              </svg>
            </Link>
            <span className="e-meta">
              Ask one or two, out loud · <span className="e-kbd">Space</span>
            </span>
          </div>
        </div>
        <aside className="e-card" style={{ flex: "1 1 340px", maxWidth: "440px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span className="e-label">Your locked questions</span>
          <p className="e-meta" style={{ margin: "0" }}>{mock.lockedIntro}</p>
          {lockedQuestions.length === 0 && <span className="e-small">No questions locked yet. Ask what you'd really like to know.</span>}
          {lockedQuestions.map((q, i) => (
            <div key={q} style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "14px 0", borderBottom: i < lockedQuestions.length - 1 ? "1px solid var(--e-line)" : undefined }}>
              <span className="e-small">{i + 1}</span>
              <span style={{ fontSize: "15px", lineHeight: "1.55" }}>{q}</span>
            </div>
          ))}
          <span className="e-small">{mock.lockedTip}</span>
        </aside>
      </div>
    </FocusShell>
  );
}
