import type { ReactNode } from "react";
import FocusShell from "../../ui/FocusShell";
import { go } from "../../ui/router";

/** Close, Cancel and every confirm button end here. Falls back to Home when the screen was opened directly. */
export function goBack() {
  if (window.history.length > 1) window.history.back();
  else go("2-1-home");
}

/**
 * The route for a dialog: a calm neutral page with a small "Preview" label, so the dialog can be seen and clicked on its own.
 * Later milestones mount the dialog itself over the real screen instead.
 */
export default function PreviewStage({ children }: { children: ReactNode }) {
  return (
    <FocusShell>
      <span className="e-pill" style={{ position: "fixed", top: "16px", left: "16px", zIndex: 60, fontWeight: 600, boxShadow: "inset 0 0 0 1px var(--e-line)" }} title="This page only shows the dialog. In the app it opens over the screen you are on.">
        Preview
      </span>
      <div aria-hidden="true" className="e-narrow" style={{ width: "100%", paddingTop: "56px", opacity: 0.6 }}>
        <div style={{ height: "28px", width: "42%", borderRadius: "10px", background: "var(--e-line)" }} />
        <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ height: "14px", width: "88%", borderRadius: "8px", background: "var(--e-line)" }} />
          <div style={{ height: "14px", width: "72%", borderRadius: "8px", background: "var(--e-line)" }} />
          <div style={{ height: "14px", width: "80%", borderRadius: "8px", background: "var(--e-line)" }} />
        </div>
        <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ height: "14px", width: "64%", borderRadius: "8px", background: "var(--e-line)" }} />
          <div style={{ height: "14px", width: "84%", borderRadius: "8px", background: "var(--e-line)" }} />
        </div>
      </div>
      {children}
    </FocusShell>
  );
}
