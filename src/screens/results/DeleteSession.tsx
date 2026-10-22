import { useState } from "react";
import { useActions, useRepHistory } from "../../data/real";
import { answersIn, deleteSessionText, restoreHint, GONE_LINE } from "../../data/trash";
import { plainError } from "../../data/actions";
import { forgetSession } from "../../practice/live";
import { viewSession, useViewedSession } from "../../practice/viewing";
import { go } from "../../ui/router";
import { setFlash } from "../../ui/flash";

const quiet = { background: "none", border: "none", padding: 0, font: "inherit", fontSize: "13px", color: "var(--e-muted)", textDecoration: "underline", cursor: "pointer" } as const;

/** "Delete this session" as a quiet link at the bottom of a results screen, for the session on show. Nothing when no
 *  session is on show (the sample walk-through in the browser). */
export default function DeleteSession() {
  const sessionId = useViewedSession();
  return sessionId ? <DeleteSessionFor sessionId={sessionId} /> : null;
}

export function DeleteSessionFor({ sessionId }: { sessionId: string }) {
  const actions = useActions();
  const reps = useRepHistory();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await actions.deleteSession(sessionId);
    } catch (e) {
      setError(plainError(e));
      setBusy(false);
      return;
    }
    // The session on show is gone: back home, with the line saying so.
    viewSession(null);
    forgetSession(sessionId);
    setFlash(GONE_LINE);
    go("2-1-home");
  };

  if (!asking) {
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button type="button" style={quiet} onClick={() => setAsking(true)}>Delete this session</button>
      </div>
    );
  }
  return (
    <div className="e-soft" role="alertdialog" aria-label="Delete this session" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <span className="e-meta">{deleteSessionText(answersIn(reps, sessionId))}</span>
      <span className="e-small">{restoreHint(1)}</span>
      {error && <span role="alert" className="e-small" style={{ color: "var(--e-danger)" }}>{error}</span>}
      <span style={{ display: "flex", gap: "8px" }}>
        <button type="button" className="e-btn e-btn-danger e-btn-sm" disabled={busy} onClick={() => void remove()}>Delete</button>
        <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={busy} onClick={() => { setAsking(false); setError(""); }}>Keep it</button>
      </span>
    </div>
  );
}
