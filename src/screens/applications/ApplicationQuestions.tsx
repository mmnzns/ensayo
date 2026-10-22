import { useState } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { useActions } from "../../data/real";
import { useStore } from "../../data/store";
import type { QuestionType } from "../../data/screens/applications";
import { STAGE_LABEL, nextStage } from "./format";
import { AppHeader, AppTabs, ErrorLine, useAppLink, useRun, withFeatured, type Featured } from "./parts";

function Questions({ app, extras, now }: Featured) {
  const { questionTypes } = useStore().screens.applications;
  const actions = useActions();
  const link = useAppLink();
  const { busy, error, run, setError } = useRun();
  const stages = [...app.process].sort((a, b) => a.order - b.order);
  const [stageId, setStageId] = useState<string>(nextStage(app)?.id ?? stages[0]?.id ?? "");
  const questions = extras.questions;
  const [editing, setEditing] = useState<{ id: string; text: string; type: QuestionType } | null>(null);
  const [draft, setDraft] = useState("");
  const [draftType, setDraftType] = useState<QuestionType>(questionTypes[0]?.id ?? "behavioral");

  const stage = stages.find((s) => s.id === stageId);
  const list = questions.filter((q) => q.stageId === stageId);
  const typeLabel = (t: QuestionType) => questionTypes.find((x) => x.id === t)?.label ?? t;
  const add = async () => {
    const text = draft.trim();
    if (!text || !stageId) return;
    const done = await run(() => actions.saveQuestion(app.id, { stage_id: stageId, text, kind: draftType }));
    if (done) setDraft("");
  };
  const saveEdit = async () => {
    if (!editing) return;
    const done = await run(() => actions.saveQuestion(app.id, { id: editing.id, stage_id: stageId, text: editing.text, kind: editing.type }));
    if (done) setEditing(null);
  };

  return (
    <AppShell nav="applications">
      <AppHeader app={app} now={now} />
      <AppTabs current="questions" />
      <p className="e-meta" style={{ margin: "0" }}>{`The questions Ensayo will ask for each ${app.company} stage, made from the posting and your resume. Change any of them, add your own, or take out the ones that won't come up.`}</p>
      {stages.length === 0 ? (
        <section className="e-card">
          <span className="e-meta">No stages yet. Add them from Edit details and the questions show up here.</span>
        </section>
      ) : (
        <>
          <nav style={{ display: "flex", flexWrap: "wrap", gap: "8px" }} aria-label="Stage">
            {stages.map((s) => {
              const n = questions.filter((q) => q.stageId === s.id).length;
              return (
                <button key={s.id} type="button" className={s.id === stageId ? "e-chip e-chip-on" : "e-chip"} aria-pressed={s.id === stageId} onClick={() => { setStageId(s.id); setEditing(null); setError(""); }}>
                  {`${s.label || STAGE_LABEL[s.stage]} · ${n}`}
                </button>
              );
            })}
          </nav>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 320px" }}>
                <span className="e-h2">{stage ? stage.label || STAGE_LABEL[stage.stage] : ""}</span>
                <span className="e-meta">{stage?.decides}</span>
              </div>
              <Link to={link("2-3-start-a-session", { stage: stageId })} className="e-btn e-btn-primary e-btn-sm">Practice this stage</Link>
            </div>
            <ErrorLine error={error} />
            {list.length === 0 && <span className="e-meta" style={{ padding: "14px 0" }}>No questions for this stage yet. Add one below.</span>}
            {list.map((q, i) => {
              const isEditing = editing?.id === q.id;
              return (
                <div key={q.id} className="e-rowline" style={{ padding: "16px 0", alignItems: "flex-start" }}>
                  <span className="e-h3" style={{ width: "28px", color: "var(--e-muted)" }}>{i + 1}</span>
                  <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                    {isEditing ? (
                      <>
                        <textarea className="e-input" rows={2} aria-label={`Question ${i + 1}`} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                        <select className="e-input" style={{ minHeight: "40px", padding: "8px 10px", fontSize: "14px", maxWidth: "260px" }} aria-label={`Type of question ${i + 1}`} value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as QuestionType })}>
                          {questionTypes.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: "16px", lineHeight: 1.5 }}>{q.text}</span>
                        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                          <span className="e-pill" style={{ background: "var(--e-ground)" }} title={questionTypes.find((t) => t.id === q.type)?.hint}>{typeLabel(q.type)}</span>
                          {q.editedByUser && <span className="e-small" style={{ color: "var(--e-primary-dark)" }}>Edited by you</span>}
                        </span>
                        {q.why && <span className="e-small">{q.why}</span>}
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <>
                      <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy || !editing.text.trim()} onClick={() => void saveEdit()}>Save</button>
                      <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => { setEditing(null); setError(""); }}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setEditing({ id: q.id, text: q.text, type: q.type })}>Edit</button>
                  )}
                  <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={busy} aria-label={`Remove question ${i + 1}`} onClick={() => void run(() => actions.deleteQuestion(app.id, q.id))}>Remove</button>
                </div>
              );
            })}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "14px" }}>
              <label htmlFor="new-q" className="e-small">Add a question</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <input id="new-q" className="e-input" style={{ flex: "1 1 320px" }} placeholder="Type a question they might ask" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
                <select className="e-input" style={{ width: "220px" }} aria-label="Type of the new question" value={draftType} onChange={(e) => setDraftType(e.target.value as QuestionType)}>
                  {questionTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <button type="button" className="e-btn e-btn-line" disabled={busy || !draft.trim()} onClick={() => void add()}>Add question</button>
              </div>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

export default withFeatured(Questions);
