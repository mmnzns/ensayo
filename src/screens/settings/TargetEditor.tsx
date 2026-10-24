// Settings, Targets, the editor: every field of a target, its pinned and hidden stories, usual stages, base resume,
// pay range and Archive. `?target=<id>` edits one; with no id it makes a new one (`?fromApp=<application id>` starts it
// from a posting). Stories are pinned and hidden as you click; everything else saves with Save target.
import { useEffect, useMemo, useRef, useState } from "react";
import { isApp, useActions } from "../../data/real";
import { useHashParam } from "../../data/selection";
import { useStore } from "../../data/store";
import { blankTarget } from "../../data/targetState";
import { angleFor, applicationTarget, roleFamilyOf } from "../../data/targets";
import type { CompanyStage, RoleFamily, SellsTo, Seniority, StageId, Story, Target } from "../../data/types";
import { STAGE_LABELS } from "../../practice/habits";
import { packSize } from "../../practice/questions";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import { pickResumePath } from "../../ui/pickFile";
import { TargetMarker, useTargetChoice } from "../../ui/TargetSwitcher";
import { setSessionPreset } from "../home/preset";
import { addStage, fileNameOf, formatPay, isResumeFileName, MAX_LEAD_WITH, onWindows, pastedPath, removeStage, RESUME_PROBLEM, stageChoices, targetToSave, type TargetFields } from "./targetForms";

const FAMILIES: { id: RoleFamily; label: string }[] = [
  { id: "lifecycle", label: "Lifecycle marketing" },
  { id: "marketing_ops", label: "Marketing operations" },
  { id: "growth", label: "Growth marketing" },
  { id: "product_marketing", label: "Product marketing" },
  { id: "other", label: "Other" },
];
const STAGES: { id: CompanyStage; label: string }[] = [
  { id: "startup", label: "Startup" },
  { id: "growth", label: "Growth" },
  { id: "enterprise", label: "Enterprise" },
  { id: "any", label: "Any" },
];
const SENIORITY: Seniority[] = ["early", "mid", "senior", "lead", "director"];
const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD"];
const PITCH_COPIED = "This pitch was copied from your closest target. Rewrite it in your own words for this job: Ensayo never writes it for you.";

const fieldsOf = (t: Target): TargetFields => ({
  name: t.name,
  role: t.role,
  roleFamily: t.roleFamily,
  seniority: t.seniority,
  industry: t.industry,
  sellsTo: t.sellsTo,
  companyStage: t.companyStage,
  pitch: t.pitch,
  leadWith: t.leadWith,
  defaultProcess: t.defaultProcess,
  baseResume: t.baseResume,
  payLow: t.payRange ? formatPay(t.payRange.low, t.payRange.currency) : "",
  payHigh: t.payRange ? formatPay(t.payRange.high, t.payRange.currency) : "",
  currency: t.payRange?.currency ?? "USD",
});

export default function TargetEditor() {
  const id = useHashParam("target");
  const fromApp = useHashParam("fromApp");
  const { targets } = useStore();
  const { targetFromPosting } = useActions();
  const existing = id ? targets.find((t) => t.id === id) : undefined;
  const [draft, setDraft] = useState<{ target: Target; pitchCopied: boolean } | "loading" | "failed" | null>(!id && fromApp ? "loading" : null);
  useEffect(() => {
    if (id || !fromApp) return;
    let live = true;
    targetFromPosting(fromApp).then(
      (d) => live && setDraft(d),
      () => live && setDraft("failed"),
    );
    return () => {
      live = false;
    };
  }, [id, fromApp, targetFromPosting]);

  if (id && !existing) {
    return (
      <AppShell nav="settings">
        <h1 className="e-h1">That target isn't here any more</h1>
        <p className="e-meta" style={{ margin: 0 }}>It may have been removed on another computer.</p>
        <Link to="8-2-settings-targets" className="e-btn e-btn-primary" style={{ alignSelf: "flex-start" }}>Back to Targets</Link>
      </AppShell>
    );
  }
  if (draft === "loading") {
    return (
      <AppShell nav="settings">
        <span className="e-meta" role="status">Reading the posting for a first draft…</span>
      </AppShell>
    );
  }
  const base = existing ?? (typeof draft === "object" && draft ? draft.target : undefined);
  return <EditorForm key={existing?.id ?? (fromApp ?? "new")} base={base} pitchCopied={typeof draft === "object" && draft ? draft.pitchCopied : false} draftFailed={draft === "failed"} />;
}

function EditorForm({ base, pitchCopied, draftFailed }: { base: Target | undefined; pitchCopied: boolean; draftFailed: boolean }) {
  const store = useStore();
  const { targets, stories, applications } = store;
  const labels = store.screens.settings.seniorityLabels;
  const sellsToLabels = store.screens.settings.sellsToLabels;
  const actions = useActions();
  const choice = useTargetChoice();
  const start = useMemo(() => base ?? blankTarget(targets), [base, targets]);
  const isNew = !base || base.id === "";
  const live = isNew ? undefined : (targets.find((t) => t.id === base?.id) ?? base);
  const [f, setF] = useState<TargetFields>(() => fieldsOf(start));
  const set = <K extends keyof TargetFields>(k: K, v: TargetFields[K]) => setF((x) => ({ ...x, [k]: v }));
  const decision = targetToSave(start, f);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(false);
  // The kind of role follows the role words until it is chosen by hand.
  const familyChosen = useRef(!isNew);
  const setRole = (role: string) => setF((x) => ({ ...x, role, roleFamily: familyChosen.current ? x.roleFamily : roleFamilyOf(role) }));

  const save = async () => {
    setShown(true);
    setError("");
    if (decision.kind === "problem") return;
    if (decision.kind === "same" && !isNew) return go("8-2-settings-targets");
    setBusy(true);
    try {
      await actions.saveTarget(decision.kind === "save" ? decision.target : start);
      go("8-2-settings-targets");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ensayo couldn't save this target. Try again.");
      setBusy(false);
    }
  };

  const title = f.name.trim() || (isNew ? "New target" : start.name);
  const pack = packSize(f.roleFamily);
  const packLabel = FAMILIES.find((x) => x.id === f.roleFamily)?.label.toLowerCase() ?? "";
  const problem = decision.kind === "problem" ? decision : null;
  const leadRows = Math.min(MAX_LEAD_WITH, Math.max(2, f.leadWith.length));
  const setLead = (i: number, v: string) => set("leadWith", Array.from({ length: Math.max(leadRows, i + 1) }, (_, k) => (k === i ? v : (f.leadWith[k] ?? ""))));

  return (
    <AppShell nav="settings">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <Link to="8-2-settings-targets" className="e-small" style={{ textDecoration: "none" }}>‹ Targets</Link>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <TargetMarker color={start.color} size={14} />
            <h1 className="e-h1">{title}</h1>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="8-2-settings-targets" className="e-btn e-btn-ghost">Cancel</Link>
          <button type="button" className="e-btn e-btn-primary" disabled={busy} onClick={() => void save()}>Save target</button>
        </div>
      </header>
      {(error || draftFailed) && (
        <span className="e-meta" role="status" style={{ color: "var(--e-ink)" }}>
          {error || "Ensayo couldn't read the posting for a first draft, so this one starts blank."}
        </span>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <span className="e-h2">The job</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
              <div className="e-field">
                <label htmlFor="tn">Target name</label>
                <input id="tn" className="e-input" value={f.name} placeholder="Named from the role if you leave it empty" onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="e-field">
                <label htmlFor="rl">Role you're going for</label>
                <input id="rl" className="e-input" value={f.role} onChange={(e) => setRole(e.target.value)} aria-invalid={shown && !!problem?.role} />
                {shown && problem?.role && <span className="e-small" role="alert" style={{ color: "var(--e-ink)" }}>{problem.role}</span>}
              </div>
              <div className="e-field">
                <label htmlFor="rf">Kind of role</label>
                <select id="rf" className="e-input" value={f.roleFamily} onChange={(e) => { familyChosen.current = true; set("roleFamily", e.target.value as RoleFamily); }}>
                  {FAMILIES.map((x) => (
                    <option key={x.id} value={x.id}>{x.label}</option>
                  ))}
                </select>
                <span className="e-small">{pack > 0 ? `Picks the question pack: ${pack} ${packLabel} questions plus the general set.` : "Uses the general set of questions. There is no pack for this kind of role yet."}</span>
              </div>
              <div className="e-field">
                <label htmlFor="sn">Seniority</label>
                <select id="sn" className="e-input" value={f.seniority} onChange={(e) => set("seniority", e.target.value as Seniority)}>
                  {SENIORITY.map((s) => (
                    <option key={s} value={s}>{labels[s]}</option>
                  ))}
                </select>
              </div>
              <div className="e-field">
                <label htmlFor="in">Industry</label>
                <input id="in" className="e-input" value={f.industry} onChange={(e) => set("industry", e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
              <div className="e-field" role="group" aria-label="Sells to">
                <span style={{ fontSize: "14px", fontWeight: "600" }}>Sells to</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {sellsToLabels.map((o: { id: SellsTo; label: string }) => (
                    <button key={o.id} type="button" className={f.sellsTo === o.id ? "e-chip e-chip-on" : "e-chip"} aria-pressed={f.sellsTo === o.id} onClick={() => set("sellsTo", o.id)}>{o.label}</button>
                  ))}
                </div>
              </div>
              <div className="e-field" role="group" aria-label="Company stage">
                <span style={{ fontSize: "14px", fontWeight: "600" }}>Company stage</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {STAGES.map((o) => (
                    <button key={o.id} type="button" className={f.companyStage === o.id ? "e-chip e-chip-on" : "e-chip"} aria-pressed={f.companyStage === o.id} onClick={() => set("companyStage", o.id)}>{o.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <span className="e-h2">How you want to come across</span>
            <div className="e-field">
              <label htmlFor="pt">Your pitch, in one sentence</label>
              <textarea id="pt" className="e-input" rows={2} value={f.pitch} onChange={(e) => set("pitch", e.target.value)} />
              <span className="e-small">Your "Tell me about yourself" answers for this target are checked against it.</span>
              {pitchCopied && f.pitch === start.pitch && <span className="e-small" role="status" style={{ color: "var(--e-warn-ink)" }}>{PITCH_COPIED}</span>}
            </div>
            <div className="e-field">
              <span style={{ fontSize: "14px", fontWeight: "600" }}>
                What you lead with <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>· 2 or 3 points every interviewer should hear</span>
              </span>
              {Array.from({ length: leadRows }, (_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span className="e-h3" style={{ width: "20px", color: "var(--e-muted)" }}>{i + 1}</span>
                  <input className="e-input" style={{ flex: "1" }} value={f.leadWith[i] ?? ""} aria-label={`Point ${i + 1}`} onChange={(e) => setLead(i, e.target.value)} />
                </div>
              ))}
              {leadRows < MAX_LEAD_WITH && (
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setLead(leadRows, "")}>+ Add a point</button>
              )}
              <span className="e-small">Added to each application's must-say list when the posting fits, and checked in the Mock debrief.</span>
            </div>
          </section>
        </div>

        <aside style={{ flex: "1 1 340px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <StoriesCard target={live} isNew={isNew} stories={stories} note={choice.note} onPractice={async (storyId) => {
            if (!live) return;
            if (live.id !== choice.active?.id && !(await choice.choose(live.id))) return;
            setSessionPreset({ source: "story", storyId });
            go("2-3-start-a-session");
          }} />

          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="e-h3">Usual interview stages</span>
            <StagesRow stages={f.defaultProcess} onChange={(s) => set("defaultProcess", s)} />
            <span className="e-small">Starts each new application. Change them per application any time.</span>
          </section>

          <ResumeCard resume={f.baseResume} onChange={(r) => set("baseResume", r)} />

          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="e-h3">Pay you're aiming for <span style={{ fontWeight: "400", color: "var(--e-muted)", fontSize: "14px" }}>· optional</span></span>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
              <input className="e-input" style={{ width: "120px" }} value={f.payLow} aria-label="From" inputMode="numeric" onChange={(e) => set("payLow", e.target.value)} />
              <span className="e-meta">to</span>
              <input className="e-input" style={{ width: "120px" }} value={f.payHigh} aria-label="To" inputMode="numeric" onChange={(e) => set("payHigh", e.target.value)} />
              <select className="e-input" style={{ width: "88px" }} aria-label="Currency" value={f.currency} onChange={(e) => set("currency", e.target.value)}>
                {(CURRENCIES.includes(f.currency) ? CURRENCIES : [...CURRENCIES, f.currency]).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            {shown && problem?.pay && <span className="e-small" role="alert" style={{ color: "var(--e-ink)" }}>{problem.pay}</span>}
            <span className="e-small">For the recruiter's pay question. Stays on this computer and is never sent to an AI.</span>
          </section>

          {live && !live.archived && <ArchiveBox target={live} others={targets.filter((t) => !t.archived && t.id !== live.id)} count={applications.filter((a) => applicationTarget(a, targets)?.id === live.id).length} />}
        </aside>
      </div>
    </AppShell>
  );
}

// ---------- stories ----------

function StoriesCard({ target, isNew, stories, note, onPractice }: { target: Target | undefined; isNew: boolean; stories: Story[]; note: string; onPractice: (storyId: string) => void }) {
  const { setStoryPriority } = useActions();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const pinned = target ? target.pinnedStoryIds.flatMap((id) => stories.filter((s) => s.id === id)) : [];
  const hidden = target ? target.hiddenStoryIds.flatMap((id) => stories.filter((s) => s.id === id)) : [];
  const set = async (storyId: string, priority: "pin" | "hide" | "none") => {
    if (!target) return;
    setError("");
    try {
      await setStoryPriority(target.id, storyId, priority);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ensayo couldn't change that. Try again.");
    }
  };
  const angle = (s: Story) => {
    const a = target ? angleFor(s, target.id) : undefined;
    return a?.headline.trim() ? `Opens with: ${a.headline.trim()}` : "no angle yet";
  };
  return (
    <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <span className="e-h3">Stories for this target</span>
        {target && <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? "Done" : "Edit"}</button>}
      </div>
      {isNew && <span className="e-small" style={{ paddingTop: "8px" }}>Save the target first, then pin the stories to lead with here.</span>}
      {(error || note) && <span className="e-small" role="status" style={{ color: "var(--e-ink)" }}>{error || note}</span>}
      {target && !editing && (
        <>
          <span className="e-label" style={{ padding: "8px 0 0" }}>Pinned · always considered first</span>
          {pinned.length === 0 && <span className="e-small" style={{ padding: "8px 0" }}>Nothing pinned. Press Edit to pick the stories to lead with.</span>}
          {pinned.map((s, i) => (
            <div key={s.id} className="e-rowline" style={{ padding: "12px 0", ...(i === pinned.length - 1 ? { borderBottom: "none" } : {}) }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontWeight: "600" }}>{s.title}</span>
                <span className="e-small">{angle(s)}</span>
              </span>
              {s.verified && <span className="e-badge e-badge-ok">Verified</span>}
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => onPractice(s.id)}>Practice it</button>
            </div>
          ))}
          <span className="e-label" style={{ padding: "12px 0 0" }}>Hidden · never used here</span>
          {hidden.length === 0 && <span className="e-small" style={{ padding: "8px 0" }}>Nothing hidden.</span>}
          {hidden.map((s, i) => (
            <div key={s.id} className="e-rowline" style={{ padding: "12px 0", ...(i === hidden.length - 1 ? { borderBottom: "none" } : {}) }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontWeight: "600" }}>{s.title}</span>
                <span className="e-small">{s.headline}</span>
              </span>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => void set(s.id, "none")}>Unhide</button>
            </div>
          ))}
          <span className="e-small" style={{ paddingTop: "8px" }}>Every other story is picked by how well it fits the question.</span>
        </>
      )}
      {target && editing && (
        <>
          <span className="e-small" style={{ paddingTop: "8px" }}>Pin the stories to lead with, or hide the ones that are not a fit for this job. These save as you click.</span>
          {stories.map((s) => {
            const state = target.pinnedStoryIds.includes(s.id) ? "pin" : target.hiddenStoryIds.includes(s.id) ? "hide" : "none";
            return (
              <div key={s.id} className="e-rowline" style={{ padding: "12px 0", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ flex: "1 1 160px", fontWeight: "600" }}>{s.title}</span>
                <span role="group" aria-label={`${s.title} for this target`} style={{ display: "flex", gap: "6px" }}>
                  {([["pin", "Pinned"], ["none", "Automatic"], ["hide", "Hidden"]] as const).map(([p, label]) => (
                    <button key={p} type="button" className={state === p ? "e-chip e-chip-on" : "e-chip"} style={{ minHeight: 32, padding: "4px 12px", fontSize: 13 }} aria-pressed={state === p} onClick={() => void set(s.id, p)}>{label}</button>
                  ))}
                </span>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

// ---------- stages ----------

function StagesRow({ stages, onChange }: { stages: StageId[]; onChange: (s: StageId[]) => void }) {
  const [adding, setAdding] = useState(false);
  const left = stageChoices(stages);
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {stages.map((s) => (
          <span key={s} className="e-pill" style={{ background: "var(--e-ground)", color: "var(--e-ink)", fontSize: "13px" }}>
            {STAGE_LABELS[s] ?? s}
            <button type="button" aria-label={`Remove ${STAGE_LABELS[s] ?? s}`} onClick={() => onChange(removeStage(stages, s))} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--e-muted)", padding: "0 0 0 2px", font: "inherit" }}>✕</button>
          </span>
        ))}
        {left.length > 0 && (
          <button type="button" className="e-chip" style={{ minHeight: 32, padding: "4px 12px", fontSize: 13 }} aria-expanded={adding} onClick={() => setAdding(!adding)}>+ Add</button>
        )}
      </div>
      {adding && left.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }} role="group" aria-label="Add a stage">
          {left.map((s) => (
            <button key={s} type="button" className="e-chip" style={{ minHeight: 32, padding: "4px 12px", fontSize: 13 }} onClick={() => { onChange(addStage(stages, s)); setAdding(left.length > 1); }}>{STAGE_LABELS[s] ?? s}</button>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- base resume ----------

function ResumeCard({ resume, onChange }: { resume: Target["baseResume"]; onChange: (r: Target["baseResume"]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [choosing, setChoosing] = useState(false);
  const [path, setPath] = useState("");
  const [problem, setProblem] = useState("");
  const app = isApp();
  const take = (name: string, full: string) => {
    if (!isResumeFileName(name)) return setProblem(RESUME_PROBLEM);
    setProblem("");
    onChange({ path: full, fileName: name });
    setChoosing(false);
    setPath("");
  };
  const browse = async () => {
    const chosen = await pickResumePath();
    if (chosen) take(fileNameOf(chosen), chosen);
  };
  return (
    <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <span className="e-h3">Base resume <span style={{ fontWeight: "400", color: "var(--e-muted)", fontSize: "14px" }}>· optional</span></span>
      <input ref={input} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }} aria-label="Choose the resume file" onChange={(e) => { const file = e.target.files?.[0]; if (file) take(file.name, file.name); }} />
      {resume && !choosing && (
        <div className="e-soft" style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", background: "var(--e-ground)" }}>
          <span style={{ width: 36, height: 44, borderRadius: 7, background: "var(--e-tint)", color: "var(--e-primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 10, fontWeight: 700 }}>
            {resume.fileName.toLowerCase().endsWith(".pdf") ? "PDF" : "DOC"}
          </span>
          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontWeight: "600", fontSize: "15px", overflowWrap: "anywhere" }}>{resume.fileName}</span>
            <span className="e-small">your master for this kind of job</span>
          </span>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setChoosing(true)}>Replace</button>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => onChange(null)}>Remove</button>
        </div>
      )}
      {(!resume || choosing) &&
        (app ? (
          <div className="e-field">
            <span style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => void browse()}>Choose a file</button>
              {choosing && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => { setChoosing(false); setProblem(""); }}>Keep {resume?.fileName}</button>}
            </span>
            <label htmlFor="rp" className="e-small">Or paste the full path to the PDF or Word file</label>
            <input id="rp" className="e-input" value={path} placeholder={onWindows() ? "C:\\Users\\you\\Documents\\Resume.pdf" : "/Users/you/Documents/Resume.pdf"} onChange={(e) => setPath(e.target.value)} />
            <span style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={!pastedPath(path)} onClick={() => take(fileNameOf(path), pastedPath(path))}>Use this file</button>
            </span>
          </div>
        ) : (
          <span style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => input.current?.click()}>Choose a file</button>
            {choosing && <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setChoosing(false)}>Keep {resume?.fileName}</button>}
          </span>
        ))}
      {problem && <span className="e-small" role="alert" style={{ color: "var(--e-ink)" }}>{problem}</span>}
      <span className="e-small">Suggested when you attach a resume to a new application here. You still attach the exact file you sent. Ensayo never edits it.</span>
    </section>
  );
}

// ---------- archive ----------

function ArchiveBox({ target, others, count }: { target: Target; others: Target[]; count: number }) {
  const { archiveTarget } = useActions();
  const [asking, setAsking] = useState(false);
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const last = others.length === 0;
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await archiveTarget(target.id, count > 0 ? moveTo : undefined);
      go("8-2-settings-targets");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ensayo couldn't archive this target. Try again.");
      setBusy(false);
    }
  };
  return (
    <>
      {!asking && (
        <>
          <button type="button" className="e-btn e-btn-danger e-btn-sm" style={{ alignSelf: "flex-start", opacity: last ? 0.5 : 1, cursor: last ? "not-allowed" : "pointer" }} disabled={last} onClick={() => setAsking(true)}>Archive this target</button>
          {last && <span className="e-small">You need at least one target, so this one can't be archived.</span>}
        </>
      )}
      {asking && (
        <div className="e-soft" role="alertdialog" aria-label="Archive this target" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <span style={{ fontWeight: "600" }}>Archive {target.name}?</span>
          {count > 0 ? (
            <>
              <span className="e-meta">{count === 1 ? "This target has 1 application." : `This target has ${count} applications.`} Move {count === 1 ? "it" : "them"} to another target first. Sessions stay in your history.</span>
              <label htmlFor="mv" className="e-small">Move {count === 1 ? "it" : "them"} to</label>
              <select id="mv" className="e-input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                {others.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </>
          ) : (
            <span className="e-meta">Its sessions stay in your history. You can restore it any time from Targets.</span>
          )}
          {error && <span className="e-small" role="alert" style={{ color: "var(--e-ink)" }}>{error}</span>}
          <span style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy} onClick={() => void confirm()}>{count > 0 ? "Move and archive" : "Archive"}</button>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setAsking(false)}>Keep it</button>
          </span>
        </div>
      )}
    </>
  );
}
