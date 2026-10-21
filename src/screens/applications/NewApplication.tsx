import { useRef, useState } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import { useStore } from "../../data/store";
import type { ApplicationStatus, StageId } from "../../data/types";
import { STAGE_LABEL, STATUSES, STATUS_LABEL } from "./format";

type ResumeChoice = "attach" | "other" | "none";
interface StageRow {
  key: number;
  stage: StageId;
  at: string;
}

const dateInput = { width: "130px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" } as const;
const smallBtn = { minHeight: "40px", padding: "8px" } as const;

export default function NewApplication() {
  const store = useStore();
  const draft = store.screens.applications.newApplication;
  const withResume = store.applications.filter((a) => a.resume);

  const [company, setCompany] = useState(draft.company);
  const [role, setRole] = useState(draft.role);
  const [status, setStatus] = useState<string>(draft.status);
  const [appliedOn, setAppliedOn] = useState(draft.appliedOn);
  const [source, setSource] = useState(draft.source);
  const [contact, setContact] = useState(draft.contact);
  const [posting, setPosting] = useState(draft.postingText);
  const [startup, setStartup] = useState(draft.startup);
  const [choice, setChoice] = useState<ResumeChoice>("attach");
  const [fileName, setFileName] = useState(draft.resumeFileName);
  const [filePages, setFilePages] = useState<number | null>(draft.resumePages);
  const [choosing, setChoosing] = useState(false);
  const [otherId, setOtherId] = useState(withResume[0]?.id ?? "");
  const [stages, setStages] = useState<StageRow[]>(draft.stages.map((s, i) => ({ key: i, stage: s.stage, at: s.at })));
  const [nextKey, setNextKey] = useState(draft.stages.length);
  const fileInput = useRef<HTMLInputElement>(null);

  const takeFile = (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    setFilePages(null);
    setChoosing(false);
    setChoice("attach");
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    setStages(next);
  };
  const addStage = (stage: StageId) => {
    setStages([...stages, { key: nextKey, stage, at: "" }]);
    setNextKey(nextKey + 1);
  };
  const otherApp = withResume.find((a) => a.id === otherId);

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
              <input id="ro" className="e-input" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px" }}>
            <div className="e-field">
              <label htmlFor="st">Where it stands</label>
              <select id="st" className="e-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s: ApplicationStatus) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="e-field">
              <label htmlFor="ap">Date applied</label>
              <input id="ap" className="e-input" value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} />
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
            <input id="ct" className="e-input" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div className="e-field">
            <span style={{ fontSize: "14px", fontWeight: "600" }}>The resume you sent</span>
            <input ref={fileInput} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }} onChange={(e) => takeFile(e.target.files?.[0])} aria-label="Choose the resume file" />
            {choice === "attach" && !choosing && (
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
                <span className="e-h3">Drop the PDF or Word file here</span>
                <span className="e-small">Or pick it from your computer.</span>
                <span style={{ display: "flex", gap: "8px" }}>
                  <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => fileInput.current?.click()}>Choose a file</button>
                  <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setChoosing(false)}>Keep {fileName}</button>
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
            <textarea id="jd" className="e-input" rows={5} value={posting} onChange={(e) => setPosting(e.target.value)} />
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
          <span className="e-meta">In the order you'll meet them. Use the arrows to reorder. Add dates as you get them.</span>
          {stages.length === 0 && <span className="e-small" style={{ padding: "12px 0" }}>No stages yet. Add the ones you know about below.</span>}
          {stages.map((s, i) => (
            <div key={s.key} className="e-rowline" style={{ padding: "12px 0" }}>
              <span style={{ display: "flex", flexDirection: "column" }}>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={`Move ${STAGE_LABEL[s.stage]} up`} disabled={i === 0} onClick={() => move(i, -1)} style={{ minHeight: "20px", padding: "0 6px", fontSize: "11px", lineHeight: 1 }}>▲</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={`Move ${STAGE_LABEL[s.stage]} down`} disabled={i === stages.length - 1} onClick={() => move(i, 1)} style={{ minHeight: "20px", padding: "0 6px", fontSize: "11px", lineHeight: 1 }}>▼</button>
              </span>
              <span style={{ flex: "1", fontWeight: "600" }}>{STAGE_LABEL[s.stage]}</span>
              <input className="e-input" style={dateInput} value={s.at} placeholder="Date" aria-label={`${STAGE_LABEL[s.stage]} date`} onChange={(e) => setStages(stages.map((x) => (x.key === s.key ? { ...x, at: e.target.value } : x)))} />
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
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
        <Link to="6-1-applications" className="e-btn e-btn-ghost">Cancel</Link>
        <button type="button" className="e-btn e-btn-primary e-btn-big" onClick={() => go("6-3-application-overview")}>Save and read both</button>
      </div>
    </AppShell>
  );
}
