import { COLOR_VALUE } from "../../data/targets";
import type { Target } from "../../data/types";

/** The small colour square that goes with a target's name. The five target colours are the one place fixed colours are allowed. */
export function TargetMark({ target, size = 9 }: { target: Pick<Target, "color"> | undefined; size?: number }) {
  if (!target) return null;
  return <span aria-hidden="true" style={{ width: `${size}px`, height: `${size}px`, borderRadius: "3px", background: COLOR_VALUE[target.color], flex: "none", display: "inline-block" }} />;
}

/** The marker and the name, on one line. */
export function TargetLabel({ target, size }: { target: Pick<Target, "color" | "name"> | undefined; size?: number }) {
  if (!target) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <TargetMark target={target} size={size} />
      {target.name}
    </span>
  );
}
