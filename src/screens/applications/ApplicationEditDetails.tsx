// Draft generated from Design/screens/html/6-4-application-edit-details.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";

export default function ApplicationEditDetails() {
  return (
    <AppShell nav="applications">
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Link to="6-3-application-overview" className="e-small" style={{ textDecoration: "none" }}>‹ Kestrel Pay</Link>
        <h1 className="e-h1">Edit details</h1>
        <span className="e-meta">Fix anything that was read wrong or has changed. What you edit here is never overwritten when Ensayo reads the posting or resume again.</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <span className="e-h3">The job</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
              <div className="e-field">
                <label htmlFor="co">Company</label>
                <input id="co" className="e-input" defaultValue="Kestrel Pay" />
              </div>
              <div className="e-field">
                <label htmlFor="ro">Role</label>
                <input id="ro" className="e-input" defaultValue="Senior Lifecycle Marketing Manager" />
                <span className="e-small" style={{ color: "var(--e-primary-dark)" }}>Edited by you · was "Sr. Lifecycle Mktg Mgr"</span>
              </div>
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
              <label className="e-field" style={{ justifyContent: "flex-end", cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "48px" }}>
                  <input type="checkbox" className="e-check" defaultChecked />
                  <span style={{ fontSize: "15px" }}>Startup or founder-led</span>
                </span>
              </label>
            </div>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <span className="e-h3">Contact</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
              <div className="e-field">
                <label htmlFor="cn">Name</label>
                <input id="cn" className="e-input" defaultValue="Priya Nair" />
              </div>
              <div className="e-field">
                <label htmlFor="cr">Their role</label>
                <input id="cr" className="e-input" defaultValue="Talent partner" />
              </div>
              <div className="e-field">
                <label htmlFor="ce">Email or phone</label>
                <input id="ce" className="e-input" defaultValue="priya@kestrelpay.example" />
              </div>
              <div className="e-field">
                <label htmlFor="cnn">About them</label>
                <input id="cnn" className="e-input" defaultValue="Sets up every round" />
              </div>
            </div>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ alignSelf: "flex-start", paddingLeft: "0" }}>+ Add another contact</button>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="e-field">
              <label htmlFor="nt">Notes</label>
              <textarea id="nt" className="e-input" rows={3} defaultValue={"Hiring manager is Marco, Head of Growth. Moved from Thursday to Friday."} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600" }}>Job posting</span>
                <span className="e-small">Pasted Oct 9 · changing it asks whether to read it again</span>
              </span>
              <button type="button" className="e-btn e-btn-line e-btn-sm">Edit posting text</button>
            </div>
          </section>
        </div>
        <section className="e-card" style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span className="e-h3">Interview stages</span>
          <span className="e-meta" style={{ paddingBottom: "6px" }}>Rename, reorder and change dates as things move.</span>
          <div className="e-rowline" style={{ padding: "12px 0", flexWrap: "wrap" }}>
            <span className="e-small" aria-hidden="true" style={{ cursor: "grab" }}>⋮⋮</span>
            <input className="e-input" style={{ flex: "1 1 160px", minHeight: "40px", padding: "8px 10px", fontSize: "15px", fontWeight: "600" }} defaultValue="Recruiter" aria-label="Stage name" />
            <input className="e-input" style={{ width: "120px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} defaultValue="Oct 14" placeholder="Date" aria-label="Recruiter date" />
            <input className="e-input" style={{ width: "96px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} defaultValue="10:00 AM" placeholder="Time" aria-label="Recruiter time" />
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Remove Recruiter" style={{ minHeight: "40px", padding: "8px" }}>✕</button>
          </div>
          <div className="e-rowline" style={{ padding: "12px 0", flexWrap: "wrap" }}>
            <span className="e-small" aria-hidden="true" style={{ cursor: "grab" }}>⋮⋮</span>
            <input className="e-input" style={{ flex: "1 1 160px", minHeight: "40px", padding: "8px 10px", fontSize: "15px", fontWeight: "600" }} defaultValue="Hiring manager" aria-label="Stage name" />
            <input className="e-input" style={{ width: "120px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} defaultValue="Oct 23" placeholder="Date" aria-label="Hiring manager date" />
            <input className="e-input" style={{ width: "96px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} defaultValue="2:00 PM" placeholder="Time" aria-label="Hiring manager time" />
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Remove Hiring manager" style={{ minHeight: "40px", padding: "8px" }}>✕</button>
            <span className="e-small" style={{ flex: "1 1 100%", paddingLeft: "26px", color: "var(--e-warn-ink)" }}>Moved from Oct 22. Your night-before reminder moved with it.</span>
          </div>
          <div className="e-rowline" style={{ padding: "12px 0", flexWrap: "wrap" }}>
            <span className="e-small" aria-hidden="true" style={{ cursor: "grab" }}>⋮⋮</span>
            <input className="e-input" style={{ flex: "1 1 160px", minHeight: "40px", padding: "8px 10px", fontSize: "15px", fontWeight: "600" }} defaultValue="Panel" aria-label="Stage name" />
            <input className="e-input" style={{ width: "120px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} defaultValue="" placeholder="Date" aria-label="Panel date" />
            <input className="e-input" style={{ width: "96px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} defaultValue="" placeholder="Time" aria-label="Panel time" />
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Remove Panel" style={{ minHeight: "40px", padding: "8px" }}>✕</button>
          </div>
          <div className="e-rowline" style={{ padding: "12px 0", flexWrap: "wrap", borderBottom: "none" }}>
            <span className="e-small" aria-hidden="true" style={{ cursor: "grab" }}>⋮⋮</span>
            <input className="e-input" style={{ flex: "1 1 160px", minHeight: "40px", padding: "8px 10px", fontSize: "15px", fontWeight: "600" }} defaultValue="Leadership" aria-label="Stage name" />
            <input className="e-input" style={{ width: "120px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} defaultValue="" placeholder="Date" aria-label="Leadership date" />
            <input className="e-input" style={{ width: "96px", minHeight: "40px", padding: "8px 10px", fontSize: "14px" }} defaultValue="" placeholder="Time" aria-label="Leadership time" />
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Remove Leadership" style={{ minHeight: "40px", padding: "8px" }}>✕</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", paddingTop: "8px" }}>
            <span className="e-small" style={{ width: "100%" }}>Add a stage</span>
            <button type="button" className="e-chip" style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px" }}>+ Technical</button>
            <button type="button" className="e-chip" style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px" }}>+ Panel</button>
            <button type="button" className="e-chip" style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px" }}>+ Hiring manager</button>
          </div>
          <span className="e-small" style={{ paddingTop: "10px" }}>Removing a stage you've practiced keeps those sessions in your history.</span>
        </section>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
        <button type="button" className="e-btn e-btn-danger e-btn-sm">Delete application</button>
        <span style={{ flex: "1" }} />
        <Link to="6-3-application-overview" className="e-btn e-btn-ghost">Cancel</Link>
        <Link to="6-3-application-overview" className="e-btn e-btn-primary e-btn-big">Save changes</Link>
      </div>
    </AppShell>
  );
}
