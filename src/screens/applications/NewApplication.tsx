import { useRef, useState } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import { plainError } from "../../data/actions";
import type { AppBundle, JdOutcome, ResumeOutcome } from "../../data/applicationCommands";
import { isApp, useActions } from "../../data/real";
import { withParams } from "../../data/selection";
import { useStore } from "../../data/store";
import type { ApplicationStatus, StageId } from "../../data/types";
import { STAGE_LABEL, STATUSES, STATUS_LABEL } from "./format";
import { bytesOf, contactFromText, isResumeFile, joinAt, moveItem, splitAt } from "./forms";
import { ErrorLine, Notice, useRun } from "./parts";
import FitBanner from "./FitBanner";
import TargetPicker from "./TargetPicker";
import { PICKER_HINT, stagesFor, stagesLine, suggestTarget } from "./targetPick";

type ResumeChoice = "attach" | "other" | "none";
interface StageRow {
  key: number;
  stage: StageId;
  date: string;
  time: string;
}

/** What happened after Save: the application that was made and how far reading both got. */
interface Saved {
  id: string;
  company: string;
  analysis: JdOutcome | null;
  resume: ResumeOutcome | null;
  /** Things that did not go through, in plain words. */
  notes: string[];
}

const dateInput = { width: "150px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" } as const;
const timeInput = { width: "110px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" } as const;
const smallBtn = { minHeight: "40px", padding: "8px" } as const;

export default function NewApplication() {
  const store = useStore();
  const actions = useActions();
  const draft = store.screens.applications.newApplication;
  const withResume = store.applications.filter((a) => a.resume);
  const liveTargets = store.targets.filter((t) => !t.archived);
  const activeId = store.activeTarget?.id ?? store.you?.activeTargetId ?? liveTargets[0]?.id;
  const targetFor = (id: string) => liveTargets.find((t) => t.id === id);

  const [company, setCompany] = useState(draft.company);
  const [role, setRole] = useState(draft.role);
  const [status, setStatus] = useState<string>(draft.status);
  const [appliedOn, setAppliedOn] = useState(splitAt(draft.appliedOn).date);
  const [source, setSource] = useState(draft.source);
  const [contact, setContact] = useState(draft.contact);
  const [posting, setPosting] = useState(draft.postingText);
  const [startup, setStartup] = useState(draft.startup);
  const [choice, setChoice] = useState<ResumeChoice>("attach");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState(draft.resumeFileName);
  const [filePages, setFilePages] = useState<number | null>(draft.resumePages || null);
  const [choosing, setChoosing] = useState(!draft.resumeFileName);
  const [otherId, setOtherId] = useState(withResume[0]?.id ?? "");
  // The target starts as the active one, or the one the role typed points to; the person's own pick is never overridden.
  const [targetId, setTargetId] = useState(() => suggestTarget(draft.role, draft.postingText, store.targets, activeId) ?? activeId ?? "");
  const [targetTouched, setTargetTouched] = useState(false);
  const [stagesTouched, setStagesTouched] = useState(draft.stages.length > 0);
  const firstRows: StageRow[] = (draft.stages.length ? draft.stages : stagesFor(targetFor(targetId)).map((stage) => ({ stage, at: "" }))).map((s, i) => ({ key: i, stage: s.stage, ...splitAt(s.at) }));
  const [stages, setStages] = useState<StageRow[]>(firstRows);
  const [nextKey, setNextKey] = useState(firstRows.length);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [paste, setPaste] = useState("");
  const [fileError, setFileError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const { busy, error, run, setError } = useRun();
  const pasting = useRun();

  /** The stages follow the target until the person changes the list themselves. */
  const seedStages = (id: string) => {
    if (stagesTouched) return;
    const rows = stagesFor(targetFor(id)).map((stage, i) => ({ key: nextKey + i, stage, date: "", time: "" }));
    setStages(rows);
    setNextKey(nextKey + rows.length);
  };
  const pickTarget = (id: string) => {
    setTargetId(id);
    setTargetTouched(true);
    seedStages(id);
  };
  const suggest = (role: string, posting: string) => {
    if (targetTouched) return;
    const id = suggestTarget(role, posting, store.targets, activeId);
    if (id && id !== targetId) {
      setTargetId(id);
      seedStages(id);
    }
  };

  const takeFile = (f: File | undefined) => {
    if (!f) return;
    if (!isResumeFile(f.name)) {
      setFileError("Ensayo reads PDF and Word files. Choose one of those, or paste the text of your resume after you save.");
      return;
    }
    setFileError("");
    setFile(f);
    setFileName(f.name);
    setFilePages(null);
    setChoosing(false);
    setChoice("attach");
  };

  const move = (i: number, d: -1 | 1) => {
    setStagesTouched(true);
    setStages(moveItem(stages, i, d));
  };
  const addStage = (stage: StageId) => {
    setStagesTouched(true);
    setStages([...stages, { key: nextKey, stage, date: "", time: "" }]);
    setNextKey(nextKey + 1);
  };
  const setStageAt = (key: number, patch: Partial<StageRow>) => {
    setStagesTouched(true);
    setStages(stages.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  };
  const otherApp = withResume.find((a) => a.id === otherId);

  // Save the application, read the posting, then the resume. Each step that fails is said in plain words and the
  // ones after it still run, so a missing engine or an unreadable file never loses what was typed.
  const save = () =>
    run(async () => {
      if (!company.trim()) throw new Error("Write the company name first.");
      const bundle: AppBundle = await actions.createApplication(
        {
          company,
          role,
          status: status as ApplicationStatus,
          applied_on: appliedOn || undefined,
          source,
          contacts: contactFromText(contact),
          startup,
          stages: stages.map((s) => ({ stage: s.stage, ...(joinAt(s.date, s.time) ? { at: joinAt(s.date, s.time) as string } : {}) })),
          ...(targetId ? { targetId } : {}),
        },
        posting,
      );
      const id = bundle.application.id;
      const result: Saved = { id, company: bundle.application.company, analysis: null, resume: null, notes: [] };
      if (posting.trim()) {
        try {
          result.analysis = await actions.analyseJd(id);
        } catch (e) {
          result.notes.push(`The posting is saved, but it wasn't read: ${plainError(e)}`);
        }
      }
      try {
        if (choice === "attach" && file) result.resume = await actions.attachResumeBytes(id, file.name, await bytesOf(file), false, true);
        else if (choice === "other" && otherId) result.resume = await actions.useResumeFrom(id, otherId, false, true);
        else if (choice === "none") result.resume = await actions.setNoResume(id, false);
      } catch (e) {
        result.notes.push(`The resume wasn't attached: ${plainError(e)} You can attach it from the application page.`);
      }
      setSaved(result);
    });

  const pasteText = () =>
    pasting.run(async () => {
      if (!saved) return;
      const out = await actions.pasteResumeText(saved.id, paste, false, true);
      setSaved({ ...saved, resume: out });
      setPaste("");
    });

  const reset = () => {
    setSaved(null);
    setCompany("");
    setRole("");
    setSource("");
    setContact("");
    setPosting("");
    setStartup(false);
    setFile(null);
    setFileName("");
    setFilePages(null);
    setChoosing(true);
    setChoice("attach");
    const fresh = suggestTarget("", "", store.targets, activeId) ?? activeId ?? "";
    setTargetId(fresh);
    setTargetTouched(false);
    setStagesTouched(false);
    const rows = stagesFor(targetFor(fresh)).map((stage, i) => ({ key: nextKey + i, stage, date: "", time: "" }));
    setStages(rows);
    setNextKey(nextKey + rows.length);
    setError("");
  };

  if (saved) {
    const made = store.applications.find((a) => a.id === saved.id);
    const reading = made?.analysis;
    const resumeInfo = made?.resume;
    const needsPaste = !!resumeInfo?.needs_paste;
    return (
      <AppShell nav="applications">
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <Link to="6-1-applications" className="e-small" style={{ textDecoration: "none" }}>‹ Applications</Link>
          <h1 className="e-h1">{`${saved.company} is saved`}</h1>
        </div>
        {made && <FitBanner app={made} />}
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <span className="e-h2">What Ensayo read</span>
          {saved.analysis ? (
            <>
              {saved.analysis.result.notice && <Notice>{saved.analysis.result.notice}</Notice>}
              {reading ? (
                <>
                  <span>{reading.summary}</span>
                  {reading.priorities.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {reading.priorities.map((p, i) => (
                        <li key={i}>{p.title}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <span className="e-meta">Nothing came out of the posting yet.</span>
              )}
              <span className="e-small">
                {saved.analysis.result.question_count > 0 ? `${saved.analysis.result.question_count} practice questions are ready for the stages.` : "No questions were made yet."}
                {saved.analysis.result.startup_turned_on ? " The posting reads like a startup, so the leadership stage includes the questions founders ask." : ""}
              </span>
            </>
          ) : (
            <span className="e-meta">{posting.trim() ? "The posting is saved. Open the application to read it again." : "No posting yet. Paste it on the application page when you have it, and Ensayo reads it then."}</span>
          )}
          <span className="e-h3">The resume</span>
          {choice === "none" && <span className="e-meta">Marked as no resume sent.</span>}
          {saved.resume?.attach?.status === "attached" && <span className="e-meta">{`${resumeInfo?.fileName || fileName} is attached.`}</span>}
          {saved.resume?.read && (
            <>
              {saved.resume.read.notice && <Notice>{saved.resume.read.notice}</Notice>}
              {saved.resume.read.status === "read" && <span className="e-meta">{`Read it: ${saved.resume.read.claims} lines picked out to check your answers against.`}</span>}
            </>
          )}
          {needsPaste && (
            <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span className="e-meta">{saved.resume?.attach?.message ?? "Ensayo couldn't read the text in this file. Paste the text of your resume instead. The file stays as the record of what you sent."}</span>
              <textarea className="e-input" rows={6} aria-label="Your resume text" placeholder="Paste the text of your resume here" value={paste} onChange={(e) => setPaste(e.target.value)} />
              <span style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={!paste.trim() || pasting.busy} onClick={() => void pasteText()}>Use this text</button>
                <ErrorLine error={pasting.error} />
              </span>
            </div>
          )}
          {!saved.resume && choice !== "none" && <span className="e-meta">No resume attached yet. You can add it from the application page.</span>}
          {saved.notes.map((n, i) => (
            <Notice key={i}>{n}</Notice>
          ))}
        </section>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button type="button" className="e-btn e-btn-ghost" onClick={reset}>Add another</button>
          <button type="button" className="e-btn e-btn-primary e-btn-big" onClick={() => go(withParams("6-3-application-overview", { app: saved.id }))}>{`Open ${saved.company}`}</button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell nav="applications">
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Link to="6-1-applications" className="e-small" style={{ textDecoration: "none" }}>‹ Applications</Link>
        <h1 className="e-h1">New application</h1>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
            <div className="e-field">
              <label htmlFor="co">Company</label>
              <input id="co" className="e-input" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div className="e-field">
              <label htmlFor="ro">Role</label>
              <input id="ro" className="e-input" value={role} onChange={(e) => { setRole(e.target.value); suggest(e.target.value, posting); }} />
            </div>
          </div>
          {liveTargets.length > 0 && (
            <div className="e-field">
              <span style={{ fontSize: "14px", fontWeight: "600" }}>Target</span>
              <TargetPicker targets={store.targets} activeId={activeId} value={targetId} onChange={pickTarget} />
              <span className="e-small">{PICKER_HINT}</span>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px" }}>
            <div className="e-field">
              <label htmlFor="st">Where it stands</label>
              <select id="st" className="e-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.filter((s) => s !== "closed").map((s: ApplicationStatus) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="e-field">
              <label htmlFor="ap">Date applied</label>
              <input id="ap" type="date" className="e-input" value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} />
            </div>
            <div className="e-field">
              <label htmlFor="sr">Found it on</label>
              <input id="sr" className="e-input" value={source} onChange={(e) => setSource(e.target.value)} />
            </div>
          </div>
          <div className="e-field">
            <label htmlFor="ct">
              Contact <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>· optional</span>
            </label>
            <input id="ct" className="e-input" placeholder="Priya, recruiter" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div className="e-field">
            <span style={{ fontSize: "14px", fontWeight: "600" }}>The resume you sent</span>
            <ErrorLine error={fileError} />
            <input ref={fileInput} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }} onChange={(e) => takeFile(e.target.files?.[0])} aria-label="Choose the resume file" />
            {choice === "attach" && !choosing && fileName && (
              <div className="e-soft" style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--e-surface)", boxShadow: "inset 0 0 0 1.5px var(--e-primary)" }}>
                <span style={{ width: "44px", height: "52px", borderRadius: "8px", background: "var(--e-tint)", color: "var(--e-primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: "11px", fontWeight: "700" }}>
                  {fileName.toLowerCase().endsWith(".pdf") ? "PDF" : "DOC"}
                </span>
                <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontWeight: "600" }}>{fileName}</span>
                  <span className="e-small">{filePages ? `${filePages} pages · ` : ""}read on this computer after you save</span>
                </span>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setChoosing(true)}>Replace</button>
              </div>
            )}
            {choice === "attach" && choosing && (
              <div
                className="e-soft"
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", background: "var(--e-surface)", boxShadow: "inset 0 0 0 1.5px var(--e-line)", textAlign: "center" }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  takeFile(e.dataTransfer.files?.[0]);
                }}
              >
                <span className="e-h3">{isApp() ? "Choose the PDF or Word file" : "Drop the PDF or Word file here"}</span>
                <span className="e-small">{isApp() ? "Pick it from your computer." : "Or pick it from your computer."}</span>
                <span style={{ display: "flex", gap: "8px" }}>
                  <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => fileInput.current?.click()}>Choose a file</button>
                  {fileName && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setChoosing(false)}>Keep {fileName}</button>}
                </span>
              </div>
            )}
            {choice === "other" && (
              <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "10px", background: "var(--e-surface)", boxShadow: "inset 0 0 0 1.5px var(--e-primary)" }}>
                {withResume.length === 0 ? (
                  <span className="e-meta">None of your other applications has a resume yet.</span>
                ) : (
                  <>
                    <label htmlFor="other-resume" className="e-small">Use the resume from</label>
                    <select id="other-resume" className="e-input" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                      {withResume.map((a) => (
                        <option key={a.id} value={a.id}>{`${a.company} · ${a.resume?.fileName}`}</option>
                      ))}
                    </select>
                    <span className="e-small">{otherApp ? `Ensayo will read ${otherApp.resume?.fileName} again for this application.` : ""}</span>
                  </>
                )}
              </div>
            )}
            {choice === "none" && (
              <div className="e-soft" style={{ background: "var(--e-surface)", boxShadow: "inset 0 0 0 1.5px var(--e-line)" }}>
                <span className="e-meta">No resume for this one. You can attach it later from the application page.</span>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
              {choice !== "attach" && (
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }} onClick={() => { setChoice("attach"); setChoosing(true); }}>Attach a file</button>
              )}
              {choice !== "other" && (
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: choice === "attach" ? "0" : undefined }} onClick={() => { setChoice("other"); setChoosing(false); }}>Use one from another application</button>
              )}
              {choice !== "none" && (
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => { setChoice("none"); setChoosing(false); }}>I didn't send one</button>
              )}
            </div>
            <span className="e-small">Attach the exact file you submitted. Ensayo reads it so your answers match what they saw. It never edits it.</span>
          </div>
          <div className="e-field">
            <label htmlFor="jd">
              Job posting <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>· can wait until they call</span>
            </label>
            <textarea id="jd" className="e-input" rows={5} value={posting} onChange={(e) => { setPosting(e.target.value); suggest(role, e.target.value); }} />
            <span className="e-small">Paste the whole thing. It stays on this computer except for the summary your AI engine reads.</span>
          </div>
          <label className="e-soft" style={{ display: "flex", alignItems: "flex-start", gap: "14px", cursor: "pointer" }}>
            <input type="checkbox" className="e-check" checked={startup} onChange={(e) => setStartup(e.target.checked)} style={{ marginTop: "2px" }} />
            <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h3">Startup or founder-led</span>
              <span className="e-meta">The leadership stage adds the questions founders ask: are you all in, and will you run it yourself or just build it.</span>
            </span>
          </label>
        </section>
        <section className="e-card" style={{ flex: "1 1 340px", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span className="e-h3">Their interview stages</span>
          <span className="e-meta">{stagesLine(targetFor(targetId), draft.stages.length > 0)}</span>
          {stages.length === 0 && <span className="e-small" style={{ padding: "12px 0" }}>No stages yet. Add the ones you know about below.</span>}
          {stages.map((s, i) => (
            <div key={s.key} className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ display: "flex", flexDirection: "column" }}>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={`Move ${STAGE_LABEL[s.stage]} up`} disabled={i === 0} onClick={() => move(i, -1)} style={{ minHeight: "20px", padding: "0 6px", fontSize: "11px", lineHeight: 1 }}>▲</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={`Move ${STAGE_LABEL[s.stage]} down`} disabled={i === stages.length - 1} onClick={() => move(i, 1)} style={{ minHeight: "20px", padding: "0 6px", fontSize: "11px", lineHeight: 1 }}>▼</button>
              </span>
              <span style={{ flex: "1", fontWeight: "600" }}>{STAGE_LABEL[s.stage]}</span>
              <input type="date" className="e-input" style={dateInput} value={s.date} aria-label={`${STAGE_LABEL[s.stage]} date`} onChange={(e) => setStageAt(s.key, { date: e.target.value })} />
              <input type="time" className="e-input" style={timeInput} value={s.time} aria-label={`${STAGE_LABEL[s.stage]} time`} onChange={(e) => setStageAt(s.key, { time: e.target.value })} />
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={`Remove ${STAGE_LABEL[s.stage]}`} style={smallBtn} onClick={() => setStages(stages.filter((x) => x.key !== s.key))}>✕</button>
            </div>
          ))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", paddingTop: "6px" }}>
            <span className="e-small" style={{ width: "100%" }}>Add a stage</span>
            {(["technical", "panel", "hiring_manager"] as StageId[]).map((s) => (
              <button key={s} type="button" className="e-chip" style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px" }} onClick={() => addStage(s)}>{`+ ${STAGE_LABEL[s]}`}</button>
            ))}
          </div>
        </section>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: "12px" }}>
        <ErrorLine error={error} />
        <Link to="6-1-applications" className="e-btn e-btn-ghost">Cancel</Link>
        <button type="button" className="e-btn e-btn-primary e-btn-big" disabled={busy} onClick={() => void save()}>{busy ? "Saving and reading" : "Save and read both"}</button>
      </div>
    </AppShell>
  );
}
