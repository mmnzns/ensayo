import type { CSSProperties, ReactNode } from "react";
import Sidebar, { type NavId } from "./Sidebar";

/** The main window: sidebar on the left, the page on the right. */
export default function AppShell({ nav, children, style }: { nav: NavId; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="e-app" style={style}>
      <Sidebar active={nav} />
      <main className="e-main">{children}</main>
    </div>
  );
}
