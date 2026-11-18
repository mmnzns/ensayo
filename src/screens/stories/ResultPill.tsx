import type { CSSProperties } from "react";

/** A story's headline as a pill. A before and after ("$60 → $22") is tinted and gets a small "Result" in front so it
 *  reads as what changed, not as a warning. */
export default function ResultPill({ headline, style }: { headline: string; style?: CSSProperties }) {
  if (!headline) return null;
  const change = headline.includes("→");
  const pill = (
    <span className="e-pill" title={headline} style={{ fontWeight: "600", minWidth: "0", ...(change ? { background: "var(--e-tint)", color: "var(--e-primary-dark)" } : { background: "var(--e-ground)" }) }}>
      {headline}
    </span>
  );
  if (!change) return <span style={{ alignSelf: "flex-start", display: "inline-flex", minWidth: "0", maxWidth: "100%", ...style }}>{pill}</span>;
  return (
    <span style={{ alignSelf: "flex-start", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", minWidth: "0", maxWidth: "100%", ...style }}>
      <span className="e-small" style={{ flex: "none" }}>Result</span>
      {pill}
    </span>
  );
}
