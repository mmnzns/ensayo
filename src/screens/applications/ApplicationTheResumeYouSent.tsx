import { useRef, useState } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { MATCH_LABEL, shortDate } from "./format";
import { AppHeader, AppTabs, MatchChip, withFeatured, type Featured } from "./parts";

interface ClaimRow {
  id: string;
  subject: string;
  value: string;
  status: string;
  note?: string;
  editing?: boolean;
}

function ResumeTab({ app, now }: Featured) {
  const resume = app.resume;
  const [fileName, setFileName] = useState(resume?.fileName ?? "");
  const [attached, setAttached] = useState(!!resume);
  const [chooser, setChooser] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const [opened, setOpened] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [claims, setClaims] = useState<ClaimRow[]>((resume?.claims ?? []).map((c) => ({ id: c.id, subject: c.subject, value: c.value, status: c.status, note: c.note })));
  const [which, setWhich] = useState<Record<string, { open: boolean; pick?: "resume" | "story" }>>({});
  const [nextId, setNextId] = useState(1);

  const takeFile = (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    setAttached(true);
    setReplaced(true);
    setChooser(false);
  };
  const patch = (id: string, p: Partial<ClaimRow>) => setClaims(claims.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const mustSay = resume?.mustSay ?? [];
  const suggestions = resume?.suggestions ?? [];

  return (
    <AppShell nav="applications">
      <AppHeader app={app} now={now} />
      <AppTabs current="resume" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
          <span className="e-h3">The resume you sent</span>
          <input ref={fileInput} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }} aria-label="Choose the resume file" onChange={(e) => takeFile(e.target.files?.[0])} />
          {attached && !chooser && (
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
                <span style={{ fontWeight: "600" }}>{fileName}</span>
                <span className="e-small">
                  {replaced || !resume ? "Replaced just now · will be read again when you save" : `Sent ${shortDate(resume.sentOn)} · read ${shortDate(resume.readOn)} · ${resume.pages} pages`}
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => setOpened(true)}>Open</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setChooser(true)}>Replace</button>
              </div>
              {opened && <span className="e-small" role="status">{`Opened ${fileName} in your viewer.`}</span>}
              <span className="e-small">{`This is the version ${app.company} has. Ensayo reads it; it never changes it.`}</span>
            </>
          )}
          {(!attached || chooser) && (
            <div
              className="e-soft"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center" }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                takeFile(e.dataTransfer.files?.[0]);
              }}
            >
              <span className="e-h3">{attached ? "Choose the file you sent" : "No resume attached"}</span>
              <span className="e-small">Drop a PDF or Word file here, or pick it from your computer.</span>
              <span style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => fileInput.current?.click()}>Choose a file</button>
                {attached && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setChooser(false)}>Cancel</button>}
              </span>
            </div>
          )}
        </section>
        <div style={{ flex: "999 1 560px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h2">Say these out loud</span>
              <span className="e-meta">{`What ${app.company} needs most, and your resume already shows. Don't assume they read it.`}</span>
            </div>
            {mustSay.length === 0 && <span className="e-meta">{attached ? "Nothing picked out yet. This fills in once the posting and the resume have both been read." : "Attach the resume you sent and this list fills in."}</span>}
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
            {claims.length === 0 && <span className="e-meta" style={{ padding: "14px 0" }}>Nothing read from the resume yet.</span>}
            {claims.map((c, i) => {
              const differs = c.status === "differs";
              const last = i === claims.length - 1;
              const w = which[c.id];
              return (
                <div key={c.id} style={{ display: "flex", flexDirection: "column" }}>
                  <div className="e-rowline" style={{ padding: "14px 0", alignItems: "flex-start", ...(differs ? { background: "var(--e-highlight)", margin: "0 -28px", paddingLeft: "28px", paddingRight: "28px" } : {}), ...(last && !differs && c.status !== "differs" ? { borderBottom: "none" } : {}) }}>
                    <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {c.editing ? (
                        <input className="e-input" style={{ minHeight: "40px", padding: "8px 10px", fontSize: "15px" }} aria-label={`${c.subject} text`} value={c.value} onChange={(e) => patch(c.id, { value: e.target.value })} />
                      ) : (
                        <span style={{ fontSize: "15px" }}>{c.value || "Empty line"}</span>
                      )}
                      <span className="e-small">{c.subject}</span>
                    </span>
                    {c.editing ? (
                      <>
                        <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => patch(c.id, { editing: false })}>Save</button>
                        <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setClaims(claims.filter((x) => x.id !== c.id))}>Remove</button>
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
                        <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit" onClick={() => patch(c.id, { editing: true })}>Edit</button>
                      </>
                    )}
                  </div>
                  {differs && w?.open && (
                    <div className="e-soft" style={{ margin: "8px 0 14px", display: "flex", flexDirection: "column", gap: "10px", padding: "16px 20px" }}>
                      <span className="e-meta">{c.note ?? "Your story and your resume say different things."} Which one do you stand behind?</span>
                      <span style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        <button type="button" className={w.pick === "resume" ? "e-chip e-chip-on" : "e-chip"} style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px" }} onClick={() => setWhich({ ...which, [c.id]: { open: true, pick: "resume" } })}>The resume is right</button>
                        <button type="button" className={w.pick === "story" ? "e-chip e-chip-on" : "e-chip"} style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px" }} onClick={() => setWhich({ ...which, [c.id]: { open: true, pick: "story" } })}>My story is right</button>
                      </span>
                      {w.pick === "resume" && <span className="e-small">Fix the number in your story so they match.</span>}
                      {w.pick === "story" && <span className="e-small">The resume can't change now. Say why it moved when it comes up.</span>}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ padding: "4px 0 0" }}>
              <button
                type="button"
                className="e-btn e-btn-ghost e-btn-sm"
                style={{ paddingLeft: "0" }}
                onClick={() => {
                  setClaims([...claims, { id: `new_${nextId}`, subject: "Number", value: "", status: "not_in_bank", note: "Not in your stories", editing: true }]);
                  setNextId(nextId + 1);
                }}
              >
                + Add a line
              </button>
            </div>
            <span className="e-small" style={{ padding: "6px 0 14px" }}>The resume can't be changed now, so if a story number is the right one, say why it moved when it comes up.</span>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px" }}>
              <span className="e-h3">Stories from your resume</span>
              <span className="e-small">Bullets with a result, ready to turn into stories</span>
            </div>
            {suggestions.length === 0 && <span className="e-meta">No bullets to suggest yet.</span>}
            {suggestions.map((s, i) => (
              <div key={i} className="e-rowline" style={{ padding: "12px 0", ...(i === suggestions.length - 1 ? { borderBottom: "none" } : {}) }}>
                <span style={{ flex: "1" }}>{s.text}</span>
                <span className="e-badge">{s.gap}</span>
                <Link to="5-3-add-a-story-review" className="e-btn e-btn-line e-btn-sm">Review</Link>
              </div>
            ))}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

export default withFeatured(ResumeTab);
