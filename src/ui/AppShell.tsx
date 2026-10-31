import type { CSSProperties, ReactNode } from "react";
import UpdateBanner from "./UpdateBanner";
import Sidebar, { type NavId } from "./Sidebar";
import { CardNotes } from "./cardNote";
import { FlashLine } from "./flash";

/** The main window: sidebar on the left, the page on the right, the update banner on top (never in FocusShell). */
export default function AppShell({ nav, children, style, mainStyle }: { nav: NavId; children: ReactNode; style?: CSSProperties; mainStyle?: CSSProperties }) {
  return (
    <div className="e-app" style={{ minHeight: "100vh", ...style }}>
      <Sidebar active={nav} />
      <main className="e-main" style={mainStyle}>
        <UpdateBanner />
        <CardNotes />
        {nav === "home" && <FlashLine />}
        {children}
      </main>
    </div>
  );
}
