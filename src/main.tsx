import "./styles/tokens.css";
import "./styles/ensayo.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { startErrorLogging } from "./data/diagnostics";
import { readPrefs } from "./screens/settings/prefs";
import { noteSpeechModelUse } from "./screens/settings/speechUse";

// Errors in this window go to the app's log file (Settings › About › Show log folder).
startErrorLogging();

// Ensayo says which speech model it uses, so another app deleting it leaves it alone.
noteSpeechModelUse(readPrefs().speech.model);

// Dev preview only: `?live=fake` runs the real practice loop against a stand-in for the Rust commands.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("live")) {
  const { fakeApi } = await import("./practice/fakeApi");
  const { setRepApi } = await import("./practice/live");
  setRepApi(fakeApi());
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
