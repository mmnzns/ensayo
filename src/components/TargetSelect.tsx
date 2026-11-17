import { useEffect, useId, useRef, useState } from "react";
import type { Target } from "../data/types";
import { TargetMark } from "../screens/applications/TargetMark";
import { NEW_TARGET_LABEL, newTargetProblem, stepIndex, targetChoices } from "../screens/applications/targetPick";

const panel = { position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 20, margin: 0, padding: "6px", listStyle: "none", background: "var(--e-surface)", border: "1.5px solid var(--e-line)", borderRadius: "14px", boxShadow: "0 8px 24px rgba(0,0,0,0.14)", maxHeight: "280px", overflowY: "auto", boxSizing: "border-box" } as const;

const nameOf = (t: Target) => (t.archived ? `${t.name} (archived)` : t.name);

/** The list itself: one line per target with its colour dot, then "New target…". Shown only while the dropdown is open. */
export function TargetOptions({ id, list, value, active, onPick, onNew }: { id: string; list: Target[]; value: string; active: number; onPick: (t: Target) => void; onNew: () => void }) {
  const line = (on: boolean, selected: boolean) => ({ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", cursor: "pointer", minHeight: "40px", boxSizing: "border-box" as const, fontWeight: selected ? 600 : 400, background: on ? "var(--e-tint)" : "transparent", color: "var(--e-ink)" });
  return (
    <ul role="listbox" id={id} aria-label="Target" style={panel}>
      {list.map((t, i) => (
        <li key={t.id} id={`${id}-${i}`} role="option" aria-selected={t.id === value} style={line(i === active, t.id === value)} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(t)}>
          <TargetMark target={t} size={10} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(t)}</span>
          {t.id === value && <span aria-hidden="true">✓</span>}
        </li>
      ))}
      <li id={`${id}-${list.length}`} role="option" aria-selected={false} style={{ ...line(active === list.length, false), borderTop: "1px solid var(--e-line)", borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: "4px", color: "var(--e-primary-dark)", fontWeight: 600 }} onMouseDown={(e) => e.preventDefault()} onClick={onNew}>
        {NEW_TARGET_LABEL}
      </li>
    </ul>
  );
}

/** The target dropdown on New application and Edit details. It is a small custom listbox, not a native select, because a
 *  native one cannot show the colour dots. Keys: arrows, Home and End move, Enter or Space picks, Escape closes; a click
 *  outside closes it. "New target…" opens a name field right under it and makes the target in place, so nothing typed on
 *  the page is lost, then picks it. */
export default function TargetSelect({ targets, activeId, value, onChange, onCreate, keep }: { targets: Target[]; activeId: string | null | undefined; value: string; onChange: (id: string) => void; onCreate: (name: string) => Promise<string>; keep?: string }) {
  const uid = useId();
  const listId = `${uid}-list`;
  const list = targetChoices(targets, activeId, keep);
  const current = list.find((t) => t.id === value);
  const wrap = useRef<HTMLDivElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  useEffect(() => {
    if (making) nameField.current?.focus();
  }, [making]);

  const show = () => {
    setActive(Math.max(0, list.findIndex((t) => t.id === value)));
    setOpen(true);
  };
  const pick = (t: Target) => {
    setOpen(false);
    onChange(t.id);
  };
  const startNew = () => {
    setOpen(false);
    setMaking(true);
    setProblem("");
  };
  const choose = (i: number) => (i >= list.length ? startNew() : pick(list[i]));

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (e.key === "Tab") return setOpen(false);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      if (!open) return show();
      return setActive(stepIndex(active, e.key, list.length + 1));
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) choose(active);
      else show();
    }
  };

  const create = async () => {
    if (busy) return;
    const why = newTargetProblem(name, targets);
    if (why) return setProblem(why);
    setBusy(true);
    setProblem("");
    try {
      const id = await onCreate(name.trim());
      onChange(id);
      setMaking(false);
      setName("");
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : "Ensayo couldn't make this target. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>
      <div ref={wrap} style={{ position: "relative", minWidth: 0 }}>
        <button
          type="button"
          className="e-input"
          role="combobox"
          aria-label="Target"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          style={{ display: "flex", alignItems: "center", gap: "10px", textAlign: "left", cursor: "pointer" }}
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={keys}
        >
          <TargetMark target={current} size={10} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current ? nameOf(current) : "Pick a target"}</span>
          <span aria-hidden="true" style={{ flex: "none", fontSize: "11px", color: "var(--e-muted)" }}>▾</span>
        </button>
        {open && <TargetOptions id={listId} list={list} value={value} active={active} onPick={pick} onNew={startNew} />}
      </div>
      {making && (
        <div className="e-soft" role="group" aria-label="New target" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px 16px" }}>
          <label htmlFor={`${uid}-name`} className="e-small">Name the new target</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            <input
              id={`${uid}-name`}
              ref={nameField}
              className="e-input"
              style={{ flex: "1 1 180px", minWidth: 0 }}
              value={name}
              placeholder="B2B growth"
              onChange={(e) => {
                setName(e.target.value);
                setProblem("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void create();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMaking(false);
                }
              }}
            />
            <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy} onClick={() => void create()}>{busy ? "Making" : "Create"}</button>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => { setMaking(false); setProblem(""); }}>Cancel</button>
          </div>
          {problem && <span role="alert" className="e-small" style={{ color: "var(--e-danger)" }}>{problem}</span>}
          <span className="e-small">Ensayo uses the role you typed. Fill in the rest under Profile when you have a minute.</span>
        </div>
      )}
    </div>
  );
}
