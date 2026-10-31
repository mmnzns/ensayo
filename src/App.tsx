import { useEffect } from "react";
import { DataProvider, useNeedsSetup, useTargetsNotePending } from "./data/real";
import { UpgradeNoteDialog } from "./screens/first-run/UpgradeNote";
import { manifest } from "./screens/manifest";
import M0Check from "./m0/M0Check";
import NotFound from "./screens/NotFound";
import { registry } from "./screens/registry";
import { applyStoredTheme } from "./screens/settings/theme";
import { listenForCardNotes } from "./ui/cardNote";
import { useRoute } from "./ui/router";

// Appearance (Settings › General): Auto unless the user chose Light or Dark.
applyStoredTheme();

/** First-run until the profile is set up, then Home. M1 has no real profile yet, so "" opens Home. */
const HOME = "2-1-home";

/** Screens that make sense before a profile exists: the setup steps, Settings and the error pages. */
const BEFORE_SETUP = new Set(manifest.filter((m) => m.group === "first-run" || m.group === "settings" || m.group === "states").map((m) => m.id));

function Routed() {
  const route = useRoute();
  const needsSetup = useNeedsSetup();
  // Until a profile is saved, anything but the setup flow starts the setup flow.
  const id = needsSetup && route !== "m0" && !BEFORE_SETUP.has(route) && !/^(states|first-run|settings)-/.test(route) ? "1-1-welcome" : route === "" ? HOME : route;
  const Screen = id === "m0" ? M0Check : registry[id];
  // After the upgrade that adds targets, a one-time note opens over Home (never over practice or another screen).
  const note = useTargetsNotePending() && !needsSetup && id === "2-1-home";
  return (
    <>
      {Screen ? <Screen /> : <NotFound id={id} />}
      {note && <UpgradeNoteDialog />}
    </>
  );
}

export default function App() {
  // The backend says once when the graphics card didn't work and the processor was used instead.
  useEffect(() => listenForCardNotes(), []);
  return (
    <DataProvider>
      <Routed />
    </DataProvider>
  );
}
