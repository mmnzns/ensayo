// Profile: who you are and what you're going for. Your name and focus habits, then every target. These change as a
// search moves along, so they live apart from Settings, which is how the app itself behaves.
import AppShell from "../../ui/AppShell";
import { TargetsSection } from "./SettingsTargets";
import { YouSection } from "./SettingsYou";

export default function Profile() {
  return (
    <AppShell nav="profile">
      <h1 className="e-h1">Profile</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: "28px", maxWidth: "980px" }}>
        <YouSection />
        <TargetsSection />
      </div>
    </AppShell>
  );
}
