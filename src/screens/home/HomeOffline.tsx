import { StoreProvider, useStore } from "../../data/store";
import { HomeView } from "./Home";

/**
 * Home with no connection and no AI engine. The Sidebar reads the engine from the store, so this page hands
 * the page below it a store whose engine is "Timing only" and offline; the notice itself is drawn by HomeView.
 */
export default function HomeOffline() {
  const store = useStore();
  const offlineStore = { ...store, engine: { label: "Timing only", kind: "timing" as const, offline: true } };
  return (
    <StoreProvider store={offlineStore}>
      <HomeView offline />
    </StoreProvider>
  );
}
