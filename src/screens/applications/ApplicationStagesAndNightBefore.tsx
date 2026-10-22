import { useState } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import type { NightBefore } from "../../data/screens/applications";
import { useActions, useRepHistory } from "../../data/real";
import { answersIn, deletePracticeText, restoreHint } from "../../data/trash";
import { useStore } from "../../data/store";
import type { ProcessStage, StageId } from "../../data/types";
import { STAGE_LABEL, nextStage, shortDate, whenText } from "./format";
import { askedLine, noteFor } from "../../data/interviews";
import { interviewHappened } from "./afterInterview";
import { joinAt, lockQuestions, splitAt } from "./forms";
import { AppHeader, AppTabs, ErrorLine, useAppLink, useRun, withFeatured, type Featured } from "./parts";

const LOCK = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: "2px", stroke: "var(--e-primary)" }}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const linkBtn = { background: "none", border: "none", padding: 0, font: "inherit", fontSize: "13px", color: "var(--e-muted)", textDecoration: "underline", cursor: "pointer" } as const;
const ALL_STAGES: StageId[] = ["recruiter", "hiring_manager", "technical", "panel", "leadership"];

function practiceText(s: ProcessStage): string {
  if (s.note) return s.note;
  return s.sessions > 0 ? `${s.sessions} ${s.sessions === 1 ? "session" : "sessions"} practiced` : "not practiced";
}

function DrillMock({ id, stageId }: { id: string; stageId: string }) {
  const link = useAppLink();
  return (
    <>
      <div style={{ display: "flex", gap: "8px" }}>
        <Link to={link("2-3-start-a-session", { stage: stageId })} className="e-btn e-btn-primary e-btn-sm">Drill</Link>
        <Link to={link("2-3-start-a-session", { stage: stageId, mode: "mock" })} className="e-btn e-btn-white e-btn-sm">Mock</Link>
      </div>
      <span className="e-small" id={`dm-${id}`}>Drill: a note after each answer, try again. Mock: the whole stage straight through, notes at the end.</span>
    </>
  );
}

/** The night-before set for one stage: an opener, one power story from the bank, up to two questions to ask. */
function NightBeforeCard({ app, stage, stages, lock, onPick }: { app: Featured["app"]; stage: ProcessStage | undefined; stages: ProcessStage[]; lock: NightBefore | undefined; onPick: (id: string) => void }) {
  const store = useStore();
  const actions = useActions();
  const link = useAppLink();
  const { busy, error, run } = useRun();
  const [opener, setOpener] = useState(lock?.opener ?? "");
  const [powerId, setPowerId] = useState(lock?.powerStoryId ?? "");
  const [questions, setQuestions] = useState<string[]>(lock?.questions ?? []);
  const [change, setChange] = useState<"opener" | "power" | "questions" | null>(null);
  const [saved, setSaved] = useState(false);
  const stories = store.stories;
  const powerStory = stories.find((x) => x.id === powerId);
  const open = (k: "opener" | "power" | "questions") => !lock || change === k;
  const dirty = !!lock && (opener !== lock.opener || powerId !== lock.powerStoryId || JSON.stringify(lockQuestions(questions)) !== JSON.stringify(lock.questions));
  const label = stage ? stage.label || STAGE_LABEL[stage.stage] : "";

  const save = async () => {
    if (!stage) return;
    const done = await run(() => actions.saveLocked(app.id, { stageId: stage.id, opener, openerPrompt: lock?.openerPrompt, powerStory: powerId, questions: lockQuestions(questions) }));
    if (done) {
      setChange(null);
      setSaved(true);
    }
  };
  const clear = async () => {
    if (!stage) return;
    const done = await run(() => actions.clearLocked(app.id, stage.id));
    if (done) {
      setOpener("");
      setPowerId("");
      setQuestions([]);
      setSaved(false);
    }
  };
  const setQuestion = (i: number, v: string) => setQuestions(Object.assign([questions[0] ?? "", questions[1] ?? ""], { [i]: v }));

  if (!stage) {
    return (
      <>
        <span className="e-label" style={{ color: "var(--e-primary-dark)" }}>Night before</span>
        <span className="e-h2">Nothing to lock yet.</span>
        <span className="e-meta">Once the application has a stage, you pick an opener, one power story and two questions here.</span>
      </>
    );
  }
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span className="e-label" style={{ color: "var(--e-primary-dark)" }}>{`Night before · ${label}`}</span>
        <span className="e-h2">Lock three things, then change nothing.</span>
        <span className="e-meta">More prep the night before makes delivery worse. Rehearse these out loud and stop.</span>
      </div>
      {stages.length > 1 && (
        <div className="e-field">
          <label htmlFor="nb-stage">Which stage</label>
          <select id="nb-stage" className="e-input" value={stage.id} onChange={(e) => onPick(e.target.value)}>
            {stages.map((x) => (
              <option key={x.id} value={x.id}>{`${x.label || STAGE_LABEL[x.stage]}${x.at ? ` · ${shortDate(x.at)}` : ""}`}</option>
            ))}
          </select>
        </div>
      )}
      {!stage.at && <span className="e-small">This stage has no date yet. Add one and Ensayo marks the night before.</span>}
      <div className="e-soft" style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
        {LOCK}
        <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="e-h3">Your opener</span>
          {open("opener") ? (
            <textarea className="e-input" rows={3} aria-label="Your opener" placeholder="A few short beats, one on each line" value={opener} onChange={(e) => setOpener(e.target.value)} />
          ) : (
            <span className="e-meta" style={{ whiteSpace: "pre-line" }}>{`${lock?.openerPrompt ?? "Tell me about yourself"}: ${opener}`}</span>
          )}
        </div>
        {lock && <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ minHeight: "36px" }} onClick={() => setChange(change === "opener" ? null : "opener")}>{change === "opener" ? "Done" : "Change"}</button>}
      </div>
      <div className="e-soft" style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
        {LOCK}
        <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="e-h3">One power story</span>
          {open("power") ? (
            stories.length === 0 ? (
              <span className="e-meta">You have no stories yet. <Link to="5-2-add-a-story-paste">Add one first</Link>, then pick it here.</span>
            ) : (
              <select className="e-input" aria-label="Power story" value={powerId} onChange={(e) => setPowerId(e.target.value)}>
                <option value="" disabled>Pick one of your stories</option>
                {stories.map((x) => (
                  <option key={x.id} value={x.id}>{x.headline ? `${x.title} · ${x.headline}` : x.title}</option>
                ))}
              </select>
            )
          ) : (
            <span className="e-meta">{powerStory ? (lock && powerStory.id === lock.powerStoryId && lock.powerNumbers ? `${powerStory.title} · ${lock.powerNumbers}` : `${powerStory.title}${powerStory.headline ? ` · ${powerStory.headline}` : ""}`) : "Pick one of your stories"}</span>
          )}
        </div>
        {lock && <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ minHeight: "36px" }} onClick={() => setChange(change === "power" ? null : "power")}>{change === "power" ? "Done" : "Change"}</button>}
      </div>
      <div className="e-soft" style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
        {LOCK}
        <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="e-h3">Two questions to ask</span>
          {open("questions") ? (
            <span style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[0, 1].map((i) => (
                <input key={i} className="e-input" style={{ minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} aria-label={`Question ${i + 1}`} value={questions[i] ?? ""} onChange={(e) => setQuestion(i, e.target.value)} />
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
        {lock && <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ minHeight: "36px" }} onClick={() => setChange(change === "questions" ? null : "questions")}>{change === "questions" ? "Done" : "Change"}</button>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
        {!lock && <button type="button" className="e-btn e-btn-primary" disabled={busy || !opener.trim() || !powerId} onClick={() => void save()}>Lock these three</button>}
        {lock && dirty && <button type="button" className="e-btn e-btn-primary" disabled={busy} onClick={() => void save()}>Save the change</button>}
        {lock && !dirty && (
          <>
            <Link to={link("2-3-start-a-session", { stage: stage.id })} className="e-btn e-btn-primary">{`Rehearse just these · ${lock.rehearseMinutes} min`}</Link>
            <Link to={link("6-7-cue-sheet", { stage: stage.id })} className="e-btn e-btn-white">Open cue sheet</Link>
          </>
        )}
        {lock && <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={busy} onClick={() => void clear()}>Take the lock off</button>}
        {saved && !dirty && !error && <span className="e-small" role="status">Locked. The cue sheet is ready.</span>}
        <ErrorLine error={error} />
      </div>
    </>
  );
}

/** "Delete this application's practice": every session practised for it goes to the trash, with a way back for a week. */
function DeletePractice({ app }: { app: Featured["app"] }) {
  const store = useStore();
  const actions = useActions();
  const reps = useRepHistory();
  const { busy, error, run } = useRun();
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const sessions = store.sessions.filter((s) => s.applicationId === app.id);
  const answers = sessions.reduce((n, s) => n + answersIn(reps, s.id), 0);
  const count = sessions.length;
  if (count === 0 && done === null) return null;
  if (done !== null && count === 0) return <span className="e-small" role="status">{`Deleted ${done} ${done === 1 ? "session" : "sessions"}. ${restoreHint(done)}`}</span>;
  const remove = async () => {
    const out = await run(() => actions.deleteApplicationPractice(app.id));
    if (out) {
      setAsking(false);
      setDone(out.sessions);
    }
  };
  if (!asking) {
    return (
      <div>
        <button type="button" style={linkBtn} onClick={() => setAsking(true)}>{`Delete this application's practice (${count} ${count === 1 ? "session" : "sessions"})`}</button>
        <ErrorLine error={error} />
      </div>
    );
  }
  return (
    <div className="e-soft" role="alertdialog" aria-label="Delete this application's practice" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <span className="e-meta">{deletePracticeText(app.company, count, answers)}</span>
      <span className="e-small">{restoreHint(count)}</span>
      <ErrorLine error={error} />
      <span style={{ display: "flex", gap: "8px" }}>
        <button type="button" className="e-btn e-btn-danger e-btn-sm" disabled={busy} onClick={() => void remove()}>Delete its practice</button>
        <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={busy} onClick={() => setAsking(false)}>Keep it</button>
      </span>
    </div>
  );
}

function StagesTab({ app, extras, now }: Featured) {
  const actions = useActions();
  const link = useAppLink();
  const { busy, error, run, setError } = useRun();
  const stages = [...app.process].sort((a, b) => a.order - b.order);
  const current = nextStage(app);
  const [editing, setEditing] = useState<{ id: string; date: string; time: string } | null>(null);
  const [practiceOpen, setPracticeOpen] = useState<string | null>(null);
  const [editStages, setEditStages] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; label: string; sessions: number } | null>(null);

  // The night before is for the stage the tracker suggests, else the next one.
  const open = stages.filter((s) => !s.done);
  const [nbPick, setNbPick] = useState<string | null>(null);
  const nbStage = stages.find((s) => s.id === nbPick) ?? stages.find((s) => s.id === app.night_before?.stage_id) ?? stages.find((s) => s.id === extras.nightBefore?.stageId) ?? current ?? open[0];
  const lock = nbStage ? (extras.lockedByStage?.[nbStage.id] ?? (extras.nightBefore?.stageId === nbStage.id ? extras.nightBefore : undefined)) : undefined;

  const saveEdit = async () => {
    if (!editing) return;
    const done = await run(() => actions.setStageTime(app.id, editing.id, joinAt(editing.date, editing.time)));
    if (done) setEditing(null);
  };
  const editor = (s: ProcessStage) =>
    editing && editing.id === s.id ? (
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
        <input type="date" className="e-input" style={{ width: "170px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} aria-label={`${s.label} date`} value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
        <input type="time" className="e-input" style={{ width: "130px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} aria-label={`${s.label} time`} value={editing.time} onChange={(e) => setEditing({ ...editing, time: e.target.value })} />
        <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy} onClick={() => void saveEdit()}>Save</button>
        <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setEditing(null)}>Cancel</button>
      </div>
    ) : null;
  const startEdit = (s: ProcessStage) => setEditing({ id: s.id, ...splitAt(s.at) });

  const move = (i: number, d: -1 | 1) => {
    const order = stages.map((s) => s.id);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    void run(() => actions.reorderStages(app.id, order));
  };
  const remove = async (s: ProcessStage, confirm: boolean) => {
    const out = await run(() => actions.removeStage(app.id, s.id, confirm));
    if (!out) return;
    if (out.status === "needs_confirm") setConfirmRemove({ id: s.id, label: s.label || STAGE_LABEL[s.stage], sessions: out.sessions });
    else setConfirmRemove(null);
  };
  const rename = async () => {
    if (!renaming) return;
    const done = await run(() => actions.renameStage(app.id, renaming.id, renaming.label));
    if (done) setRenaming(null);
  };

  /** After the interview: a way to write it down once the stage is done or its date has passed, and the note once it is written. */
  const after = (s: ProcessStage) => {
    const note = noteFor(extras.interviewNotes, s.id);
    if (!note && !interviewHappened(s, now)) return null;
    const to = link("6-11-after-the-interview", { stage: s.id });
    return note ? (
      <span className="e-small" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
        <span>{note.asked.length > 0 ? askedLine(note, s.label || STAGE_LABEL[s.stage]) : "You wrote this one down"}</span>
        <Link to={to} className="e-btn e-btn-ghost e-btn-sm">Edit</Link>
      </span>
    ) : (
      <span><Link to={to} className="e-btn e-btn-line e-btn-sm">After the interview</Link></span>
    );
  };

  /** What can be done to one stage while editing the list. */
  const controls = (s: ProcessStage, i: number) =>
    editStages ? (
      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", paddingTop: "4px" }}>
        <button type="button" style={linkBtn} aria-label={`Move ${s.label} up`} disabled={busy || i === 0} onClick={() => move(i, -1)}>Move up</button>
        <button type="button" style={linkBtn} aria-label={`Move ${s.label} down`} disabled={busy || i === stages.length - 1} onClick={() => move(i, 1)}>Move down</button>
        <button type="button" style={linkBtn} onClick={() => setRenaming({ id: s.id, label: s.label || STAGE_LABEL[s.stage] })}>Rename</button>
        <button type="button" style={linkBtn} disabled={busy} onClick={() => void run(() => actions.setStageDone(app.id, s.id, !s.done))}>{s.done ? "Not done after all" : "Mark done"}</button>
        <button type="button" style={linkBtn} disabled={busy} aria-label={`Remove ${s.label}`} onClick={() => void remove(s, false)}>Remove</button>
      </span>
    ) : null;
  const renamer = (s: ProcessStage) =>
    renaming && renaming.id === s.id ? (
      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
        <input className="e-input" style={{ flex: "1 1 200px", minHeight: "40px", padding: "8px 10px", fontSize: "15px" }} aria-label="Stage name" value={renaming.label} onChange={(e) => setRenaming({ ...renaming, label: e.target.value })} />
        <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy || !renaming.label.trim()} onClick={() => void rename()}>Save</button>
        <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
      </span>
    ) : null;

  return (
    <AppShell nav="applications">
      <AppHeader app={app} now={now} />
      <AppTabs current="stages" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "12px" }}>
            <span className="e-h2">Stages</span>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-pressed={editStages} onClick={() => { setEditStages(!editStages); setRenaming(null); setConfirmRemove(null); setError(""); }}>{editStages ? "Done" : "Edit stages"}</button>
          </div>
          <ErrorLine error={error} />
          {confirmRemove && (
            <div className="e-soft" role="alertdialog" aria-label="Remove a stage with practice" style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px" }}>
              <span className="e-meta">{`${confirmRemove.label} has ${confirmRemove.sessions} practice ${confirmRemove.sessions === 1 ? "session" : "sessions"}. They stay in your history under the old stage name. Take it out anyway?`}</span>
              <span style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy} onClick={() => { const st = stages.find((x) => x.id === confirmRemove.id); if (st) void remove(st, true); }}>Take it out</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setConfirmRemove(null)}>Keep it</button>
              </span>
            </div>
          )}
          {stages.length === 0 && <span className="e-meta">No stages yet. Add the ones you know about with Edit stages.</span>}
          {stages.map((s, i) => {
            const label = s.label || STAGE_LABEL[s.stage];
            const when = s.at;
            const last = i === stages.length - 1;
            const isCurrent = !s.done && current?.id === s.id;
            const border = last ? {} : { borderBottom: "1px solid var(--e-line)" };
            const name = renaming?.id === s.id ? renamer(s) : null;
            if (s.done) {
              return (
                <div key={s.id} style={{ display: "flex", gap: "16px", padding: "16px 0", ...border }}>
                  <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--e-primary)", color: "var(--e-primary-ink)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                  <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {name ?? <span className="e-h3">{label}</span>}
                    <span className="e-small">{s.decides}</span>
                    <span className="e-meta">{`${when ? `${shortDate(when)} · ` : ""}done · ${practiceText(s)}`}</span>
                    {after(s)}
                    {controls(s, i)}
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
                      {name ?? <span className="e-h3">{label}</span>}
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
                    <DrillMock id={s.id} stageId={s.id} />
                    {after(s)}
                    {controls(s, i)}
                  </div>
                </div>
              );
            }
            return (
              <div key={s.id} style={{ display: "flex", gap: "16px", padding: "16px 0", ...border }}>
                <span style={{ width: "28px", height: "28px", borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--e-line)", flex: "none" }} />
                <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {name ?? (
                    <span className="e-h3">
                      {label}
                      {s.stage === "leadership" && app.startup && <span className="e-small" style={{ fontWeight: "400" }}> · founder</span>}
                    </span>
                  )}
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
                      <DrillMock id={s.id} stageId={s.id} />
                    </div>
                  )}
                  {after(s)}
                  {controls(s, i)}
                </div>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-expanded={practiceOpen === s.id} onClick={() => setPracticeOpen(practiceOpen === s.id ? null : s.id)}>Practice</button>
              </div>
            );
          })}
          {editStages && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", paddingTop: "14px" }}>
              <span className="e-small" style={{ width: "100%" }}>Add a stage</span>
              {ALL_STAGES.map((st) => (
                <button key={st} type="button" className="e-chip" disabled={busy} style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px" }} onClick={() => void run(() => actions.addStage(app.id, st))}>{`+ ${STAGE_LABEL[st]}`}</button>
              ))}
            </div>
          )}
        </section>
        <section className="e-card" style={{ flex: "1 1 440px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px", boxShadow: "inset 0 0 0 2px var(--e-primary)" }}>
          <NightBeforeCard key={`${nbStage?.id ?? "none"}|${lock ? "locked" : "open"}`} app={app} stage={nbStage} stages={open} lock={lock} onPick={setNbPick} />
        </section>
      </div>
      <DeletePractice app={app} />
    </AppShell>
  );
}

export default withFeatured(StagesTab);
