import { useState } from "react";
import { useActions } from "../../data/real";
import { useStore } from "../../data/store";
import { startQuickDrill } from "../../practice/quick";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import { FIELD_HELP } from "./fieldHelp";
import Numbers, { type NumberRow } from "./Numbers";
import { draftToReview, storyFromReview } from "./parseDraft";
import { getParsedDraft, isBlankReview, isFromSetup, pasteDraft, setFromSetup, setParsedDraft } from "./selection";

const WORDS = ["No", "One", "Two"];

export default function AddAStoryReview() {
  const store = useStore();
  const { parsed, missingNotes, goodForOptions } = store.screens.stories;
  const blank = isBlankReview();
  // In setup the same screen is the last part of "Add one story": back goes to the setup step, saving goes on to the loop card.
  const setup = isFromSetup();
  // In the app the engine's reading of the pasted text; in the browser preview the sample parse.
  const draft = blank ? null : getParsedDraft();
  const review = draft ? draftToReview(draft.story, draft.missing, draft.dropped) : null;

  const first = review ?? (blank ? null : { ...parsed, company: pasteDraft.company.trim() || parsed.company, numbers: parsed.numbers.map((n) => ({ ...n, checked: false })) });
  const [title, setTitle] = useState(first?.title ?? "");
  const [company, setCompany] = useState(first?.company ?? "");
  const [headline, setHeadline] = useState(first?.headline ?? "");
  const [context, setContext] = useState(first?.context ?? "");
  const [approach, setApproach] = useState(first?.approach ?? "");
  const [action, setAction] = useState(first?.action ?? "");
  const [ownership, setOwnership] = useState(first?.ownership ?? "");
  const [result, setResult] = useState(first?.result ?? "");
  const [numbers, setNumbers] = useState<NumberRow[]>(first?.numbers ?? []);
  const [goodFor, setGoodFor] = useState<string[]>(first ? (review ? review.goodFor : parsed.goodFor) : []);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");

  const { saveStory } = useActions();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const save = async (next: string) => {
    setSaving(true);
    setSaveError(false);
    try {
      const saved = await saveStory(storyFromReview(draft?.story ?? null, { title, company, headline, context, approach, action, ownership, result, goodFor }, numbers));
      setParsedDraft(null);
      if (setup) setFromSetup(false);
      // "Save and practice" starts a real Drill on this story (a no-op in the browser preview).
      if (next === "3-1-practice-interviewer-asking") startQuickDrill({ targetRole: store.profile.targetRole, stories: [...store.stories.filter((x) => x.id !== saved.id), saved], methods: store.methods }, { storyId: saved.id });
      go(next);
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  };

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
          <Link to={setup ? "1-7-your-first-story" : "5-2-add-a-story-paste"} className="e-small" style={{ textDecoration: "none" }}>‹ Back to your text</Link>
          <h1 className="e-h1">{blank ? "Write your story" : "Check what Ensayo found"}</h1>
          <span className="e-meta">
            {missing === 0
              ? "Edit anything. Every part is filled in."
              : `Edit anything. ${WORDS[missing]} ${missing === 1 ? "part is" : "parts are"} missing; you can fill ${missing === 1 ? "it" : "them"} now or later.`}
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          {setup ? (
            <button type="button" className="e-btn e-btn-primary" disabled={saving} onClick={() => save("first-run-loop")}>Save and continue</button>
          ) : (
            <>
              <button type="button" className="e-btn e-btn-soft" disabled={saving} onClick={() => save("5-1-stories")}>Save</button>
              <button type="button" className="e-btn e-btn-primary" disabled={saving} onClick={() => save("3-1-practice-interviewer-asking")}>Save and practice</button>
            </>
          )}
        </div>
      </header>
      {review && review.dropped.length > 0 && (
        <div className="e-soft" role="status" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "14px", fontWeight: "600" }}>Left out because it is not in your text</span>
          {review.dropped.map((d) => (
            <span key={d} className="e-meta">{d}</span>
          ))}
        </div>
      )}
      {saveError && <span className="e-meta" role="alert" style={{ color: "var(--e-warn-ink)" }}>Ensayo could not save this story. Check that your data folder is available, then try again.</span>}
      <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
          <div className="e-field">
            <label htmlFor="t">Title</label>
            <span className="e-meta">{FIELD_HELP.title}</span>
            <input id="t" className="e-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="e-field">
            <label htmlFor="c">Company</label>
            <span className="e-meta">{FIELD_HELP.company}</span>
            <input id="c" className="e-input" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
        </div>
        <div className="e-field">
          <label htmlFor="h">
            Headline
          </label>
          <span className="e-meta">{FIELD_HELP.headline}</span>
          <textarea id="h" className="e-input" rows={2} value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </div>
        <div className="e-field">
          <label htmlFor="ctx">What was going on</label>
          <span className="e-meta">{FIELD_HELP.context}</span>
          <textarea id="ctx" className="e-input" rows={2} value={context} onChange={(e) => setContext(e.target.value)} />
        </div>
        <div className="e-field" style={approachMissing ? { background: "var(--e-highlight)", borderRadius: "16px", padding: "18px" } : undefined}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label htmlFor="ap" style={{ flex: "1" }}>What you noticed and decided</label>
            {approachMissing && <span className="e-badge" style={{ background: "var(--e-surface)" }}>Missing</span>}
          </div>
          <span className="e-meta">{FIELD_HELP.approach}</span>
          {approachMissing && <span className="e-meta" style={{ color: "var(--e-warn-ink)" }}>{blank ? missingNotes.approachBlank : missingNotes.approach}</span>}
          <textarea id="ap" className="e-input" rows={2} placeholder="I noticed... so I decided... and I picked ... to prove it." value={approach} onChange={(e) => setApproach(e.target.value)} />
        </div>
        <div className="e-field">
          <label htmlFor="ac">What you did</label>
          <span className="e-meta">{FIELD_HELP.action}</span>
          <textarea id="ac" className="e-input" rows={2} value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        <div className="e-field" style={ownershipMissing ? { border: "1.5px dashed var(--e-line)", borderRadius: "16px", padding: "16px" } : undefined}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label htmlFor="ow" style={{ flex: "1" }}>What you owned</label>
            {ownershipMissing && <span className="e-badge">Missing</span>}
          </div>
          <span className="e-meta">{FIELD_HELP.ownership}</span>
          <input id="ow" className="e-input" placeholder="What was yours, and who else helped?" value={ownership} onChange={(e) => setOwnership(e.target.value)} />
        </div>
        <div className="e-field">
          <label htmlFor="r">What changed</label>
          <span className="e-meta">{FIELD_HELP.result}</span>
          <textarea id="r" className="e-input" rows={2} value={result} onChange={(e) => setResult(e.target.value)} />
        </div>
      </section>
      <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "6px" }}>
          <span className="e-h3">Numbers</span>
          <span className="e-small">{numbers.length === 0 ? "None yet" : blank ? "Added by you" : "All found in your text"}</span>
        </div>
        <span className="e-meta" style={{ paddingBottom: "6px" }}>{FIELD_HELP.numbers}</span>
        <Numbers rows={numbers} setRows={setNumbers} />
        <span className="e-small">Tick each once you're sure it's right. Ensayo will flag it if you ever say a different number.</span>
      </section>
      <section className="e-card" style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span className="e-h3">Good for questions about</span>
          <span className="e-meta">{FIELD_HELP.goodFor}</span>
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
          {blank || (review ? review.followUps : parsed.followUps).length === 0 ? (
            <span className="e-meta">None yet. They show up once there is more of your story to ask about.</span>
          ) : (
            (review ? review.followUps : parsed.followUps).map((f) => (
              <span key={f.question} className="e-meta">"{f.question}" · {f.angle}</span>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
