import type { ReactNode } from "react";
import { useStore } from "../data/store";
import { ApplicationsIcon, FeedbackIcon, HomeIcon, ProgressIcon, SettingsIcon, StoriesIcon } from "./Icons";
import Link from "./Link";
import TargetSwitcher from "./TargetSwitcher";
import Wordmark from "./Wordmark";

export type NavId = "home" | "stories" | "applications" | "progress" | "settings" | "feedback";

const ITEMS: { id: NavId; to: string; label: string; icon: ReactNode }[] = [
  { id: "home", to: "2-1-home", label: "Home", icon: <HomeIcon /> },
  { id: "stories", to: "5-1-stories", label: "Stories", icon: <StoriesIcon /> },
  { id: "applications", to: "6-1-applications", label: "Applications", icon: <ApplicationsIcon /> },
  { id: "progress", to: "7-1-progress-habits", label: "Progress", icon: <ProgressIcon /> },
  { id: "settings", to: "8-1-settings-you", label: "Settings", icon: <SettingsIcon /> },
  { id: "feedback", to: "9-1-feedback", label: "Feedback", icon: <FeedbackIcon /> },
];

export default function Sidebar({ active }: { active: NavId }) {
  const { engine } = useStore();
  return (
    <nav className="e-side" aria-label="Main">
      <Link to="2-1-home" className="e-brand" aria-label="Ensayo home">
        <Wordmark size={26} />
      </Link>
      <TargetSwitcher />
      {ITEMS.map((i) => (
        <Link key={i.id} to={i.to} className={i.id === active ? "e-nav e-nav-on" : "e-nav"} aria-current={i.id === active ? "page" : undefined}>
          {i.icon}
          {i.label}
        </Link>
      ))}
      <span style={{ flex: 1 }} />
      <Link
        to="https://buymeacoffee.com/mnmnzns"
        title="Opens in your browser"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", margin: "6px 12px 2px", background: "#FFDD00", color: "#000000", border: "1px solid #000000", borderRadius: 999, padding: "5px 12px", fontFamily: "'Poppins', sans-serif", fontSize: "12.5px", fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" fill="#FFFFFF" />
          <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
        </svg>
        Buy me a coffee
      </Link>
      <Link to="8-5-settings-ai" className="e-pill" style={{ alignSelf: "flex-start", margin: "8px 12px 0", textDecoration: "none" }}>
        <span className="e-dot" style={{ width: 8, height: 8 }} />
        {engine.label}
        {engine.offline ? " · offline" : ""}
      </Link>
    </nav>
  );
}
