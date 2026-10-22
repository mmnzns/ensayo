import { DataProvider } from "./data/real";
import M0Check from "./m0/M0Check";
import NotFound from "./screens/NotFound";
import { registry } from "./screens/registry";
import { applyStoredTheme } from "./screens/settings/theme";
import { useRoute } from "./ui/router";

// Appearance (Settings › Practice): Auto unless the user chose Light or Dark.
applyStoredTheme();

/** First-run until the profile is set up, then Home. M1 has no real profile yet, so "" opens Home. */
const HOME = "2-1-home";

export default function App() {
  const route = useRoute();
  const id = route === "" ? HOME : route;
  const Screen = id === "m0" ? M0Check : registry[id];
  return <DataProvider>{Screen ? <Screen /> : <NotFound id={id} />}</DataProvider>;
}
