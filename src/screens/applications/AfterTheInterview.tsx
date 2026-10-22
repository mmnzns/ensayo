import { useEffect, useState } from "react";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import { useActions } from "../../data/real";
import { useHashParam } from "../../data/selection";
import { RATING_LABELS, noteFor, splitAsked } from "../../data/interviews";
import type { InterviewNote } from "../../data/screens/applications";
import { STAGE_LABEL, shortDate } from "./format";
import { defaultStage, draftOf, inputOf, isBlank, type Draft } from "./afterInterview";
import { ErrorLine, useAppLink, useRun, withFeatured, type Featured } from "./parts";

interface FormProps {
  company: string;
  stageLabel: string;
  stageDate: string;
  note: InterviewNote | undefined;
  draft: Draft;
  onChange: (next: Draft) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  busy: boolean;
  error: string;
  /** The note was just saved. */
  saved: boolean;
  confirmDelete: boolean;
  backTo: string;
}

/** The sheet itself: no data access, so every state can be shown. */
export function InterviewForm({ company, stageLabel, stageDate, note, draft, onChange, onSave, onDelete, onClose, busy, error, saved, confirmDelete, backTo }: FormProps) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  const askedCount = splitAsked(draft.asked).length;
  const empty = !note && !draft.asked.trim() && !draft.worked.trim() && !draft.differently.trim() && !draft.spokeTo.trim() && !draft.nextStep.trim() && draft.rating === null;
  return (
    <FocusShell>
      <div className="e-wrap" style={{ gap: "24px", width: "100%", maxWidth: "720px", margin: "0 auto" }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <Link to={backTo} className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }}>{`‹ ${company}`}</Link>
          <span className="e-meta">{`${stageLabel}${stageDate ? ` · ${stageDate}` : ""}`}</span>
        </header>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span className="e-label" style={{ color: "var(--e-primary-dark)" }}>After the interview</span>
          <h1 className="e-h1" style={{ margin: "0" }}>{`How did the ${stageLabel.toLowerCase()} go?`}</h1>
          <span className="e-meta">Write it down while you remember it. These are your words, and Ensayo never changes them. The next stage's practice starts from the questions you were asked.</span>
          {empty && <span className="e-small">Nothing written for this stage yet.</span>}
        </div>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <fieldset style={{ border: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "8px" }}>
            <legend className="e-h3" style={{ padding: "0", marginBottom: "8px" }}>How it went</legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }} role="radiogroup" aria-label="How it went">
              {RATING_LABELS.map((r) => (
                <button key={r.value} type="button" role="radio" aria-checked={draft.rating === r.value} className={draft.rating === r.value ? "e-chip e-chip-on" : "e-chip"} onClick={() => set("rating", draft.rating === r.value ? null : r.value)}>
                  {`${r.value} · ${r.label}`}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="e-field">
            <label htmlFor="ai-asked">What did they ask?</label>
            <textarea id="ai-asked" className="e-input" rows={6} placeholder="One question per line. Rough wording is fine." value={draft.asked} onChange={(e) => set("asked", e.target.value)} />
            <span className="e-small">{askedCount === 0 ? "No questions noted. You can add them later from the Stages tab." : `${askedCount} ${askedCount === 1 ? "question" : "questions"}. They go into this application's questions, marked as asked.`}</span>
          </div>
          <div className="e-field">
            <label htmlFor="ai-worked">What you said that worked</label>
            <textarea id="ai-worked" className="e-input" rows={3} value={draft.worked} onChange={(e) => set("worked", e.target.value)} />
          </div>
          <div className="e-field">
            <label htmlFor="ai-diff">What you'd change</label>
            <textarea id="ai-diff" className="e-input" rows={3} value={draft.differently} onChange={(e) => set("differently", e.target.value)} />
          </div>
          <div className="e-field">
            <label htmlFor="ai-who">Who you spoke to</label>
            <input id="ai-who" className="e-input" value={draft.spokeTo} onChange={(e) => set("spokeTo", e.target.value)} />
          </div>
          <div className="e-field">
            <label htmlFor="ai-next">Next step</label>
            <input id="ai-next" className="e-input" placeholder="For example: hiring manager call next week" value={draft.nextStep} onChange={(e) => set("nextStep", e.target.value)} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
            <button type="button" className="e-btn e-btn-primary" disabled={busy} onClick={onSave}>Save</button>
            <button type="button" className="e-btn e-btn-ghost" onClick={onClose}>{saved ? "Back to stages" : "Close without saving"}</button>
            {note && !confirmDelete && <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={busy} onClick={onDelete}>Delete this note</button>}
            {saved && !error && <span className="e-small" role="status">Saved. The stage is marked done.</span>}
            {note && !saved && !error && <span className="e-small">{`Saved ${shortDate(note.edited)}`}</span>}
            <ErrorLine error={error} />
          </div>
          {confirmDelete && (
            <div className="e-soft" role="alertdialog" aria-label="Delete this note" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span className="e-meta">Delete what you wrote for this stage? The questions already in this application's questions stay there. Remove them from the Questions tab if you don't want them.</span>
              <span style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy} onClick={onDelete}>Delete the note</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={onClose}>Keep it</button>
              </span>
            </div>
          )}
        </section>
      </div>
    </FocusShell>
  );
}

function After({ app, extras, now }: Featured) {
  const actions = useActions();
  const link = useAppLink();
  const named = useHashParam("stage");
  const stages = [...app.process].sort((a, b) => a.order - b.order);
  const stage = stages.find((s) => s.id === named) ?? defaultStage(app, extras.interviewNotes, now);
  const note = stage ? noteFor(extras.interviewNotes, stage.id) : undefined;
  const [draft, setDraft] = useState<Draft>(() => draftOf(note));
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, error, run } = useRun();
  const stageId = stage?.id;
  const back = link("6-6-application-stages-and-night-before");
  const close = () => go(back);

  // A different stage is a different note.
  useEffect(() => {
    setDraft(draftOf(stageId ? noteFor(extras.interviewNotes, stageId) : undefined));
    setSaved(false);
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId]);
  // Esc closes without saving.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") go(back);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  if (!stage) {
    return (
      <FocusShell>
        <div className="e-wrap" style={{ gap: "16px", maxWidth: "720px", margin: "0 auto" }}>
          <Link to={back} className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }}>{`‹ ${app.company}`}</Link>
          <span className="e-h2">No stage to write about yet</span>
          <span className="e-meta">Add the stages of this application first, then write down what happened after each interview.</span>
        </div>
      </FocusShell>
    );
  }
  const save = async () => {
    if (isBlank(draft) && !note) {
      setSaved(false);
      return close();
    }
    const done = await run(() => actions.saveInterviewNote(app.id, inputOf(stage.id, draft)));
    if (done) setSaved(true);
  };
  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    const done = await run(() => actions.deleteInterviewNote(app.id, stage.id));
    if (done) {
      setDraft(draftOf(undefined));
      setConfirmDelete(false);
      setSaved(false);
    }
  };
  return (
    <InterviewForm
      company={app.company}
      stageLabel={stage.label || STAGE_LABEL[stage.stage]}
      stageDate={shortDate(stage.at)}
      note={note}
      draft={draft}
      onChange={(d) => { setDraft(d); setSaved(false); }}
      onSave={() => void save()}
      onDelete={() => void remove()}
      onClose={close}
      busy={busy}
      error={error}
      saved={saved}
      confirmDelete={confirmDelete}
      backTo={back}
    />
  );
}

export default withFeatured(After);
