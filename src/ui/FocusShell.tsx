import type { CSSProperties, ReactNode } from "react";

/** Practice and first run: the whole window, no sidebar. */
export default function FocusShell({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="e-focus" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", ...style }}>
      {children}
    </div>
  );
}
