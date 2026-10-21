import { useState } from "react";
import { useStore } from "../../data/store";
import Link from "../../ui/Link";
import { setDeveloperTools, useDeveloperTools } from "./devtools";
import { CheckIcon, SettingsLayout, ToggleRow, useLater } from "./parts";
import { appVersion } from "./version";

export default function SettingsAbout() {
  const { credits } = useStore().screens.settings;
  const developer = useDeveloperTools();
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
            <span className="e-meta">{appVersion()}</span>
          </div>
          <div className="e-rowline">
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Updates
              <span className="e-small" role="status" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: checking ? "var(--e-muted)" : "var(--e-primary-dark)" }}>
                {checking ? "Checking…" : (<><CheckIcon size={14} />You're up to date</>)}
              </span>
            </span>
            <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={checking} onClick={checkForUpdates}>Check for updates</button>
          </div>
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
