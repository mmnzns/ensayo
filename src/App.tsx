import { mockStore } from "./data/mock";
import { StoreProvider } from "./data/store";
import M0Check from "./m0/M0Check";
import NotFound from "./screens/NotFound";
import { registry } from "./screens/registry";
import { useRoute } from "./ui/router";

/** First-run until the profile is set up, then Home. M1 has no real profile yet, so "" opens Home. */
const HOME = "2-1-home";

export default function App() {
  const route = useRoute();
  const id = route === "" ? HOME : route;
  const Screen = id === "m0" ? M0Check : registry[id];
  return <StoreProvider store={mockStore}>{Screen ? <Screen /> : <NotFound id={id} />}</StoreProvider>;
}
