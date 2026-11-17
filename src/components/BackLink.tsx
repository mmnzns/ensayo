import Link from "../ui/Link";

/** The one back link: "← Back to X". `to` is the screen id, `label` is X. It goes through the shared Link, so the
 *  unsaved-edit check still runs. A long label (a company name) is cut with an ellipsis and keeps the full text on hover. */
export default function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="e-back" title={`Back to ${label}`}>
      <span aria-hidden="true">←</span>
      <span className="e-back-text">Back to {label}</span>
    </Link>
  );
}
