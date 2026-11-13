// Settings, Privacy, "Recently deleted": sessions, stories and applications waiting in the trash, a Restore for each.
// Progress, Sessions keeps its own list for sessions; this one has all three kinds.
import { useState } from "react";
import { plainError } from "../../data/actions";
import { useActions, useOtherTrash, useTrashedSessions } from "../../data/real";
import { useStore } from "../../data/store";
import { TRASH_NOTE_ALL, trashRows, type TrashRow } from "../../data/trash";

export default function RecentlyDeletedAll() {
  const sessions = useTrashedSessions();
  const { stories, applications: trashedApps } = useOtherTrash();
  const { applications } = useStore();
  const actions = useActions();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const rows = trashRows(sessions, stories, trashedApps, (id) => applications.find((a) => a.id === id)?.company);

  const restore = async (row: TrashRow) => {
    setBusy(`${row.kind}:${row.id}`);
    setError("");
    try {
      if (row.kind === "session") await actions.restoreSession(row.id);
      else if (row.kind === "story") await actions.restoreStory(row.id);
      else await actions.restoreApplication(row.id);
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }} aria-label="Recently deleted">
      <span className="e-h3" style={{ paddingBottom: "8px" }}>Recently deleted</span>
      {error && <span role="alert" className="e-small" style={{ color: "var(--e-warn-ink)" }}>{error}</span>}
      {rows.length === 0 ? (
        <span className="e-small">Nothing deleted lately.</span>
      ) : (
        rows.map((r, i) => (
          <div key={`${r.kind}:${r.id}`} className="e-rowline" style={i === rows.length - 1 ? { borderBottom: "none" } : undefined}>
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              {r.title}
              <span className="e-small">{r.detail}</span>
            </span>
            <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy !== null} onClick={() => void restore(r)}>Restore</button>
          </div>
        ))
      )}
      <span className="e-small" style={{ paddingTop: "8px" }}>{TRASH_NOTE_ALL}</span>
    </section>
  );
}
