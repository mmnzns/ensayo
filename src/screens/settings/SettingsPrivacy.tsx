// Draft generated from Design/screens/html/8-6-settings-privacy.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useState } from "react";
import { useStore } from "../../data/store";
import { formatSize } from "./format";
import { SettingsLayout } from "./parts";
import { leavesRows } from "./privacy";

/** Which delete is asking "are you sure" right now. */
type Asking = "recordings" | "all" | null;

export default function SettingsPrivacy() {
  const { privacy } = useStore().screens.settings;
  const [retention, setRetention] = useState(privacy.retention);
  const [folderNote, setFolderNote] = useState<"show" | "move" | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const [typed, setTyped] = useState("");
  const [recordingsMb, setRecordingsMb] = useState(privacy.recordingsMb);
  const [allDeleted, setAllDeleted] = useState(false);
  const rows = leavesRows(privacy.setup);

  return (
    <SettingsLayout active="8-6-settings-privacy">
      <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "10px" }}>
            <span className="e-h2">What leaves this computer</span>
            <span className="e-meta">Based on your current setup. Change engines to change this list.</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.title} className="e-rowline" style={i === rows.length - 1 ? { borderBottom: "none" } : undefined}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                {r.title}<span className="e-small">{r.detail}</span>
              </span>
              <span className={r.stays ? "e-badge e-badge-ok" : "e-badge"}>{r.badge}</span>
            </div>
          ))}
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="e-h3" style={{ paddingBottom: "8px" }}>Keep</span>
          <div className="e-rowline">
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Recordings<span className="e-small">Transcripts and scores stay after audio is removed.</span>
            </span>
            <select className="e-input" style={{ width: "220px" }} aria-label="Keep recordings" value={retention} onChange={(e) => setRetention(e.target.value)}>
              {privacy.retentionOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="e-rowline" style={{ borderBottom: "none" }}>
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Data folder<span className="e-small">Ensayo's app folder on this computer · stories, applications, sessions as plain files</span>
              {folderNote && (
                <span className="e-small" role="status" style={{ color: "var(--e-ink)" }}>
                  {folderNote === "show" ? "This opens the folder in Finder or File Explorer." : "This lets you pick a new place for the folder, then moves everything there."}
                </span>
              )}
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setFolderNote("show")}>Show</button>
              <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => setFolderNote("move")}>Move…</button>
            </div>
          </div>
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-h3">Delete</span>
          <div className="e-rowline" style={asking === "recordings" ? { flexWrap: "wrap" } : undefined}>
            <span style={{ flex: "1" }}>
              Delete all recordings now <span className="e-small">· {formatSize(recordingsMb)}</span>
            </span>
            {asking === "recordings" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span className="e-meta">Delete every recording? The text stays.</span>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setAsking(null)}>Keep them</button>
                <button type="button" className="e-btn e-btn-danger e-btn-sm" onClick={() => { setRecordingsMb(0); setAsking(null); }}>Yes, delete</button>
              </span>
            ) : (
              <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={recordingsMb === 0} onClick={() => { setAsking("recordings"); setTyped(""); }}>Delete recordings</button>
            )}
          </div>
          <div className="e-rowline" style={{ borderBottom: "none", flexWrap: "wrap" }}>
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Delete everything<span className="e-small">Stories, applications, resumes, sessions and keys. You'll type DELETE to confirm.</span>
            </span>
            {asking !== "all" && !allDeleted && (
              <button type="button" className="e-btn e-btn-danger e-btn-sm" onClick={() => { setAsking("all"); setTyped(""); }}>Delete all Ensayo data</button>
            )}
            {allDeleted && <span className="e-meta" role="status">Everything is deleted. Prototype: nothing was actually removed.</span>}
            {asking === "all" && (
              <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                <input className="e-input" style={{ width: "200px" }} placeholder="Type DELETE" aria-label="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} />
                <button type="button" className="e-btn e-btn-danger e-btn-sm" disabled={typed !== "DELETE"} onClick={() => { setAllDeleted(true); setAsking(null); setRecordingsMb(0); }}>Delete everything</button>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setAsking(null)}>Cancel</button>
              </div>
            )}
          </div>
        </section>
      </div>
    </SettingsLayout>
  );
}
