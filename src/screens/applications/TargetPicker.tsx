import { pickableTargets } from "../../data/targets";
import type { Target } from "../../data/types";
import { TargetMark } from "./TargetMark";

/** The target chips on New application and Edit details: one is on, the active target comes first. */
export default function TargetPicker({ targets, activeId, value, onChange, keep }: { targets: Target[]; activeId: string | null | undefined; value: string; onChange: (id: string) => void; keep?: string }) {
  // An archived target an application is still filed under stays in the row so it can be seen; it cannot be picked for new ones.
  const list = [...pickableTargets(targets, activeId), ...targets.filter((t) => t.archived && t.id === keep)];
  return (
    <div role="group" aria-label="Target" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {list.map((t) => (
        <button key={t.id} type="button" className={t.id === value ? "e-chip e-chip-on" : "e-chip"} aria-pressed={t.id === value} onClick={() => onChange(t.id)}>
          <TargetMark target={t} />
          {t.archived ? `${t.name} (archived)` : t.name}
        </button>
      ))}
    </div>
  );
}
