import { useRef } from "react";
import { liveText, phaseText, useUpdate } from "../data/updates";

/**
 * "Ensayo {version} is ready", a strip at the top of the page in the app shell. Update now installs and restarts;
 * Later hides it for this version until the next start (Settings › About, See what's new, brings it back). It
 * lives in AppShell only, never in FocusShell, so it can't interrupt a practice answer. In the browser preview
 * there is no updater and nothing shows.
 */
export default function UpdateBanner() {
  const u = useUpdate();
  const banner = useRef<HTMLElement>(null);
  if (!u.available || !u.pending || !u.bannerVisible) return null;
  const busy = u.phase.state === "installing" || u.phase.state === "restarting";
  const progress = phaseText(u.phase);
  const percent = u.phase.state === "installing" ? u.phase.percent : u.phase.state === "restarting" ? 100 : null;
  const title = `Ensayo ${u.pending.version} is ready`;
  const install = () => {
    // The buttons give way to the progress line: keep the focus in the banner.
    banner.current?.focus();
    void u.install();
  };
  return (
    <aside
      ref={banner}
      tabIndex={-1}
      aria-labelledby="update-banner-title"
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 16px", background: "var(--e-tint)", borderRadius: "var(--e-r-md)", padding: "14px 18px", outline: "none" }}
    >
      <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
        {liveText(u.phase) ?? title}
      </span>
      <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
        <span id="update-banner-title" className="e-h3">{title}</span>
        <span className="e-meta" style={u.phase.state === "error" ? { color: "var(--e-danger)" } : undefined}>
          {progress ?? "Update now installs it and restarts Ensayo. Your stories and answers stay as they are."}
        </span>
        {busy && (
          <div aria-hidden="true" style={{ marginTop: "8px", height: "4px", width: "100%", maxWidth: "320px", overflow: "hidden", borderRadius: "999px", background: "var(--e-surface)" }}>
            <div style={{ height: "100%", borderRadius: "999px", background: "var(--e-primary)", width: percent === null ? "33%" : `${percent}%` }} />
          </div>
        )}
      </div>
      {!busy && (
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={u.later}>Later</button>
          <button type="button" className="e-btn e-btn-primary e-btn-sm" onClick={install}>{u.phase.state === "error" ? "Try again" : "Update now"}</button>
        </div>
      )}
    </aside>
  );
}
