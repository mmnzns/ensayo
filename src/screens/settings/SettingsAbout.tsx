import { useState } from "react";
import { useStore } from "../../data/store";
import Link from "../../ui/Link";
import { checkText, phaseText, useUpdate } from "../../data/updates";
import { setDeveloperTools, useDeveloperTools } from "./devtools";
import { CheckIcon, SettingsLayout, ToggleRow, useLater } from "./parts";
import { isApp } from "../../data/real";
import { useAppVersion } from "./version";
import { tauriDiagnostics } from "../../data/diagnostics";
import { copyText } from "../../ui/clipboard";
import { readPrefs } from "./prefs";

/** Copy diagnostics and Show log folder: for a bug report. Only in the app (the browser preview has no log). */
function DiagnosticsRow() {
  const [line, setLine] = useState<{ text: string; bad: boolean } | null>(null);
  const later = useLater();
  const say = (text: string, bad = false) => {
    setLine({ text, bad });
    later(() => setLine(null), 8000);
  };
  const copy = async () => {
    const bridge = tauriDiagnostics();
    if (!bridge) return;
    try {
      const text = await bridge.text(readPrefs().speech.model);
      say((await copyText(text)) ? "Copied. Paste it into a message to Miguel." : "Couldn't copy here. Use the Feedback screen to see and send it.", false);
    } catch {
      say("Ensayo couldn't read its diagnostics.", true);
    }
  };
  const reveal = async () => {
    try {
      await tauriDiagnostics()?.reveal();
    } catch {
      say("Ensayo couldn't open the log folder.", true);
    }
  };
  return (
    <div className="e-rowline">
      <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
        Diagnostics
        <span className="e-small">Your system, the state of the engines and the last lines of Ensayo's log. No answers, stories or keys.</span>
        {line && <span className="e-small" role="status" style={{ color: line.bad ? "var(--e-danger)" : "var(--e-primary-dark)" }}>{line.text}</span>}
      </span>
      <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => void copy()}>Copy diagnostics</button>
      <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => void reveal()}>Show log folder</button>
    </div>
  );
}

/** Updates in the app: Ensayo checks by itself; this row checks now and installs what it finds. */
function UpdatesRow() {
  const u = useUpdate();
  const busy = u.phase.state === "installing" || u.phase.state === "restarting";
  const line = phaseText(u.phase) ?? checkText(u.check) ?? (u.pending ? `Ensayo ${u.pending.version} is ready to install` : "Ensayo checks for updates by itself.");
  const bad = u.phase.state === "error" || u.check.state === "offline";
  return (
    <div className="e-rowline">
      <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
        Updates
        <span className="e-small" role="status" style={{ color: bad ? "var(--e-danger)" : u.check.state === "up-to-date" ? "var(--e-primary-dark)" : "var(--e-muted)" }}>{line}</span>
      </span>
      {u.pending && u.laterFor === u.pending.version && !busy && (
        <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={u.showBanner}>See what's new</button>
      )}
      {u.pending ? (
        <button type="button" className="e-btn e-btn-primary e-btn-sm" disabled={busy} onClick={() => void u.install()}>{u.phase.state === "error" ? "Try again" : "Update now"}</button>
      ) : (
        <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={u.check.state === "checking"} onClick={() => void u.checkNow()}>Check for updates</button>
      )}
    </div>
  );
}

export default function SettingsAbout() {
  const { credits } = useStore().screens.settings;
  const developer = useDeveloperTools();
  const version = useAppVersion();
  const app = isApp();
  const [checking, setChecking] = useState(false);
  const later = useLater();

  // M1 has nothing to check against, so it always lands on the same answer.
  const checkForUpdates = () => {
    setChecking(true);
    later(() => setChecking(false), 900);
  };

  return (
    <SettingsLayout active="settings-about">
      <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "10px" }}>
            <span className="e-h2">About Ensayo</span>
            <span className="e-meta">Practice answering out loud. Get one fix. Answer again.</span>
          </div>
          <div className="e-rowline">
            <span style={{ flex: "1" }}>Version</span>
            <span className="e-meta">{version}</span>
          </div>
          {app ? <UpdatesRow /> : (
            <div className="e-rowline">
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                Updates
                <span className="e-small" role="status" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: checking ? "var(--e-muted)" : "var(--e-primary-dark)" }}>
                  {checking ? "Checking…" : (<><CheckIcon size={14} />You're up to date</>)}
                </span>
              </span>
              <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={checking} onClick={checkForUpdates}>Check for updates</button>
            </div>
          )}
          {app && <DiagnosticsRow />}
          <div className="e-rowline">
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              by craft concepts digital<span className="e-small">The studio behind Talaan, Parlato and Ensayo.</span>
            </span>
            <Link to="https://craftconceptsdigital.com" className="e-btn e-btn-ghost e-btn-sm">craftconceptsdigital.com</Link>
          </div>
          <ToggleRow last title="Show developer tools" hint="Adds a Developer page to this list, with a way to open any screen." checked={developer} onChange={setDeveloperTools} />
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-h3">Credits</span>
            <span className="e-meta">Ensayo is built on other people's work. Each piece is used under its own license. Models are downloaded from their sources, not bundled.</span>
          </div>
          {credits.map((g) => (
            <div key={g.title} style={{ display: "flex", flexDirection: "column" }}>
              <span className="e-label" style={{ paddingBottom: "4px" }}>{g.title}</span>
              {g.items.map((item, i) => (
                <div key={item.name} className="e-rowline" style={{ padding: "10px 0", ...(i === g.items.length - 1 ? { borderBottom: "none" } : {}) }}>
                  <span style={{ flex: "1" }}>{item.name}</span>
                  <span className="e-small" style={{ textAlign: "right" }}>{item.license}</span>
                </div>
              ))}
            </div>
          ))}
          <span className="e-small">The full list, with sources, is in THIRD_PARTY_NOTICES.md in the app's folder.</span>
        </section>
      </div>
    </SettingsLayout>
  );
}
