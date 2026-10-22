import { useState } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import { useActions } from "../../data/real";
import { withParams } from "../../data/selection";
import type { ApplicationStatus, ClosedReason, Contact, StageId } from "../../data/types";
import { CLOSED_LABEL, STAGE_LABEL, STATUSES, STATUS_LABEL, shortDate } from "./format";
import { filledContacts, isoDay, moveItem, splitAt, stageInputs, type StageDraft } from "./forms";
import { ErrorLine, useRun, withFeatured, type Featured } from "./parts";
import { useStore } from "../../data/store";
import { applicationTarget } from "../../data/targets";
import TargetPicker from "./TargetPicker";
import { asksToRebuild } from "./targetPick";

interface StageRow extends StageDraft {
  movedFrom?: string;
}

const small = { minHeight: "40px", padding: "8px 10px", fontSize: "14px" } as const;

/** What a field said before the person changed it, in the words the screen uses. */
function wasText(field: string, was: string): string {
  if (field === "status") return STATUS_LABEL[was as ApplicationStatus] ?? was;
  if (field === "closed_reason") return CLOSED_LABEL[was as ClosedReason] ?? was;
  if (field === "startup") return was === "true" ? "Yes" : "No";
  return was;
}

function EditedNote({ app, field, was }: { app: Featured["app"]; field: string; was?: string }) {
  if (!app.edited_by_user.includes(field)) return null;
  return <span className="e-small" style={{ color: "var(--e-primary-dark)" }}>{was ? `Edited by you · was "${wasText(field, was)}"` : "Edited by you"}</span>;
}

function EditDetails({ app, extras }: Featured) {
  const actions = useActions();
  const store = useStore();
  const { busy, error, run, setError } = useRun();
  const filedId = applicationTarget(app, store.targets)?.id ?? "";
  const [targetId, setTargetId] = useState(filedId);
  const [rebuild, setRebuild] = useState(true);
  const [company, setCompany] = useState(app.company);
  const [role, setRole] = useState(app.role);
  const [status, setStatus] = useState<ApplicationStatus>(app.status);
  const [closedReason, setClosedReason] = useState<ClosedReason | "">(app.closed_reason ?? "");
  const [applied, setApplied] = useState(isoDay(app.applied_on));
  const [source, setSource] = useState(app.source);
  const [startup, setStartup] = useState(app.startup);
  const [contacts, setContacts] = useState<Contact[]>(app.contacts.length ? app.contacts : [{ name: "", role: "", email_or_phone: "", notes: "" }]);
  const [notes, setNotes] = useState(app.notes);
  const [posting, setPosting] = useState(extras.postingText);
  const [editPosting, setEditPosting] = useState(false);
  const [postingChanged, setPostingChanged] = useState(false);
  const [readAgain, setReadAgain] = useState(true);
  const [stages, setStages] = useState<StageRow[]>(
    [...app.process]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        key: s.id,
        id: s.id,
        stage: s.stage,
        label: s.label || STAGE_LABEL[s.stage],
        ...splitAt(s.at),
        movedFrom: s.previous_at && s.previous_at.length ? shortDate(s.previous_at[s.previous_at.length - 1]) : undefined,
      })),
  );
  const [nextKey, setNextKey] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [alsoPractice, setAlsoPractice] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ sessions: number } | null>(null);

  const setContact = (i: number, patch: Partial<Contact>) => setContacts(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setStage = (key: string, patch: Partial<StageRow>) => setStages(stages.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => setStages(moveItem(stages, i, d));
  const addStage = (stage: StageId) => {
    setStages([...stages, { key: `new_${nextKey}`, stage, label: STAGE_LABEL[stage], date: "", time: "" }]);
    setNextKey(nextKey + 1);
  };
  const pastedOn = shortDate(extras.postingPastedOn);
  const hasPosting = posting.trim().length > 0 || !!app.analysis;
  const practice = app.process.reduce((n, s) => n + s.sessions, 0);
  const overview = withParams("6-3-application-overview", { app: app.id });
  const targetChanged = targetId !== filedId;
  const askRebuild = asksToRebuild(app, extras.questions.length, targetId, store.targets);
  const nextTarget = store.targets.find((t) => t.id === targetId);

  // The stage list goes last: asking about a stage that has sessions stops here, and the answer saves just the list.
  const saveStages = async (confirm: boolean) => {
    const out = await actions.saveProcess(app.id, stageInputs(stages), confirm);
    if (out.status === "needs_confirm") {
      setConfirmRemove({ sessions: out.sessions });
      return false;
    }
    setConfirmRemove(null);
    return true;
  };
  const save = () =>
    run(async () => {
      await actions.updateApplication(app.id, {
        company,
        role,
        status,
        ...(status === "closed" && closedReason ? { closed_reason: closedReason } : {}),
        ...(applied ? { applied_on: applied } : {}),
        source,
        contacts: filledContacts(contacts),
        notes,
        startup,
        ...(targetChanged ? { targetId, rebuildQuestions: askRebuild && rebuild } : {}),
      });
      if (postingChanged) {
        const saved = await actions.savePosting(app.id, posting);
        if (posting.trim() && (saved.has_analysis ? readAgain : true)) await actions.analyseJd(app.id);
      }
      if (await saveStages(false)) go(overview);
    });
  const removeAnyway = () =>
    run(async () => {
      if (await saveStages(true)) go(overview);
    });
  const remove = () =>
    run(async () => {
      await actions.deleteApplication(app.id, alsoPractice);
      go("6-1-applications");
    });

  return (
    <AppShell nav="applications">
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Link to={overview} className="e-small" style={{ textDecoration: "none" }}>{`‹ ${app.company}`}</Link>
        <h1 className="e-h1">Edit details</h1>
        <span className="e-meta">Fix anything that was read wrong or has changed. What you edit here is never overwritten when Ensayo reads the posting or resume again.</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <span className="e-h3">The job</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
              <div className="e-field">
                <label htmlFor="co">Company</label>
                <input id="co" className="e-input" value={company} onChange={(e) => setCompany(e.target.value)} />
                <EditedNote app={app} field="company" was={extras.wasValues.company} />
              </div>
              <div className="e-field">
                <label htmlFor="ro">Role</label>
                <input id="ro" className="e-input" value={role} onChange={(e) => setRole(e.target.value)} />
                <EditedNote app={app} field="role" was={extras.wasValues.role} />
              </div>
              <div className="e-field" style={{ gridColumn: "1 / -1" }}>
                <span style={{ fontSize: "14px", fontWeight: "600" }}>Target</span>
                <TargetPicker targets={store.targets} activeId={store.activeTarget?.id} value={targetId} onChange={setTargetId} keep={filedId} />
                {askRebuild && (
                  <label className="e-soft" style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", padding: "14px 18px" }}>
                    <input type="checkbox" className="e-check" checked={rebuild} onChange={(e) => setRebuild(e.target.checked)} style={{ marginTop: "2px" }} />
                    <span className="e-meta" style={{ color: "var(--e-ink)" }}>{`Make the question set again for ${nextTarget?.name ?? "this target"}. Questions you wrote or edited stay. Stages, dates, the resume you sent and everything you've said stay as they are.`}</span>
                  </label>
                )}
              </div>
              <div className="e-field">
                <label htmlFor="st">Where it stands</label>
                <select id="st" className="e-input" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
                <EditedNote app={app} field="status" was={extras.wasValues.status} />
              </div>
              {status === "closed" && (
                <div className="e-field">
                  <label htmlFor="cr">Why it closed</label>
                  <select id="cr" className="e-input" value={closedReason} onChange={(e) => setClosedReason(e.target.value as ClosedReason)}>
                    <option value="" disabled>Pick one</option>
                    {(Object.keys(CLOSED_LABEL) as ClosedReason[]).map((r) => (
                      <option key={r} value={r}>{CLOSED_LABEL[r]}</option>
                    ))}
                  </select>
                  <EditedNote app={app} field="closed_reason" was={extras.wasValues.closed_reason} />
                </div>
              )}
              <div className="e-field">
                <label htmlFor="ap">Date applied</label>
                <input id="ap" type="date" className="e-input" value={applied} onChange={(e) => setApplied(e.target.value)} />
                <EditedNote app={app} field="applied_on" was={extras.wasValues.applied_on} />
              </div>
              <div className="e-field">
                <label htmlFor="sr">Found it on</label>
                <input id="sr" className="e-input" value={source} onChange={(e) => setSource(e.target.value)} />
                <EditedNote app={app} field="source" was={extras.wasValues.source} />
              </div>
              <label className="e-field" style={{ justifyContent: "flex-end", cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "48px" }}>
                  <input type="checkbox" className="e-check" checked={startup} onChange={(e) => setStartup(e.target.checked)} />
                  <span style={{ fontSize: "15px" }}>Startup or founder-led</span>
                </span>
                <EditedNote app={app} field="startup" was={extras.wasValues.startup} />
              </label>
            </div>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <span className="e-h3">Contact</span>
            <EditedNote app={app} field="contacts" />
            {contacts.map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
                <div className="e-field">
                  <label htmlFor={`cn${i}`}>Name</label>
                  <input id={`cn${i}`} className="e-input" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} />
                </div>
                <div className="e-field">
                  <label htmlFor={`cr${i}`}>Their role</label>
                  <input id={`cr${i}`} className="e-input" value={c.role} onChange={(e) => setContact(i, { role: e.target.value })} />
                </div>
                <div className="e-field">
                  <label htmlFor={`ce${i}`}>Email or phone</label>
                  <input id={`ce${i}`} className="e-input" value={c.email_or_phone} onChange={(e) => setContact(i, { email_or_phone: e.target.value })} />
                </div>
                <div className="e-field">
                  <label htmlFor={`cnn${i}`}>About them</label>
                  <input id={`cnn${i}`} className="e-input" value={c.notes} onChange={(e) => setContact(i, { notes: e.target.value })} />
                </div>
              </div>
            ))}
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ alignSelf: "flex-start", paddingLeft: "0" }} onClick={() => setContacts([...contacts, { name: "", role: "", email_or_phone: "", notes: "" }])}>
              + Add another contact
            </button>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="e-field">
              <label htmlFor="nt">Notes</label>
              <textarea id="nt" className="e-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <EditedNote app={app} field="notes" />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600" }}>Job posting</span>
                <span className="e-small">{hasPosting && pastedOn ? `Pasted ${pastedOn} · changing it asks whether to read it again` : "Nothing pasted yet · paste it any time"}</span>
              </span>
              <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => setEditPosting(!editPosting)}>{editPosting ? "Done" : hasPosting ? "Edit posting text" : "Add posting text"}</button>
            </div>
            {editPosting && (
              <textarea
                className="e-input"
                rows={7}
                aria-label="Job posting text"
                value={posting}
                onChange={(e) => {
                  setPosting(e.target.value);
                  setPostingChanged(true);
                }}
              />
            )}
            <EditedNote app={app} field="posting" />
            {postingChanged && (
              <label className="e-soft" style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", padding: "14px 18px" }}>
                <input type="checkbox" className="e-check" checked={readAgain} onChange={(e) => setReadAgain(e.target.checked)} />
                <span className="e-meta">Read the posting again when you save. What you edited here stays as you wrote it.</span>
              </label>
            )}
          </section>
        </div>
        <section className="e-card" style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span className="e-h3">Interview stages</span>
          <span className="e-meta" style={{ paddingBottom: "6px" }}>Rename, reorder and change dates as things move.</span>
          {stages.length === 0 && <span className="e-small" style={{ padding: "12px 0" }}>No stages. Add the ones you know about below.</span>}
          {stages.map((s, i) => (
            <div key={s.key} className="e-rowline" style={{ padding: "12px 0", flexWrap: "wrap", ...(i === stages.length - 1 ? { borderBottom: "none" } : {}) }}>
              <span style={{ display: "flex", flexDirection: "column" }}>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={`Move ${s.label} up`} disabled={i === 0} onClick={() => move(i, -1)} style={{ minHeight: "20px", padding: "0 6px", fontSize: "11px", lineHeight: 1 }}>▲</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={`Move ${s.label} down`} disabled={i === stages.length - 1} onClick={() => move(i, 1)} style={{ minHeight: "20px", padding: "0 6px", fontSize: "11px", lineHeight: 1 }}>▼</button>
              </span>
              <input className="e-input" style={{ flex: "1 1 160px", minHeight: "40px", padding: "8px 10px", fontSize: "15px", fontWeight: "600" }} value={s.label} aria-label="Stage name" onChange={(e) => setStage(s.key, { label: e.target.value })} />
              <input type="date" className="e-input" style={{ ...small, width: "150px" }} value={s.date} aria-label={`${s.label} date`} onChange={(e) => setStage(s.key, { date: e.target.value, movedFrom: undefined })} />
              <input type="time" className="e-input" style={{ ...small, width: "110px" }} value={s.time} aria-label={`${s.label} time`} onChange={(e) => setStage(s.key, { time: e.target.value })} />
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={`Remove ${s.label}`} style={{ minHeight: "40px", padding: "8px" }} onClick={() => setStages(stages.filter((x) => x.key !== s.key))}>✕</button>
              {s.movedFrom && <span className="e-small" style={{ flex: "1 1 100%", paddingLeft: "26px", color: "var(--e-warn-ink)" }}>{`Moved from ${s.movedFrom}. Your night-before reminder moved with it.`}</span>}
            </div>
          ))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", paddingTop: "8px" }}>
            <span className="e-small" style={{ width: "100%" }}>Add a stage</span>
            {(["technical", "panel", "hiring_manager"] as StageId[]).map((s) => (
              <button key={s} type="button" className="e-chip" style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px" }} onClick={() => addStage(s)}>{`+ ${STAGE_LABEL[s]}`}</button>
            ))}
          </div>
          <span className="e-small" style={{ paddingTop: "10px" }}>Removing a stage you've practiced keeps those sessions in your history.</span>
          {confirmRemove && (
            <div className="e-soft" role="alertdialog" aria-label="Remove stages with practice" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span className="e-meta">{`The stages you took out have ${confirmRemove.sessions} practice ${confirmRemove.sessions === 1 ? "session" : "sessions"}. They stay in your history under their old stage name. Take the stages out anyway?`}</span>
              <span style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy} onClick={() => void removeAnyway()}>Take them out</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setConfirmRemove(null)}>Keep them</button>
              </span>
            </div>
          )}
        </section>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
        {!confirmDelete ? (
          <button type="button" className="e-btn e-btn-danger e-btn-sm" onClick={() => setConfirmDelete(true)}>Delete application</button>
        ) : (
          <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }} role="alertdialog" aria-label="Delete this application">
            <span className="e-meta">{`Delete ${app.company}? Its posting, resume file, claims log and stages go with it. This can't be undone.`}</span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input type="checkbox" className="e-check" checked={alsoPractice} onChange={(e) => setAlsoPractice(e.target.checked)} />
              <span className="e-small">{practice > 0 ? `Delete its ${practice} practice ${practice === 1 ? "session" : "sessions"} too` : "Delete its practice too"}</span>
            </label>
            <button type="button" className="e-btn e-btn-danger e-btn-sm" disabled={busy} onClick={() => void remove()}>{alsoPractice ? "Yes, delete it and its practice" : "Yes, delete it"}</button>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => { setConfirmDelete(false); setError(""); }}>Keep it</button>
          </span>
        )}
        <span style={{ flex: "1" }} />
        <ErrorLine error={error} />
        <Link to={overview} className="e-btn e-btn-ghost">Cancel</Link>
        <button type="button" className="e-btn e-btn-primary e-btn-big" disabled={busy} onClick={() => void save()}>{busy ? "Saving" : "Save changes"}</button>
      </div>
    </AppShell>
  );
}

export default withFeatured(EditDetails);
