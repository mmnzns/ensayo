import "./styles/tokens.css";
import "./styles/ensayo.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { startErrorLogging } from "./data/diagnostics";

// Lets the stylesheet style the scrollbars on Windows only (see ensayo.css).
if (/Windows/.test(navigator.userAgent)) document.documentElement.dataset.os = "windows";

// Errors in this window go to the app's log file (Settings › About › Show log folder).
startErrorLogging();

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
