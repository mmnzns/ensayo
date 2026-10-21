import Link from "../../ui/Link";
import { manifest, type Group } from "../manifest";
import { extras } from "./extras";
import { useDeveloperTools } from "./devtools";
import { SettingsLayout } from "./parts";

const GROUP_TITLES: Record<Group, string> = {
  "first-run": "First run",
  home: "Home and sessions",
  practice: "Practice",
  results: "Results and mock",
  stories: "Stories",
  applications: "Applications",
  settings: "Progress, settings and feedback",
  states: "Other states",
};

export default function SettingsDeveloper() {
  const on = useDeveloperTools();

  if (!on) {
    return (
      <SettingsLayout active="settings-developer">
        <section className="e-card" style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span className="e-h2">Developer</span>
          <span className="e-meta">Developer tools are off. Turn them on under "Show developer tools" in About.</span>
          <Link to="settings-about" className="e-btn e-btn-line e-btn-sm" style={{ alignSelf: "flex-start" }}>Go to About</Link>
        </section>
      </SettingsLayout>
    );
  }

  // The route list comes from the manifest plus this group's own extras. The registry would be circular.
  const screens = [...manifest, ...extras];
  const groups = screens.map((s) => s.group).filter((g, i, all) => all.indexOf(g) === i);

  return (
    <SettingsLayout active="settings-developer">
      <div style={{ flex: "999 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "10px" }}>
            <span className="e-h2">Developer</span>
            <span className="e-meta">For building and testing Ensayo. Hidden unless turned on in About.</span>
          </div>
          <div className="e-rowline">
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Setup check<span className="e-small">The engine check from the first milestone.</span>
            </span>
            <Link to="m0" className="e-btn e-btn-line e-btn-sm">Open</Link>
          </div>
          <div className="e-rowline" style={{ borderBottom: "none" }}>
            <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
              Labelling each check by hand, and the eval report<span className="e-small">Arrives in a later milestone.</span>
            </span>
            <span className="e-badge">Coming later</span>
          </div>
        </section>
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span className="e-h3">Every screen</span>
            <span className="e-meta">{screens.length} screens. Pick one to open it.</span>
          </div>
          {groups.map((g) => (
            <div key={g} style={{ display: "flex", flexDirection: "column" }}>
              <span className="e-label" style={{ paddingBottom: "4px" }}>{GROUP_TITLES[g]}</span>
              {screens
                .filter((s) => s.group === g)
                .map((s, i, list) => (
                  <Link key={s.id} to={s.id} className="e-rowline" style={{ padding: "10px 0", textDecoration: "none", color: "var(--e-ink)", ...(i === list.length - 1 ? { borderBottom: "none" } : {}) }}>
                    <span style={{ flex: "1" }}>{s.title}</span>
                    <span className="e-small">{s.id}</span>
                    <span className="e-small" style={{ width: "16px" }}>›</span>
                  </Link>
                ))}
            </div>
          ))}
        </section>
      </div>
    </SettingsLayout>
  );
}
