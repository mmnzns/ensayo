import { useState } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { useStore } from "../../data/store";
import type { ProcessStage } from "../../data/types";
import { STAGE_LABEL, nextStage, parseDate, shortDate, whenText } from "./format";
import { AppHeader, AppTabs, withFeatured, type Featured } from "./parts";

const LOCK = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: "2px", stroke: "var(--e-primary)" }}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const linkBtn = { background: "none", border: "none", padding: 0, font: "inherit", fontSize: "13px", color: "var(--e-muted)", textDecoration: "underline", cursor: "pointer" } as const;

const pad = (n: number) => String(n).padStart(2, "0");
function splitAt(at: string | undefined): { date: string; time: string } {
  const d = parseDate(at);
  if (!d) return { date: "", time: "" };
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: at && at.includes("T") ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "" };
}

function practiceText(s: ProcessStage): string {
  if (s.note) return s.note;
  return s.sessions > 0 ? `${s.sessions} ${s.sessions === 1 ? "session" : "sessions"} practiced` : "not practiced";
}

function DrillMock({ id }: { id: string }) {
  return (
    <>
      <div style={{ display: "flex", gap: "8px" }}>
        <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-sm">Drill</Link>
        <Link to="4-1-mock-in-progress" className="e-btn e-btn-white e-btn-sm">Mock</Link>
      </div>
      <span className="e-small" id={`dm-${id}`}>Drill: a note after each answer, try again. Mock: the whole stage straight through, notes at the end.</span>
    </>
  );
}

function StagesTab({ app, extras, now }: Featured) {
  const store = useStore();
  const stages = [...app.process].sort((a, b) => a.order - b.order);
  const current = nextStage(app);
  const [at, setAt] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; date: string; time: string } | null>(null);
  const [practiceOpen, setPracticeOpen] = useState<string | null>(null);

  const nb = extras.nightBefore;
  const nbStage = nb ? app.process.find((s) => s.id === nb.stageId) : undefined;
  const story = nb ? store.stories.find((s) => s.id === nb.powerStoryId) : undefined;
  const [opener, setOpener] = useState(nb?.opener ?? "");
  const [powerId, setPowerId] = useState(nb?.powerStoryId ?? "");
  const [questions, setQuestions] = useState<string[]>(nb?.questions ?? []);
  const [change, setChange] = useState<"opener" | "power" | "questions" | null>(null);
  const powerStory = store.stories.find((s) => s.id === powerId) ?? story;

  const atOf = (s: ProcessStage) => (s.id in at ? at[s.id] || undefined : s.at);
  const saveEdit = () => {
    if (!editing) return;
    setAt({ ...at, [editing.id]: editing.date ? (editing.time ? `${editing.date}T${editing.time}` : editing.date) : "" });
    setEditing(null);
  };
  const editor = (s: ProcessStage) =>
    editing && editing.id === s.id ? (
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
        <input type="date" className="e-input" style={{ width: "170px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} aria-label={`${s.label} date`} value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
        <input type="time" className="e-input" style={{ width: "130px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} aria-label={`${s.label} time`} value={editing.time} onChange={(e) => setEditing({ ...editing, time: e.target.value })} />
        <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={saveEdit}>Save</button>
        <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setEditing(null)}>Cancel</button>
      </div>
    ) : null;
  const startEdit = (s: ProcessStage) => setEditing({ id: s.id, ...splitAt(atOf(s)) });

  return (
    <AppShell nav="applications">
      <AppHeader app={app} now={now} />
      <AppTabs current="stages" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "0" }}>
          <span className="e-h2" style={{ paddingBottom: "12px" }}>Stages</span>
          {stages.length === 0 && <span className="e-meta">No stages yet. Add them from Edit details.</span>}
          {stages.map((s, i) => {
            const label = s.label || STAGE_LABEL[s.stage];
            const when = atOf(s);
            const last = i === stages.length - 1;
            const isCurrent = !s.done && current?.id === s.id;
            const border = last ? {} : { borderBottom: "1px solid var(--e-line)" };
            if (s.done) {
              return (
                <div key={s.id} style={{ display: "flex", gap: "16px", padding: "16px 0", ...border }}>
                  <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--e-primary)", color: "var(--e-primary-ink)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                  <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span className="e-h3">{label}</span>
                    <span className="e-small">{s.decides}</span>
                    <span className="e-meta">{`${when ? `${shortDate(when)} · ` : ""}done · ${practiceText(s)}`}</span>
                  </div>
                </div>
              );
            }
            if (isCurrent) {
              return (
                <div key={s.id} style={{ display: "flex", gap: "16px", padding: "16px 0", background: "var(--e-ground)", margin: "0 -28px", paddingLeft: "28px", paddingRight: "28px", ...border }}>
                  <span style={{ width: "28px", height: "28px", borderRadius: "50%", boxShadow: "inset 0 0 0 3px var(--e-win)", flex: "none" }} />
                  <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                      <span className="e-h3">{label}</span>
                      {editing?.id !== s.id && (
                        <>
                          <span className="e-badge">{when ? whenText(when, now) : "No date yet"}</span>
                          <button type="button" style={linkBtn} onClick={() => startEdit(s)}>{when ? "Change" : "Add date"}</button>
                        </>
                      )}
                    </div>
                    {editor(s)}
                    <span className="e-small">{s.decides}</span>
                    <span className="e-meta">{practiceText(s)}</span>
                    <DrillMock id={s.id} />
                  </div>
                </div>
              );
            }
            return (
              <div key={s.id} style={{ display: "flex", gap: "16px", padding: "16px 0", ...border }}>
                <span style={{ width: "28px", height: "28px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-line)", flex: "none" }} />
                <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span className="e-h3">
                    {label}
                    {s.stage === "leadership" && app.startup && <span className="e-small" style={{ fontWeight: "400" }}> · founder</span>}
                  </span>
                  <span className="e-small">{s.decides}</span>
                  {editing?.id === s.id ? (
                    editor(s)
                  ) : (
                    <span className="e-meta">
                      {when ? `${whenText(when, now)} · ` : "No date yet · "}
                      <button type="button" style={linkBtn} onClick={() => startEdit(s)}>{when ? "Change" : "Add date"}</button>
                      {` · ${practiceText(s)}`}
                    </span>
                  )}
                  {practiceOpen === s.id && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "6px" }}>
                      <DrillMock id={s.id} />
                    </div>
                  )}
                </div>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-expanded={practiceOpen === s.id} onClick={() => setPracticeOpen(practiceOpen === s.id ? null : s.id)}>Practice</button>
              </div>
            );
          })}
        </section>
        <section className="e-card" style={{ flex: "1 1 440px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px", boxShadow: "inset 0 0 0 2px var(--e-primary)" }}>
          {!nb ? (
            <>
              <span className="e-label" style={{ color: "var(--e-primary-dark)" }}>Night before</span>
              <span className="e-h2">Nothing to lock yet.</span>
              <span className="e-meta">Once the next stage has a date, you pick an opener, one power story and two questions here.</span>
            </>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="e-label" style={{ color: "var(--e-primary-dark)" }}>{`Night before · ${nbStage ? nbStage.label || STAGE_LABEL[nbStage.stage] : ""}`}</span>
                <span className="e-h2">Lock three things, then change nothing.</span>
                <span className="e-meta">More prep the night before makes delivery worse. Rehearse these out loud and stop.</span>
              </div>
              <div className="e-soft" style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                {LOCK}
                <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span className="e-h3">Your opener</span>
                  {change === "opener" ? (
                    <textarea className="e-input" rows={3} aria-label="Your opener" value={opener} onChange={(e) => setOpener(e.target.value)} />
                  ) : (
                    <span className="e-meta">{`${nb.openerPrompt}: ${opener}`}</span>
                  )}
                </div>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ minHeight: "36px" }} onClick={() => setChange(change === "opener" ? null : "opener")}>{change === "opener" ? "Done" : "Change"}</button>
              </div>
              <div className="e-soft" style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                {LOCK}
                <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span className="e-h3">One power story</span>
                  {change === "power" ? (
                    <select className="e-input" aria-label="Power story" value={powerId} onChange={(e) => setPowerId(e.target.value)}>
                      {store.stories.map((s) => (
                        <option key={s.id} value={s.id}>{`${s.title} · ${s.headline}`}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="e-meta">{powerStory ? (powerStory.id === nb.powerStoryId ? `${powerStory.title} · ${nb.powerNumbers}` : `${powerStory.title} · ${powerStory.headline}`) : "Pick one of your stories"}</span>
                  )}
                </div>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ minHeight: "36px" }} onClick={() => setChange(change === "power" ? null : "power")}>{change === "power" ? "Done" : "Change"}</button>
              </div>
              <div className="e-soft" style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                {LOCK}
                <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span className="e-h3">Two questions to ask</span>
                  {change === "questions" ? (
                    <span style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {[0, 1].map((i) => (
                        <input key={i} className="e-input" style={{ minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} aria-label={`Question ${i + 1}`} value={questions[i] ?? ""} onChange={(e) => setQuestions(Object.assign([questions[0] ?? "", questions[1] ?? ""], { [i]: e.target.value }))} />
                      ))}
                    </span>
                  ) : (
                    <span className="e-meta">
                      {[0, 1].map((i) => (
                        <span key={i}>
                          {i > 0 && <br />}
                          {`${i + 1}. ${questions[i] ?? "Not chosen yet"}`}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ minHeight: "36px" }} onClick={() => setChange(change === "questions" ? null : "questions")}>{change === "questions" ? "Done" : "Change"}</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary">{`Rehearse just these · ${nb.rehearseMinutes} min`}</Link>
                <Link to="6-7-cue-sheet" className="e-btn e-btn-white">Open cue sheet</Link>
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}

export default withFeatured(StagesTab);
