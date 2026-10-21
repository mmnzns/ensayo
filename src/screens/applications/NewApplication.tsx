// Draft generated from Design/screens/html/6-2-new-application.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function NewApplication() {
  return (
    <AppShell nav="applications">
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Link to="6-1-applications" className="e-small" style={{ textDecoration: "none" }}>‹ Applications</Link>
        <h1 className="e-h1">New application</h1>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
            <div className="e-field">
              <label htmlFor="co">Company</label>
              <input id="co" className="e-input" defaultValue="Kestrel Pay" />
            </div>
            <div className="e-field">
              <label htmlFor="ro">Role</label>
              <input id="ro" className="e-input" defaultValue="Senior Lifecycle Marketing Manager" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px" }}>
            <div className="e-field">
              <label htmlFor="st">Where it stands</label>
              <select id="st" className="e-input" defaultValue="Interviewing">
                <option>Applied</option>
                <option>Screening</option>
                <option>Interviewing</option>
                <option>Offer</option>
                <option>Closed</option>
              </select>
            </div>
            <div className="e-field">
              <label htmlFor="ap">Date applied</label>
              <input id="ap" className="e-input" defaultValue="Oct 6" />
            </div>
            <div className="e-field">
              <label htmlFor="sr">Found it on</label>
              <input id="sr" className="e-input" defaultValue="Company site" />
            </div>
          </div>
          <div className="e-field">
            <label htmlFor="ct">
              Contact <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>· optional</span>
            </label>
            <input id="ct" className="e-input" defaultValue="Priya, recruiter" />
          </div>
          <div className="e-field">
            <span style={{ fontSize: "14px", fontWeight: "600" }}>The resume you sent</span>
            <div className="e-soft" style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--e-surface)", boxShadow: "inset 0 0 0 1.5px var(--e-primary)" }}>
              <span style={{ width: "44px", height: "52px", borderRadius: "8px", background: "var(--e-tint)", color: "var(--e-primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: "11px", fontWeight: "700" }}>PDF</span>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontWeight: "600" }}>Dana Ortiz, Resume, Kestrel.pdf</span>
                <span className="e-small">2 pages · read on this computer after you save</span>
              </span>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm">Replace</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }}>Use one from another application</button>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm">I didn't send one</button>
            </div>
            <span className="e-small">Attach the exact file you submitted. Ensayo reads it so your answers match what they saw. It never edits it.</span>
          </div>
          <div className="e-field">
            <label htmlFor="jd">
              Job posting <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>· can wait until they call</span>
            </label>
            <textarea id="jd" className="e-input" rows={5} defaultValue={"About the role: Kestrel Pay is a 40-person, founder-led payments startup. You'll own lifecycle end to end, from first signup to the tenth payment, with no ops team behind you. You'll build the journeys, run the experiments, and report on activation and early retention to the founders every week..."} />
            <span className="e-small">Paste the whole thing. It stays on this computer except for the summary your AI engine reads.</span>
          </div>
          <label className="e-soft" style={{ display: "flex", alignItems: "flex-start", gap: "14px", cursor: "pointer" }}>
            <input type="checkbox" className="e-check" defaultChecked style={{ marginTop: "2px" }} />
            <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="e-h3">Startup or founder-led</span>
              <span className="e-meta">The leadership stage adds the questions founders ask: are you all in, and will you run it yourself or just build it.</span>
            </span>
          </label>
        </section>
        <section className="e-card" style={{ flex: "1 1 340px", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span className="e-h3">Their interview stages</span>
          <span className="e-meta">In the order you'll meet them. Drag to reorder. Add dates as you get them.</span>
          <div className="e-rowline" style={{ padding: "12px 0" }}>
            <span className="e-small" aria-hidden="true" style={{ cursor: "grab" }}>⋮⋮</span>
            <span style={{ flex: "1", fontWeight: "600" }}>Recruiter</span>
            <input className="e-input" style={{ width: "130px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} defaultValue="Oct 14" aria-label="Recruiter date" />
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Remove Recruiter" style={{ minHeight: "40px", padding: "8px" }}>✕</button>
          </div>
          <div className="e-rowline" style={{ padding: "12px 0" }}>
            <span className="e-small" aria-hidden="true" style={{ cursor: "grab" }}>⋮⋮</span>
            <span style={{ flex: "1", fontWeight: "600" }}>Hiring manager</span>
            <input className="e-input" style={{ width: "130px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} defaultValue="Oct 23, 2 PM" aria-label="Hiring manager date" />
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Remove Hiring manager" style={{ minHeight: "40px", padding: "8px" }}>✕</button>
          </div>
          <div className="e-rowline" style={{ padding: "12px 0" }}>
            <span className="e-small" aria-hidden="true" style={{ cursor: "grab" }}>⋮⋮</span>
            <span style={{ flex: "1", fontWeight: "600" }}>Panel</span>
            <input className="e-input" style={{ width: "130px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} placeholder="Date" aria-label="Panel date" />
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Remove Panel" style={{ minHeight: "40px", padding: "8px" }}>✕</button>
          </div>
          <div className="e-rowline" style={{ padding: "12px 0" }}>
            <span className="e-small" aria-hidden="true" style={{ cursor: "grab" }}>⋮⋮</span>
            <span style={{ flex: "1", fontWeight: "600" }}>Leadership</span>
            <input className="e-input" style={{ width: "130px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} placeholder="Date" aria-label="Leadership date" />
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Remove Leadership" style={{ minHeight: "40px", padding: "8px" }}>✕</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", paddingTop: "6px" }}>
            <span className="e-small" style={{ width: "100%" }}>Add a stage</span>
            <button type="button" className="e-chip" style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px" }}>+ Technical</button>
            <button type="button" className="e-chip" style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px" }}>+ Panel</button>
            <button type="button" className="e-chip" style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px" }}>+ Hiring manager</button>
          </div>
        </section>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
        <Link to="6-1-applications" className="e-btn e-btn-ghost">Cancel</Link>
        <Link to="6-3-application-overview" className="e-btn e-btn-primary e-btn-big">Save and read both</Link>
      </div>
    </AppShell>
  );
}
