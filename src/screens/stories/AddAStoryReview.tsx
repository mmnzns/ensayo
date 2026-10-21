import { useState } from "react";
import { useStore } from "../../data/store";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import Numbers, { type NumberRow } from "./Numbers";
import { isBlankReview, pasteDraft } from "./selection";

const WORDS = ["No", "One", "Two"];

export default function AddAStoryReview() {
  const { parsed, missingNotes, goodForOptions } = useStore().screens.stories;
  const blank = isBlankReview();

  const [title, setTitle] = useState(blank ? "" : parsed.title);
  const [company, setCompany] = useState(blank ? "" : pasteDraft.company.trim() || parsed.company);
  const [headline, setHeadline] = useState(blank ? "" : parsed.headline);
  const [context, setContext] = useState(blank ? "" : parsed.context);
  const [approach, setApproach] = useState(blank ? "" : parsed.approach);
  const [action, setAction] = useState(blank ? "" : parsed.action);
  const [ownership, setOwnership] = useState(blank ? "" : parsed.ownership);
  const [result, setResult] = useState(blank ? "" : parsed.result);
  const [numbers, setNumbers] = useState<NumberRow[]>(blank ? [] : parsed.numbers.map((n) => ({ ...n, checked: false })));
  const [goodFor, setGoodFor] = useState<string[]>(blank ? [] : parsed.goodFor);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");

  const approachMissing = approach.trim() === "";
  const ownershipMissing = ownership.trim() === "";
  const missing = Number(approachMissing) + Number(ownershipMissing);
  const addTheme = (t: string) => {
    const v = t.trim();
    if (v && !goodFor.some((g) => g.toLowerCase() === v.toLowerCase())) setGoodFor([...goodFor, v]);
  };
  const options = goodForOptions.filter((o) => !goodFor.some((g) => g.toLowerCase() === o.toLowerCase()));

  return (
    <AppShell nav="stories">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <Link to="5-2-add-a-story-paste" className="e-small" style={{ textDecoration: "none" }}>‹ Back to your text</Link>
          <h1 className="e-h1">{blank ? "Write your story" : "Check what Ensayo found"}</h1>
          <span className="e-meta">
            {missing === 0
              ? "Edit anything. Every part is filled in."
              : `Edit anything. ${WORDS[missing]} ${missing === 1 ? "part is" : "parts are"} missing; you can fill ${missing === 1 ? "it" : "them"} now or later.`}
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="5-1-stories" className="e-btn e-btn-soft">Save</Link>
          <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-primary">Save and practice</Link>
        </div>
      </header>
      <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
          <div className="e-field">
            <label htmlFor="t">Title</label>
            <input id="t" className="e-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="e-field">
            <label htmlFor="c">Company</label>
            <input id="c" className="e-input" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
        </div>
        <div className="e-field">
          <label htmlFor="h">
            Headline <span style={{ fontWeight: "400", color: "var(--e-muted)" }}>· the first sentence you'd say</span>
          </label>
          <textarea id="h" className="e-input" rows={2} value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </div>
        <div className="e-field">
          <label htmlFor="ctx">What was going on</label>
          <textarea id="ctx" className="e-input" rows={2} value={context} onChange={(e) => setContext(e.target.value)} />
        </div>
        <div className="e-field" style={approachMissing ? { background: "var(--e-highlight)", borderRadius: "16px", padding: "18px" } : undefined}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label htmlFor="ap" style={{ flex: "1" }}>What you noticed and decided</label>
            {approachMissing && <span className="e-badge" style={{ background: "var(--e-surface)" }}>Missing</span>}
          </div>
          {approachMissing && <span className="e-meta" style={{ color: "var(--e-warn-ink)" }}>{blank ? missingNotes.approachBlank : missingNotes.approach}</span>}
          <textarea id="ap" className="e-input" rows={2} placeholder="I noticed... so I decided... and I picked ... to prove it." value={approach} onChange={(e) => setApproach(e.target.value)} />
        </div>
        <div className="e-field">
          <label htmlFor="ac">What you did</label>
          <textarea id="ac" className="e-input" rows={2} value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        <div className="e-field" style={ownershipMissing ? { border: "1.5px dashed var(--e-line)", borderRadius: "16px", padding: "16px" } : undefined}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label htmlFor="ow" style={{ flex: "1" }}>What you owned</label>
            {ownershipMissing && <span className="e-badge">Missing</span>}
          </div>
          <input id="ow" className="e-input" placeholder="What was yours, and who else helped?" value={ownership} onChange={(e) => setOwnership(e.target.value)} />
        </div>
        <div className="e-field">
          <label htmlFor="r">What changed</label>
          <textarea id="r" className="e-input" rows={2} value={result} onChange={(e) => setResult(e.target.value)} />
        </div>
      </section>
      <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "6px" }}>
          <span className="e-h3">Numbers</span>
          <span className="e-small">{numbers.length === 0 ? "None yet" : blank ? "Added by you" : "All found in your text"}</span>
        </div>
        <Numbers rows={numbers} setRows={setNumbers} />
        <span className="e-small">Tick each once you're sure it's right. Ensayo will flag it if you ever say a different number.</span>
      </section>
      <section className="e-card" style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span className="e-h3">Good for questions about</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {goodFor.map((g) => (
              <button key={g} type="button" className="e-chip e-chip-on" aria-pressed="true" title="Click to remove" onClick={() => setGoodFor(goodFor.filter((x) => x !== g))}>{g}</button>
            ))}
            <button type="button" className="e-chip" aria-expanded={adding} onClick={() => setAdding(!adding)}>+ Add</button>
          </div>
          {adding && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {options.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {options.map((o) => (
                    <button key={o} type="button" className="e-chip" onClick={() => addTheme(o)}>{o}</button>
                  ))}
                </div>
              )}
              <form
                style={{ display: "flex", gap: "8px" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  addTheme(custom);
                  setCustom("");
                }}
              >
                <input className="e-input" aria-label="Another theme" placeholder="Or type your own" value={custom} onChange={(e) => setCustom(e.target.value)} />
                <button type="submit" className="e-btn e-btn-soft e-btn-sm">Add</button>
              </form>
            </div>
          )}
        </div>
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span className="e-h3">Likely follow-ups</span>
          {blank || parsed.followUps.length === 0 ? (
            <span className="e-meta">None yet. They show up once there is more of your story to ask about.</span>
          ) : (
            parsed.followUps.map((f) => (
              <span key={f.question} className="e-meta">"{f.question}" · {f.angle}</span>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
