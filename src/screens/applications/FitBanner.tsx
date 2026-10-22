import { useState } from "react";
import Link from "../../ui/Link";
import { useActions } from "../../data/real";
import { withParams } from "../../data/selection";
import { useStore } from "../../data/store";
import type { Application } from "../../data/types";
import { isKept, keepTarget } from "./fitKept";
import { ErrorLine, useRun } from "./parts";
import { fitNote } from "./targetPick";

/** "This posting is B2B. It's filed under B2C lifecycle." with the three ways out: move it, make a new target from it, or keep it. */
export default function FitBanner({ app }: { app: Application }) {
  const store = useStore();
  const actions = useActions();
  const { busy, error, run } = useRun();
  const [confirming, setConfirming] = useState(false);
  const [kept, setKept] = useState(false);
  const note = fitNote(app, store.targets);
  if (!note || kept || isKept(app.id, note.filed?.id, undefined, app.fitDismissedFor)) return null;
  const { suggested, filed } = note;
  const move = async () => {
    if (!suggested) return;
    const done = await run(() => actions.updateApplication(app.id, { targetId: suggested.id, rebuildQuestions: true }));
    if (done) setConfirming(false);
  };
  return (
    <section role="status" className="e-card" style={{ display: "flex", flexDirection: "column", gap: "14px", boxShadow: "inset 0 0 0 2px var(--e-primary)", background: "var(--e-tint)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <span className="e-h2">{note.headline}</span>
        <span className="e-meta" style={{ color: "var(--e-ink)" }}>{note.body}</span>
      </div>
      {confirming && suggested ? (
        <div className="e-soft" role="alertdialog" aria-label={`Move to ${suggested.name}`} style={{ display: "flex", flexDirection: "column", gap: "10px", background: "var(--e-surface)" }}>
          <span className="e-meta" style={{ color: "var(--e-ink)" }}>{`Move ${app.company} to ${suggested.name}? Ensayo makes the question set again for that target. Questions you wrote or edited stay.`}</span>
          <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
            <button type="button" className="e-btn e-btn-primary e-btn-sm" disabled={busy} onClick={() => void move()}>{busy ? "Moving" : "Move it"}</button>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setConfirming(false)}>Not now</button>
            <ErrorLine error={error} />
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {suggested && (
            <button type="button" className="e-btn e-btn-primary e-btn-sm" onClick={() => setConfirming(true)}>{`Move to ${suggested.name}`}</button>
          )}
          <Link to={withParams("6-10-new-target-from-posting", { app: app.id })} className="e-btn e-btn-white e-btn-sm">Make a new target from this posting</Link>
          <button
            type="button"
            className="e-btn e-btn-ghost e-btn-sm"
            onClick={() => {
              keepTarget(app.id, filed?.id);
              setKept(true);
              // Saved on the application in the app; the browser preview keeps the local note only.
              if (filed) void actions.updateApplication(app.id, { fitDismissedFor: filed.id }).catch(() => {});
            }}
          >{`Keep ${filed?.name ?? "this target"}`}</button>
        </div>
      )}
      <span className="e-small">Moving it rebuilds the question set. Stages, dates, the resume you sent and everything you've said stay as they are.</span>
    </section>
  );
}
