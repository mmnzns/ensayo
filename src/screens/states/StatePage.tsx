import type { CSSProperties, ReactNode } from "react";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import Wordmark from "../../ui/Wordmark";

type IconName = "offline" | "mic" | "download" | "key" | "ear" | "alert";

const ICONS: Record<IconName, ReactNode> = {
  offline: (
    <>
      <path d="M2 8.8a15 15 0 0 1 20 0" />
      <path d="M5.5 12.4a10 10 0 0 1 13 0" />
      <path d="M9 16a5 5 0 0 1 6 0" />
      <path d="M12 19.5h.01" />
      <path d="M3 3l18 18" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 11.5 5.3" />
      <path d="M19 11a7 7 0 0 1-.4 2.3" />
      <path d="M12 18v3" />
      <path d="M3 3l18 18" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9" />
      <path d="M16 7l3 3" />
    </>
  ),
  ear: (
    <>
      <path d="M7 9a5 5 0 0 1 10 0c0 3-2 3.5-2 6a3 3 0 0 1-6 0" />
      <path d="M12 9a1.5 1.5 0 0 1 3 0" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6" />
      <path d="M12 16.5h.01" />
    </>
  ),
};

export interface StatePageProps {
  icon: IconName;
  title: string;
  /** Right side of the header: a quiet link or button. */
  headerAction?: ReactNode;
  /** The header's small labels next to the wordmark. */
  headerLabels?: ReactNode;
  children: ReactNode;
  /** The one clear next action, then any quiet extras. */
  actions: ReactNode;
  cardStyle?: CSSProperties;
}

/** A full focus-shell page for an error or empty state: wordmark header, one card, one clear next action. */
export default function StatePage({ icon, title, headerAction, headerLabels, children, actions, cardStyle }: StatePageProps) {
  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%" }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <Link to="2-1-home" className="e-brand" style={{ padding: "0" }} aria-label="Ensayo home">
              <Wordmark size={24} />
            </Link>
            {headerLabels}
          </div>
          {headerAction ?? <Link to="2-1-home" className="e-btn e-btn-white e-btn-sm">Back home</Link>}
        </header>
      </div>
      <main style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0" }}>
        <section className="e-card" style={{ width: "100%", maxWidth: "560px", padding: "40px", display: "flex", flexDirection: "column", gap: "22px", ...cardStyle }}>
          <span className="e-presence" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--e-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[icon]}
            </svg>
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h1 className="e-h1" style={{ fontSize: "28px" }}>{title}</h1>
            {children}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>{actions}</div>
        </section>
      </main>
    </FocusShell>
  );
}
