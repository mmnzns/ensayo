import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

/** The first-run header: wordmark, "Step N of 7" dots, and Skip (omitted on the microphone step, which cannot be skipped). */
export default function StepHeader({ step, skipTo }: { step: number; skipTo?: string }) {
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
      <span className="e-brand" style={{ padding: "0" }} aria-label="Ensayo">
        <Wordmark size={24} />
      </span>
      <div className="e-steps" aria-label={`Step ${step} of 7`}>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className={i < step ? "on" : undefined} />
        ))}
      </div>
      {skipTo ? (
        <Link to={skipTo} className="e-btn e-btn-ghost e-btn-sm">Skip</Link>
      ) : (
        <span style={{ width: "64px" }} />
      )}
    </header>
  );
}
