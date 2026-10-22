// The one-time note after the upgrade that adds targets: the profile became the first target. Shown over Home once
// (App.tsx), and as its own screen so the dialog can be seen without the app (route 1-8-upgrade-note).
import { useState } from "react";
import { useActions } from "../../data/real";
import { useStore } from "../../data/store";
import { go } from "../../ui/router";
import { TargetMarker } from "../../ui/TargetSwitcher";
import { HomeView } from "../home/Home";

export const UPGRADE_FAILED = "Ensayo couldn't save that. Try again in a moment.";

export function UpgradeNoteDialog() {
  const { targets, activeTarget } = useStore();
  const first = activeTarget ?? targets.find((t) => !t.archived) ?? targets[0];
  const { saveTarget, ackTargetsNote } = useActions();
  const [name, setName] = useState(first?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!first) return null;

  // Saves a new name if there is one, then dismisses the note for good. A failure leaves the note up with a plain line.
  const finish = async (next?: () => void) => {
    setBusy(true);
    setError("");
    try {
      const wanted = name.trim();
      if (wanted && wanted !== first.name) await saveTarget({ ...first, name: wanted });
      await ackTargetsNote();
      next?.();
    } catch {
      setError(UPGRADE_FAILED);
      setBusy(false);
    }
  };

  return (
    <div className="e-focus" style={{ position: "fixed", inset: 0, zIndex: 60, overflowY: "auto", background: "rgba(43,39,34,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="mg-title" className="e-card" style={{ width: "100%", maxWidth: "640px", padding: "40px", display: "flex", flexDirection: "column", gap: "22px", boxShadow: "0 24px 64px rgba(43,39,34,0.18)" }}>
        <span className="e-label" style={{ color: "var(--e-primary-dark)" }}>New</span>
        <h1 id="mg-title" className="e-h1" style={{ fontSize: "28px" }}>Practice for more than one kind of job</h1>
        <p className="e-body" style={{ margin: "0" }}>
          Your profile is now your first <strong>target</strong>. Nothing was lost: your stories, habits, applications and history are all here.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
          <div className="e-soft" style={{ background: "var(--e-ground)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-h3" style={{ fontSize: "15px" }}>Stays with you</span>
            <span className="e-meta">Your name, stories, focus habits and practice history</span>
          </div>
          <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-h3" style={{ fontSize: "15px" }}>Belongs to each target</span>
            <span className="e-meta">The role, who you sell to, your pitch, what you lead with and which stories go first</span>
          </div>
        </div>
        <div className="e-field">
          <label htmlFor="tn">Name your first target</label>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <TargetMarker color={first.color} size={12} />
            <input id="tn" className="e-input" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: "1" }} />
          </div>
          <span className="e-small">Named from your role and who you sell to. You can change it any time.</span>
        </div>
        <p className="e-meta" style={{ margin: "0" }}>Applying for a different kind of role too, like B2B? Add a second target and switch between them before a session.</p>
        {error && <p className="e-meta" role="alert" style={{ margin: "0", color: "var(--e-ink)" }}>{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button type="button" className="e-btn e-btn-line" disabled={busy} onClick={() => void finish(() => go("8-3-target-editor"))}>Add another target</button>
          <button type="button" className="e-btn e-btn-primary" disabled={busy} onClick={() => void finish()}>Got it</button>
        </div>
      </div>
    </div>
  );
}

/** The dialog on its own, over Home, for the browser preview and the route list. In the app the real one opens over Home when the note is pending. */
export default function UpgradeNote() {
  return (
    <>
      <HomeView />
      <UpgradeNoteDialog />
    </>
  );
}
