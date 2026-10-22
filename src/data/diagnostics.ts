/**
 * Diagnostics from the window's side: errors the window hits are sent to the backend log (`log_frontend`), and
 * Settings › About and Feedback ask for the diagnostics text (`diagnostics`) and for the log folder to be shown.
 * The browser preview has no backend, so there is nothing to send and no bridge.
 */
import { invoke } from "@tauri-apps/api/core";

/** The most the backend keeps of one message (message and stack together). Cut here too, so less crosses over. */
export const MAX_LOG_CHARS = 2048;

export interface DiagnosticsBridge {
  log(level: string, message: string, origin: string): Promise<void>;
  text(speechModel: string): Promise<string>;
  reveal(): Promise<void>;
}

const inApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The real bridge, or null in the browser preview. */
export function tauriDiagnostics(): DiagnosticsBridge | null {
  if (!inApp()) return null;
  return {
    log: (level, message, origin) => invoke<void>("log_frontend", { level, message, origin }),
    text: (speechModel) => invoke<string>("diagnostics", { speechModel: speechModel || null }),
    reveal: () => invoke<void>("reveal_logs"),
  };
}

export function clip(text: string, max = MAX_LOG_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

/** An error, a message or anything thrown, as one text: its message, then its stack when it has one. */
export function describeError(value: unknown): string {
  if (value instanceof Error) return clip(value.stack && value.stack.includes(value.message) ? value.stack : `${value.message}\n${value.stack ?? ""}`.trim());
  if (typeof value === "string") return clip(value);
  try {
    return clip(JSON.stringify(value) ?? String(value));
  } catch {
    return clip(String(value));
  }
}

/** The two events an error reaches the window by. A real `Window` fits; tests pass a small stand-in. */
export interface ErrorEvents {
  addEventListener(type: "error", listener: (e: ErrorEvent) => void): void;
  addEventListener(type: "unhandledrejection", listener: (e: PromiseRejectionEvent) => void): void;
}

export type Send = (level: string, message: string, origin: string) => void | Promise<void>;

/** Sends `window.onerror` and unhandled promise rejections to `send`. Returns nothing: it lives as long as the window. */
export function installErrorLogging(target: ErrorEvents, send: Send): void {
  const safely = (level: string, message: string, origin: string) => {
    try {
      void Promise.resolve(send(level, message, origin)).catch(() => {});
    } catch {
      // Logging must never be the thing that breaks.
    }
  };
  target.addEventListener("error", (e) => {
    const where = e.filename ? ` (${e.filename.split("/").pop()}:${e.lineno}:${e.colno})` : "";
    const detail = e.error !== undefined && e.error !== null ? describeError(e.error) : e.message;
    safely("error", clip(`${e.message}${where}\n${detail === e.message ? "" : detail}`.trim()), "window.onerror");
  });
  target.addEventListener("unhandledrejection", (e) => {
    safely("error", describeError(e.reason), "unhandledrejection");
  });
}

/** Called once at launch (main.tsx). In the app it is the real bridge; in the browser preview it does nothing. */
export function startErrorLogging(): void {
  const bridge = tauriDiagnostics();
  if (bridge && typeof window !== "undefined") installErrorLogging(window, bridge.log);
}
