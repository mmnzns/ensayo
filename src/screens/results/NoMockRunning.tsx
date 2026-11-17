import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";

/** Shown in the app when a Mock screen is opened with no Mock running (an old link, or the frame after ending one). */
export default function NoMockRunning() {
  return (
    <FocusShell>
      <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", textAlign: "center" }}>
        <p className="e-body" style={{ margin: 0 }}>No mock is running.</p>
        <Link to="2-1-home" className="e-btn e-btn-primary">Back home</Link>
      </div>
    </FocusShell>
  );
}
