import { useRef, useState } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import type { ResumeOutcome } from "../../data/applicationCommands";
import { isApp, useActions } from "../../data/real";
import { useStore } from "../../data/store";
import { MATCH_LABEL, shortDate } from "./format";
import { pickResumePath } from "../../ui/pickFile";
import { fileNameOf } from "../settings/targetForms";
import { bytesOf, isResumeFile, outcomeNotices } from "./forms";
import { AppHeader, AppTabs, ErrorLine, MatchChip, Notice, useRun, withFeatured, type Featured } from "./parts";
import Working from "./Working";

/** What a line on the resume is about, in the words a person uses, and the backend's name for it. */
const LINE_KINDS = [
  { id: "proof_number", label: "A number" },
  { id: "role_title", label: "A job title" },
  { id: "tenure", label: "Dates in a job" },
] as const;

/** A question waiting for a yes: the screen asks, and the yes runs the same command again with `confirm` true. */
interface Confirm {
  text: string;
  yes: string;
  go: () => Promise<void>;
}

function ResumeTab({ app, now }: Featured) {
  const store = useStore();
  const actions = useActions();
  const resume = app.resume;
  const others = store.applications.filter((a) => a.id !== app.id && a.resume);
  const fileRun = useRun();
  const lineRun = useRun();
  const sugRun = useRun();
  const [chooser, setChooser] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [otherId, setOtherId] = useState(others[0]?.id ?? "");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [paste, setPaste] = useState("");
  const [fileError, setFileError] = useState("");
  const [opened, setOpened] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [adding, setAdding] = useState<{ kind: string; subject: string; value: string } | null>(null);
  // True while the resume is being read (Read it, Read it again, pasted text), so the bar and clock show.
  const [reading, setReading] = useState(false);
  const [which, setWhich] = useState<Record<string, { open: boolean; pick?: "resume" | "story" }>>({});

  const attached = !!resume;
  const claims = resume?.claims ?? [];
  const mustSay = resume?.mustSay ?? [];
  const suggestions = resume?.suggestions ?? [];
  const unread = resume?.status === "attached";
  const needsPaste = !!resume?.needs_paste;

  /** Runs a resume command. When it says a resume is already there (or lines would go), asks first and runs it again
   *  with the yes. Otherwise says what happened in plain words. `reads` shows the bar and clock while it runs, the
   *  second run after a yes included. */
  const attempt = async (send: (yes: boolean) => Promise<ResumeOutcome>, ask: { text: string; yes: string }, after?: (out: ResumeOutcome) => void, reads = false) => {
    const go = async (yes: boolean): Promise<void> => {
      if (reads) setReading(true);
      let out: ResumeOutcome | undefined;
      try {
        out = await fileRun.run(() => send(yes));
      } finally {
        if (reads) setReading(false);
      }
      if (!out) return;
      if (out.attach?.status === "needs_confirm" && !yes) {
        setConfirm({ ...ask, go: () => go(true) });
        return;
      }
      setConfirm(null);
      setChooser(false);
      setShowOther(false);
      setNotices(outcomeNotices(out));
      after?.(out);
    };
    await go(false);
  };

  const takeFile = async (f: File | undefined) => {
    if (!f) return;
    if (!isResumeFile(f.name)) {
      setFileError("Ensayo reads PDF and Word files. Choose one of those.");
      return;
    }
    setFileError("");
    const bytes = await bytesOf(f);
    await attempt((yes) => actions.attachResumeBytes(app.id, f.name, bytes, yes, false), {
      text: `${app.company} already has a resume attached. Replace it with ${f.name}? The lines read from the old one are replaced. Lines you fixed yourself stay.`,
      yes: "Replace it",
    });
  };
  /** In the app the system picker gives a path, and the backend reads the file itself. */
  const chooseFile = async () => {
    if (!isApp()) return fileInput.current?.click();
    const path = await pickResumePath();
    if (!path) return;
    const name = fileNameOf(path);
    if (!isResumeFile(name)) return setFileError("Ensayo reads PDF and Word files. Choose one of those.");
    setFileError("");
    await attempt((yes) => actions.attachResume(app.id, path, yes, false), {
      text: `${app.company} already has a resume attached. Replace it with ${name}? The lines read from the old one are replaced. Lines you fixed yourself stay.`,
      yes: "Replace it",
    });
  };
  const readIt = async () => {
    setReading(true);
    try {
      const out = await fileRun.run(() => actions.readResume(app.id));
      if (out) setNotices(outcomeNotices(out));
    } finally {
      setReading(false);
    }
  };
  const pasteIt = () =>
    attempt(
      (yes) => actions.pasteResumeText(app.id, paste, yes, true),
      { text: `${app.company} already has a resume attached. Use this text in its place?`, yes: "Use this text" },
      (out) => {
        if (out.attach?.status === "attached") setPaste("");
      },
      true,
    );
  const useOther = () =>
    attempt((yes) => actions.useResumeFrom(app.id, otherId, yes, false), { text: `${app.company} already has a resume attached. Replace it with the one from the other application?`, yes: "Replace it" });
  const noResume = () => attempt((yes) => actions.setNoResume(app.id, yes), { text: "Take the resume off? The lines read from it go too. The file itself isn't touched.", yes: "Take it off" });
  const open = async () => {
    const done = await fileRun.run(() => actions.openResume(app.id).then(() => true));
    setOpened(!!done);
  };

  const saveLine = async () => {
    if (!editing) return;
    const done = await lineRun.run(() => actions.editClaim(app.id, editing.id, { value: editing.value, quote: editing.value }));
    if (done) setEditing(null);
  };
  const addLine = async () => {
    if (!adding) return;
    const done = await lineRun.run(() => actions.addClaim(app.id, { type: adding.kind, subject: adding.subject || (adding.kind === "proof_number" ? "Number" : "Title"), value: adding.value, stage: "resume" }));
    if (done) setAdding(null);
  };

  const chip = { minHeight: "36px", padding: "6px 12px", fontSize: "14px" } as const;
  const resumeDate = (d: string) => (d ? shortDate(d) : "");

  return (
    <AppShell nav="applications">
      <AppHeader app={app} now={now} />
      <AppTabs current="resume" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
          <span className="e-h3">The resume you sent</span>
          <input ref={fileInput} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }} aria-label="Choose the resume file" onChange={(e) => { void takeFile(e.target.files?.[0]); e.target.value = ""; }} />
          <ErrorLine error={fileError} />
          {attached && !chooser && !showOther && (
            <>
              <div style={{ aspectRatio: "8.5 / 11", borderRadius: "12px", background: "var(--e-ground)", boxShadow: "inset 0 0 0 1.5px var(--e-line)", padding: "22px", display: "flex", flexDirection: "column", gap: "10px", boxSizing: "border-box" }} aria-label="Resume preview">
                <span style={{ height: "12px", width: "55%", borderRadius: "4px", background: "var(--e-ink)", opacity: ".75" }} />
                <span style={{ height: "6px", width: "40%", borderRadius: "3px", background: "var(--e-line)" }} />
                <span style={{ height: "8px", width: "35%", borderRadius: "3px", background: "var(--e-primary)", opacity: ".6", marginTop: "10px" }} />
                <span style={{ height: "6px", width: "92%", borderRadius: "3px", background: "var(--e-line)" }} />
                <span style={{ height: "6px", width: "86%", borderRadius: "3px", background: "var(--e-line)" }} />
                <span style={{ height: "6px", width: "90%", borderRadius: "3px", background: "var(--e-line)" }} />
                <span style={{ height: "8px", width: "30%", borderRadius: "3px", background: "var(--e-primary)", opacity: ".6", marginTop: "10px" }} />
                <span style={{ height: "6px", width: "88%", borderRadius: "3px", background: "var(--e-line)" }} />
                <span style={{ height: "6px", width: "80%", borderRadius: "3px", background: "var(--e-line)" }} />
                <span style={{ height: "6px", width: "84%", borderRadius: "3px", background: "var(--e-line)" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontWeight: "600" }}>{resume.fileName}</span>
                <span className="e-small">
                  {[`Sent ${shortDate(resume.sentOn)}`, resume.readOn ? `read ${resumeDate(resume.readOn)}` : "not read yet", resume.pages ? `${resume.pages} ${resume.pages === 1 ? "page" : "pages"}` : ""].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={fileRun.busy} onClick={() => void open()}>Open</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={fileRun.busy} onClick={() => setChooser(true)}>Replace</button>
                {!unread && !needsPaste && <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={fileRun.busy} onClick={() => void readIt()}>Read it again</button>}
              </div>
              {reading && <Working steps={["resume"]} current="resume" kind={store.engine.kind} />}
              {opened && !fileRun.error && <span className="e-small" role="status">{`Opened ${resume.fileName} in your viewer.`}</span>}
              {unread && (
                <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <span className="e-meta">Attached. Ensayo hasn't read it yet. It reads the file on this computer, and sends the text to your AI engine only if you set one up.</span>
                  <span><button type="button" className="e-btn e-btn-primary e-btn-sm" disabled={fileRun.busy} onClick={() => void readIt()}>{fileRun.busy ? "Reading" : "Read it"}</button></span>
                </div>
              )}
              <span className="e-small">{`This is the version ${app.company} has. Ensayo reads it; it never changes it.`}</span>
            </>
          )}
          {(!attached || chooser) && !showOther && (
            <div
              className="e-soft"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center" }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void takeFile(e.dataTransfer.files?.[0]);
              }}
            >
              <span className="e-h3">{attached ? "Choose the file you sent" : app.no_resume ? "You said you didn't send one" : "No resume attached"}</span>
              <span className="e-small">Drop a PDF or Word file here, or pick it from your computer.</span>
              <span style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => void chooseFile()}>Choose a file</button>
                {attached && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setChooser(false)}>Cancel</button>}
              </span>
            </div>
          )}
          {showOther && (
            <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {others.length === 0 ? (
                <span className="e-meta">None of your other applications has a resume yet.</span>
              ) : (
                <>
                  <label htmlFor="other-resume" className="e-small">Use the resume from</label>
                  <select id="other-resume" className="e-input" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>{`${o.company} · ${o.resume?.fileName}`}</option>
                    ))}
                  </select>
                  <span style={{ display: "flex", gap: "8px" }}>
                    <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={fileRun.busy || !otherId} onClick={() => void useOther()}>Use this one</button>
                    <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setShowOther(false)}>Cancel</button>
                  </span>
                </>
              )}
            </div>
          )}
          {confirm && (
            <div className="e-soft" role="alertdialog" aria-label="Confirm" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span className="e-meta">{confirm.text}</span>
              <span style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={fileRun.busy} onClick={() => void confirm.go()}>{confirm.yes}</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setConfirm(null)}>Keep what I have</button>
              </span>
            </div>
          )}
          {needsPaste && (
            <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span className="e-meta">Ensayo couldn't read the text in this file. It may be a scan, a picture of the page. Paste the text of your resume instead. The file stays as the record of what you sent.</span>
              <textarea className="e-input" rows={6} aria-label="Your resume text" placeholder="Paste the text of your resume here" value={paste} onChange={(e) => setPaste(e.target.value)} />
              <span><button type="button" className="e-btn e-btn-line e-btn-sm" disabled={fileRun.busy || !paste.trim()} onClick={() => void pasteIt()}>Use this text</button></span>
            </div>
          )}
          <ErrorLine error={fileRun.error} />
          {notices.map((n, i) => (
            <Notice key={i}>{n}</Notice>
          ))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
            {!showOther && others.length > 0 && <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }} onClick={() => { setShowOther(true); setChooser(false); }}>Use one from another application</button>}
            {!app.no_resume && <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={fileRun.busy} onClick={() => void noResume()}>I didn't send one</button>}
          </div>
        </section>
        <div style={{ flex: "999 1 560px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h2">Say these out loud</span>
              <span className="e-meta">{`What ${app.company} needs most, and your resume already shows. Don't assume they read it.`}</span>
            </div>
            {mustSay.length === 0 && (
              <span className="e-meta">
                {!attached
                  ? "Attach the resume you sent and this list fills in."
                  : resume?.must_say_state === "waiting_for_posting"
                    ? "Waiting for the posting. Read it on the Overview and this list fills in."
                    : resume?.must_say_state === "none"
                      ? "Nothing in your resume stands out beyond what you already say."
                      : unread
                        ? "Read the resume and this list fills in."
                        : "Nothing picked out yet. This fills in once the posting and the resume have both been read."}
              </span>
            )}
            {mustSay.map((m, i) => {
              const notYet = /^not said/i.test(m.said);
              return (
                <div key={m.id} className="e-soft" style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px 20px", ...(notYet ? { background: "var(--e-highlight)" } : {}) }}>
                  <span className="e-h3" style={{ color: notYet ? "var(--e-warn-ink)" : "var(--e-primary-dark)" }}>{i + 1}</span>
                  <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span className="e-h3" style={{ fontSize: "16px" }}>{m.text}</span>
                    <span className="e-small">{m.resume}</span>
                  </span>
                  <span className={notYet ? "e-badge" : "e-badge e-badge-ok"}>{m.said}</span>
                </div>
              );
            })}
          </section>
          <section className="e-card" style={{ padding: "20px 28px 8px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px", paddingBottom: "6px" }}>
              <span className="e-h2">What your resume says</span>
              <span className="e-small">Checked against your stories and everything you say. Read wrong? Edit or remove it.</span>
            </div>
            <ErrorLine error={lineRun.error} />
            {claims.length === 0 && !adding && <span className="e-meta" style={{ padding: "14px 0" }}>Nothing read from the resume yet.</span>}
            {claims.map((c, i) => {
              const differs = c.status === "differs";
              const last = i === claims.length - 1;
              const w = which[c.id];
              const isEditing = editing?.id === c.id;
              return (
                <div key={c.id} style={{ display: "flex", flexDirection: "column" }}>
                  <div className="e-rowline" style={{ padding: "14px 0", alignItems: "flex-start", ...(differs ? { background: "var(--e-highlight)", margin: "0 -28px", paddingLeft: "28px", paddingRight: "28px" } : {}), ...(last && !differs && !adding ? { borderBottom: "none" } : {}) }}>
                    <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {isEditing ? (
                        <input className="e-input" style={{ minHeight: "40px", padding: "8px 10px", fontSize: "15px" }} aria-label={`${c.subject} text`} value={editing.value} onChange={(e) => setEditing({ id: c.id, value: e.target.value })} />
                      ) : (
                        <span style={{ fontSize: "15px" }}>{c.value || "Empty line"}</span>
                      )}
                      <span className="e-small">{c.edited ? `${c.subject} · edited by you` : c.subject}</span>
                    </span>
                    {isEditing ? (
                      <>
                        <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={lineRun.busy || !editing.value.trim()} onClick={() => void saveLine()}>Save</button>
                        <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                        <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={lineRun.busy} onClick={() => void lineRun.run(() => actions.removeClaim(app.id, c.id))}>Remove</button>
                      </>
                    ) : (
                      <>
                        <MatchChip status={c.status} text={c.note ?? MATCH_LABEL[c.status as keyof typeof MATCH_LABEL] ?? c.status} />
                        {differs && (
                          <button type="button" className="e-btn e-btn-white e-btn-sm" aria-expanded={!!w?.open} onClick={() => setWhich({ ...which, [c.id]: { ...w, open: !w?.open } })}>
                            Which is right?
                          </button>
                        )}
                        {c.status === "not_in_bank" && <Link to="5-2-add-a-story-paste" className="e-btn e-btn-ghost e-btn-sm">Add</Link>}
                        <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit" onClick={() => setEditing({ id: c.id, value: c.value })}>Edit</button>
                      </>
                    )}
                  </div>
                  {differs && w?.open && (
                    <div className="e-soft" style={{ margin: "8px 0 14px", display: "flex", flexDirection: "column", gap: "10px", padding: "16px 20px" }}>
                      <span className="e-meta">{c.note ?? "Your story and your resume say different things."} Which one do you stand behind?</span>
                      <span style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        <button type="button" className={w.pick === "resume" ? "e-chip e-chip-on" : "e-chip"} style={chip} onClick={() => setWhich({ ...which, [c.id]: { open: true, pick: "resume" } })}>The resume is right</button>
                        <button type="button" className={w.pick === "story" ? "e-chip e-chip-on" : "e-chip"} style={chip} onClick={() => setWhich({ ...which, [c.id]: { open: true, pick: "story" } })}>My story is right</button>
                      </span>
                      {w.pick === "resume" && <span className="e-small">Fix the number in your story so they match.</span>}
                      {w.pick === "story" && <span className="e-small">The resume can't change now. Say why it moved when it comes up.</span>}
                    </div>
                  )}
                </div>
              );
            })}
            {adding && (
              <div className="e-rowline" style={{ padding: "14px 0", alignItems: "flex-start", flexWrap: "wrap", borderBottom: "none" }}>
                <select className="e-input" style={{ minHeight: "40px", padding: "8px 10px", fontSize: "14px", width: "170px" }} aria-label="What the line is" value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value })}>
                  {LINE_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
                <input className="e-input" style={{ flex: "1 1 160px", minHeight: "40px", padding: "8px 10px", fontSize: "15px" }} aria-label="What it is about" placeholder="What it is about, like 7-day activation" value={adding.subject} onChange={(e) => setAdding({ ...adding, subject: e.target.value })} />
                <input className="e-input" style={{ flex: "2 1 240px", minHeight: "40px", padding: "8px 10px", fontSize: "15px" }} aria-label="The line as it reads on the resume" placeholder="The line as it reads on the resume" value={adding.value} onChange={(e) => setAdding({ ...adding, value: e.target.value })} />
                <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={lineRun.busy || !adding.value.trim()} onClick={() => void addLine()}>Save</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setAdding(null)}>Cancel</button>
              </div>
            )}
            {!adding && attached && (
              <div style={{ padding: "4px 0 0" }}>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }} onClick={() => setAdding({ kind: "proof_number", subject: "", value: "" })}>
                  + Add a line
                </button>
              </div>
            )}
            <span className="e-small" style={{ padding: "6px 0 14px" }}>The resume can't be changed now, so if a story number is the right one, say why it moved when it comes up.</span>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px" }}>
              <span className="e-h3">Stories from your resume</span>
              <span className="e-small">Bullets with a result, ready to turn into stories</span>
            </div>
            <ErrorLine error={sugRun.error} />
            {suggestions.length === 0 && <span className="e-meta">No bullets to suggest yet.</span>}
            {suggestions.map((sg, i) => (
              <div key={i} className="e-rowline" style={{ padding: "12px 0", ...(i === suggestions.length - 1 ? { borderBottom: "none" } : {}) }}>
                <span style={{ flex: "1" }}>{sg.text}</span>
                <span className="e-badge">{sg.gap}</span>
                <Link to="5-3-add-a-story-review" className="e-btn e-btn-line e-btn-sm">Review</Link>
                {sg.bullet && (
                  <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={sugRun.busy} onClick={() => void sugRun.run(() => actions.dropStorySuggestion(app.id, sg.bullet as string))}>Not now</button>
                )}
              </div>
            ))}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

export default withFeatured(ResumeTab);
