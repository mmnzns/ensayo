import { useStore } from "../../data/store";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import { getParseFailure, pasteDraft, setBlankReview, setParsedDraft } from "./selection";

/** After "Read it" when the engine could not turn the text into a story. The text the user pasted is kept. */
export default function StoriesParseError() {
  const store = useStore();
  const { engine } = store;
  const kept = pasteDraft.raw ?? store.screens.stories.pasteSample;
  const reason =
    getParseFailure() ??
    (engine.offline
      ? "You seem to be offline, so Ensayo couldn't reach your AI engine."
      : engine.kind === "timing"
        ? "No AI engine is set up, and reading pasted text needs one."
        : "The AI engine didn't send back anything Ensayo could use.");
  return (
    <AppShell nav="stories">
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Link to="5-1-stories" className="e-small" style={{ textDecoration: "none" }}>‹ Stories</Link>
        <h1 className="e-h1">Add a story</h1>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
        <section className="e-card" style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-h2">Ensayo couldn't read that one</span>
            <span className="e-meta">{reason} Nothing was lost. Your text is right here.</span>
          </div>
          <div className="e-field">
            <label htmlFor="kept">Your text</label>
            <textarea id="kept" className="e-input" rows={7} readOnly value={kept} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <button type="button" className="e-btn e-btn-primary" onClick={() => go("5-2-add-a-story-paste")}>Try again</button>
            <button
              type="button"
              className="e-btn e-btn-line"
              onClick={() => {
                setBlankReview(true);
                setParsedDraft(null);
                go("5-3-add-a-story-review");
              }}
            >
              Fill it in yourself
            </button>
          </div>
        </section>
        <aside className="e-card" style={{ flex: "1 1 280px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span className="e-h3">What works without an AI engine</span>
          <span className="e-meta">You can still add a story by hand, practice it, and get notes on timing, length and filler words.</span>
          <span className="e-meta">An AI engine is what reads pasted text, checks your numbers and hears whether you answered the question.</span>
          <Link to="8-5-settings-ai" className="e-btn e-btn-white e-btn-sm" style={{ alignSelf: "flex-start" }}>Add an engine</Link>
        </aside>
      </div>
    </AppShell>
  );
}
