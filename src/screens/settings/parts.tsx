// Pieces shared by the Settings screens: the sidebar inside Settings, and a few small controls.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { useDeveloperTools } from "./devtools";

const SECTIONS: { to: string; label: string }[] = [
  { to: "8-1-settings-profile", label: "Profile" },
  { to: "8-2-settings-practice", label: "Practice" },
  { to: "8-3-settings-voice", label: "Voice" },
  { to: "8-4-settings-speech", label: "Speech" },
  { to: "8-5-settings-ai", label: "AI" },
  { to: "8-6-settings-privacy", label: "Privacy" },
  { to: "8-7-settings-check-setup", label: "Check setup" },
  { to: "settings-about", label: "About" },
];

/** The Settings page frame: title, the sidebar of sections, and the page itself beside it. Developer shows only when turned on. */
export function SettingsLayout({ active, children }: { active: string; children: ReactNode }) {
  const developer = useDeveloperTools();
  const items = developer ? [...SECTIONS, { to: "settings-developer", label: "Developer" }] : SECTIONS;
  return (
    <AppShell nav="settings">
      <h1 className="e-h1">Settings</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "28px", alignItems: "flex-start" }}>
        <nav style={{ flex: "1 1 170px", maxWidth: "200px", display: "flex", flexDirection: "column", gap: "2px" }} aria-label="Settings sections">
          {items.map((i) =>
            i.to === active ? (
              <Link key={i.to} to={i.to} className="e-nav e-nav-on" aria-current="page">
                {i.label}
              </Link>
            ) : (
              <Link key={i.to} to={i.to} className="e-nav">
                {i.label}
              </Link>
            ),
          )}
        </nav>
        {children}
      </div>
    </AppShell>
  );
}

export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/** A label with a small line under it, as on most Settings rows. */
export function RowText({ title, hint, style }: { title: ReactNode; hint?: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px", ...style }}>
      {title}
      {hint ? <span className="e-small">{hint}</span> : null}
    </span>
  );
}

/** A row with a checkbox on the right. */
export function ToggleRow({ title, hint, checked, onChange, last, disabled }: { title: ReactNode; hint?: ReactNode; checked: boolean; onChange: (on: boolean) => void; last?: boolean; disabled?: boolean }) {
  return (
    <label className="e-rowline" style={{ cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, ...(last ? { borderBottom: "none" } : {}) }}>
      {hint ? <RowText title={title} hint={hint} /> : <span style={{ flex: "1" }}>{title}</span>}
      <input type="checkbox" className="e-check" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** A group of chips where one is on. */
export function ChipChoice<T extends string | number>({ options, value, onChange, gap = "6px", label }: { options: T[]; value: T; onChange: (v: T) => void; gap?: string; label?: string }) {
  return (
    <div style={{ display: "flex", gap }} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o)} type="button" className={o === value ? "e-chip e-chip-on" : "e-chip"} aria-pressed={o === value} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** setTimeout that is cleared when the screen goes away. */
export function useLater() {
  const ids = useRef<number[]>([]);
  useEffect(
    () => () => {
      ids.current.forEach((id) => window.clearTimeout(id));
      ids.current = [];
    },
    [],
  );
  return useCallback((fn: () => void, ms: number) => {
    ids.current.push(window.setTimeout(fn, ms));
  }, []);
}

export type KeyStatus = "testing" | "ok" | "bad";

/** What pressing Test on a key field says. M1 does not call anyone: an empty or very short key fails, anything else works. */
export function useKeyTests(initial: Record<string, KeyStatus> = {}) {
  const [status, setStatus] = useState<Record<string, KeyStatus>>(initial);
  const later = useLater();
  const test = (id: string, key: string) => {
    setStatus((s) => ({ ...s, [id]: "testing" }));
    later(() => setStatus((s) => ({ ...s, [id]: key.trim().length >= 12 ? "ok" : "bad" })), 900);
  };
  const clear = (id: string) =>
    setStatus((s) => {
      if (!(id in s)) return s;
      const { [id]: _gone, ...rest } = s;
      return rest;
    });
  return { status, test, clear };
}

/** The line under a key field after Test. */
export function KeyResult({ status, empty }: { status: KeyStatus | undefined; empty?: boolean }) {
  if (!status) return null;
  if (status === "testing") return <span className="e-meta" role="status">Testing…</span>;
  if (status === "bad")
    return (
      <span className="e-meta" role="status" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--e-ink)" }}>
        {empty ? "Paste a key first." : "That key didn't work. Check it and try again."}
      </span>
    );
  return (
    <span className="e-meta" role="status" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--e-primary-dark)" }}>
      <CheckIcon />
      Works. Kept in your system's secure key storage.
    </span>
  );
}
