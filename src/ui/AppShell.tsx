import type { CSSProperties, ReactNode } from "react";
import Sidebar, { type NavId } from "./Sidebar";

/** The main window: sidebar on the left, the page on the right. */
export default function AppShell({ nav, children, style, mainStyle }: { nav: NavId; children: ReactNode; style?: CSSProperties; mainStyle?: CSSProperties }) {
  return (
    <div className="e-app" style={{ minHeight: "100vh", ...style }}>
      <Sidebar active={nav} />
      <main className="e-main" style={mainStyle}>
        {children}
      </main>
    </div>
  );
}
