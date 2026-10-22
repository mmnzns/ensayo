import { useEffect, useState } from "react";
import { daysUntil, nextInterview, useStore } from "../../data/store";
import type { Mode, StageId } from "../../data/types";
import { checkAi, liveAvailable, startLive } from "../../practice/live";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { dayBadge, lowerFirst } from "./format";
import { clearSessionPreset, peekSessionPreset, type SessionSource } from "./preset";

const LENGTHS = [3, 5, 10];

/** Questions in a Mock before the closing "what questions do you have for me?". */
const MOCK_QUESTIONS = 6;

export default function StartASession() {
  const store = useStore();
  const { habits, profile, stories, applications } = store;
  const blurbs = store.screens.home.stageBlurbs;
  const now = store.now();
  const next = nextInterview(applications, now);
  const nextAt = next ? new Date(next.stage.at as string) : null;

  const [preset] = useState(peekSessionPreset);
  useEffect(() => clearSessionPreset, []);

  const [mode, setModeState] = useState<Mode>(preset.mode ?? "drill");
  const [source, setSource] = useState<SessionSource>(() => {
    const wanted = preset.source ?? (next ? "application" : "stage");
    if (wanted === "application" && !next) return "stage";
    if (wanted === "story" && stories.length === 0) return "stage";
    if (preset.mode === "mock" && (wanted === "story" || wanted === "own")) return next ? "application" : "stage";
    return wanted;
  });
  const [stage, setStage] = useState<StageId>(preset.stage ?? next?.stage.stage ?? blurbs[0]?.stage ?? "recruiter");
  const [storyId, setStoryId] = useState(stories[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [length, setLength] = useState(5);
  const [followUps, setFollowUps] = useState(true);

  const mock = mode === "mock";
  const setMode = (m: Mode) => {
    setModeState(m);
    // A Mock runs one whole stage, so it can't start from one story or one typed question.
    if (m === "mock" && (source === "story" || source === "own")) setSource(next ? "application" : "stage");
  };

  const shownStage: StageId | undefined = source === "application" ? next?.stage.stage : source === "stage" ? stage : undefined;
  const blurb = blurbs.find((b) => b.stage === shownStage);

  const focusHabit = habits.find((h) => h.id === profile.focusHabits[0]);
  const noPosting = source === "application" && !!next && next.application.analysis === null;
  const needsText = source === "own" && question.trim() === "";
  // In the app a Mock runs on the practice screens too (no note after an answer); the browser preview keeps the Mock demo.
  const startTo = noPosting ? "home-session-no-questions" : mock && !liveAvailable() ? "4-1-mock-in-progress" : "3-1-practice-interviewer-asking";

  // In the app a Drill runs the real loop; in the browser preview it stays the mock demo.
  const beginLive = () => {
    if (noPosting || !liveAvailable()) return;
    const app = source === "application" ? next : undefined;
    startLive(
      {
        mode: mock ? "mock" : "drill",
        stage: app ? app.stage.stage : stage,
        count: mock ? MOCK_QUESTIONS : length,
        source,
        storyId,
        ownQuestion: question,
        startup: app?.application.startup ?? false,
        applicationId: app?.application.id ?? null,
      },
      { targetRole: profile.targetRole, stories, methods: store.methods },
    );
    void checkAi();
  };

  const modeCard = (on: boolean): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "18px",
    cursor: "pointer",
    boxShadow: on ? "inset 0 0 0 2px var(--e-primary)" : "inset 0 0 0 1.5px var(--e-line)",
    ...(on ? { background: "var(--e-tint)" } : {}),
  });
  const dim = (off: boolean): React.CSSProperties => (off ? { opacity: 0.5, cursor: "not-allowed" } : { cursor: "pointer" });

  return (
    <FocusShell style={{ background: "rgba(43,39,34,0.32)", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ss-title" className="e-card" style={{ width: "100%", maxWidth: "680px", padding: "36px", display: "flex", flexDirection: "column", gap: "24px", boxShadow: "0 24px 64px rgba(43,39,34,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <h1 id="ss-title" className="e-h2" style={{ fontSize: "24px" }}>Start a session</h1>
          <Link to="2-1-home" className="e-btn e-btn-ghost e-btn-sm" aria-label="Close">✕</Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
          <label className="e-card" style={modeCard(!mock)}>
            <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input type="radio" name="mode" className="e-check" checked={!mock} onChange={() => setMode("drill")} />
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
          <label className="e-card" style={modeCard(mock)}>
            <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input type="radio" name="mode" className="e-check" checked={mock} onChange={() => setMode("mock")} />
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
        <div role="radiogroup" aria-labelledby="ss-from" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <span id="ss-from" style={{ fontSize: "14px", fontWeight: "600" }}>Questions from</span>
          {next && nextAt && (
            <label className="e-rowline" style={{ padding: "12px 0", cursor: "pointer" }}>
              <input type="radio" name="src" className="e-check" checked={source === "application"} onChange={() => setSource("application")} />
              <span style={{ flex: "1" }}>
                <span className="e-h3" style={{ fontSize: "16px" }}>{next.application.company}</span>{" "}<span className="e-meta">· {next.stage.label} stage</span>
              </span>
              <span className="e-badge">{dayBadge(nextAt, daysUntil(nextAt, now))}</span>
            </label>
          )}
          <label className="e-rowline" style={{ padding: "12px 0", cursor: "pointer" }}>
            <input type="radio" name="src" className="e-check" checked={source === "stage"} onChange={() => setSource("stage")} />
            <span style={{ flex: "1", fontSize: "16px" }}>A stage</span>
            <select
              className="e-input"
              style={{ width: "200px", minHeight: "44px" }}
              aria-label="Stage"
              value={stage}
              onFocus={() => setSource("stage")}
              onChange={(e) => {
                setStage(e.target.value as StageId);
                setSource("stage");
              }}
            >
              {blurbs.map((b) => (
                <option key={b.stage} value={b.stage}>{b.label}</option>
              ))}
            </select>
          </label>
          {blurb && (
            <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "14px 18px", margin: "4px 0 8px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600" }}>What the {blurb.label.toLowerCase()} stage is like</span>
              <span className="e-meta">{blurb.like}</span>
            </div>
          )}
          <label className="e-rowline" style={{ padding: "12px 0", ...dim(mock || stories.length === 0) }}>
            <input type="radio" name="src" className="e-check" checked={source === "story"} disabled={mock || stories.length === 0} onChange={() => setSource("story")} />
            <span style={{ flex: "1", fontSize: "16px" }}>One of your stories</span>
            <select
              className="e-input"
              style={{ width: "200px", minHeight: "44px" }}
              aria-label="Story"
              value={storyId}
              disabled={mock || stories.length === 0}
              onFocus={() => setSource("story")}
              onChange={(e) => {
                setStoryId(e.target.value);
                setSource("story");
              }}
            >
              {stories.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </label>
          <label className="e-rowline" style={{ padding: "12px 0", borderBottom: "none", ...dim(mock) }}>
            <input type="radio" name="src" className="e-check" checked={source === "own"} disabled={mock} onChange={() => setSource("own")} />
            <span style={{ flex: "1", fontSize: "16px" }}>Your own question</span>
          </label>
          {source === "own" && (
            <input
              type="text"
              className="e-input"
              aria-label="Your question"
              placeholder="Type the question you want to be asked"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              autoFocus
            />
          )}
          {mock && <span className="e-small">A Mock runs one whole stage, so it needs an application or a stage.</span>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>Questions</span>
            {mock ? (
              <span className="e-meta">The stage's natural length: about 5 to 7, plus follow-ups</span>
            ) : (
              LENGTHS.map((n) => (
                <button key={n} type="button" className={n === length ? "e-chip e-chip-on" : "e-chip"} aria-pressed={n === length} onClick={() => setLength(n)}>
                  {n}
                </button>
              ))
            )}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "15px", ...dim(mock) }} title={mock ? "In a Mock, follow-ups come up on their own" : undefined}>
            <input type="checkbox" className="e-check" checked={mock || followUps} disabled={mock} onChange={(e) => setFollowUps(e.target.checked)} />
            Follow-up questions
          </label>
        </div>
        {focusHabit && (
          <div className="e-soft" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px" }}>
            <span className="e-dot" aria-hidden="true" />
            <span className="e-meta" style={{ flex: "1" }}>
              Focus this session: <strong style={{ color: "var(--e-ink)" }}>{lowerFirst(focusHabit.label)}</strong>
            </span>
            <Link to="8-1-settings-profile" className="e-small">Change</Link>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <Link to="2-1-home" className="e-btn e-btn-ghost">Cancel</Link>
          {needsText ? (
            <button type="button" className="e-btn e-btn-primary e-btn-big" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
              Start
            </button>
          ) : (
            <Link to={startTo} onClick={beginLive} className="e-btn e-btn-primary e-btn-big">Start</Link>
          )}
        </div>
      </div>
    </FocusShell>
  );
}
