// "Continue where you left off": the card on Home for a session that was not finished (see practice/resume.ts).
import type { ResumableSession } from "../../practice/live";
import { CONTINUE_TITLE, continueLine } from "../../practice/resume";
import Link from "../../ui/Link";

export default function ContinueCard({ session, companyOf, onContinue }: { session: ResumableSession; companyOf?: (applicationId: string) => string | undefined; onContinue: () => void }) {
  return (
    <section className="e-soft" aria-label={CONTINUE_TITLE} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 20px", padding: "16px 24px" }}>
      <span style={{ flex: "1 1 280px", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
        <span className="e-h3">{CONTINUE_TITLE}</span>
        <span className="e-small">{continueLine(session, companyOf)}</span>
      </span>
      <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary e-btn-sm" style={{ flex: "none" }} onClick={onContinue}>Continue</Link>
    </section>
  );
}
