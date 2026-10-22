import { useState } from "react";
import AppShell from "../../ui/AppShell";
import Link from "../../ui/Link";
import type { Analysis, JdOutcome } from "../../data/applicationCommands";
import { useActions } from "../../data/real";
import { useStore } from "../../data/store";
import { STAGE_LABEL, STATUS_LABEL, nextStage, shortDate, whenText } from "./format";
import { keptWords } from "./forms";
import FitBanner from "./FitBanner";
import { FIT_LABEL, fitClass, fitRows } from "./targetPick";
import { TargetMark } from "./TargetMark";
import { AppHeader, AppTabs, ErrorLine, Notice, useAppLink, useRun, withFeatured, type Featured } from "./parts";

const editInput = { minHeight: "40px", padding: "8px 10px", fontSize: "15px" } as const;

function Edited({ app, path }: { app: Featured["app"]; path: string }) {
  return app.edited_by_user.includes(path) ? <span className="e-small" style={{ color: "var(--e-primary-dark)" }}>Edited by you</span> : null;
}

function Overview({ app, extras, now }: Featured) {
  const store = useStore();
  const actions = useActions();
  const link = useAppLink();
  const [draft, setDraft] = useState<Analysis | null>(null);
  const [editNeeds, setEditNeeds] = useState(false);
  const [editBeliefs, setEditBeliefs] = useState(false);
  const [posting, setPosting] = useState("");
  const [lastRead, setLastRead] = useState<JdOutcome | null>(null);
  const saving = useRun();
  const reading = useRun();
  const status = useRun();

  // The reading on screen is the saved one until an edit starts; Done saves the edit.
  const analysis: Analysis | null = draft ?? app.analysis;
  const stories = store.stories;
  const patch = (fn: (a: Analysis) => Analysis) => setDraft((d) => fn((d ?? app.analysis) as Analysis));
  const finish = async (close: () => void) => {
    if (!draft) return close();
    const done = await saving.run(() => actions.saveAnalysis(app.id, draft));
    if (done) {
      setDraft(null);
      close();
    }
  };
  const readPosting = async (text?: string) => {
    const out = await reading.run(() => actions.analyseJd(app.id, text));
    if (out) {
      setLastRead(out);
      setPosting("");
      setDraft(null);
    }
  };
  const next = nextStage(app);
  const practiced = next ? (extras.practicedByStage[next.id] ?? 0) : 0;
  const suggested = app.suggested_status && app.suggested_status !== app.status ? app.suggested_status : null;
  const kept = lastRead ? keptWords(lastRead.result.kept) : [];
  const fits = fitRows(app.targetFit, store.targets);

  return (
    <AppShell nav="applications">
      <AppHeader app={app} now={now} />
      <AppTabs current="overview" />
      <FitBanner app={app} />
      {suggested && (
        <Notice>
          {`This looks like it has moved to ${STATUS_LABEL[suggested]}. `}
          <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={status.busy} onClick={() => void status.run(() => actions.updateApplication(app.id, { status: suggested }))}>{`Mark it ${STATUS_LABEL[suggested]}`}</button>{" "}
          <ErrorLine error={status.error} />
        </Notice>
      )}
      {next && (
        <section className="e-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px" }}>
          <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-label">Next stage</span>
            <span className="e-h2">{next.label || STAGE_LABEL[next.stage]}</span>
            <span className="e-meta">{`${next.at ? whenText(next.at, now) : "No date yet"} · ${practiced > 0 ? `${practiced} answers practiced for this stage` : "not practiced yet"}`}</span>
            {next.decides && <span className="e-small">{next.decides}</span>}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <Link to={link("2-3-start-a-session", { stage: next.id })} className="e-btn e-btn-primary e-btn-sm">Drill</Link>
            <Link to={link("2-3-start-a-session", { stage: next.id, mode: "mock" })} className="e-btn e-btn-white e-btn-sm">Mock</Link>
            <Link to={link("6-6-application-stages-and-night-before")} className="e-btn e-btn-line e-btn-sm">Stages</Link>
          </div>
        </section>
      )}
      {!analysis && (
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
          <span className="e-h2">Nothing read from the posting yet</span>
          <span className="e-meta">Paste the job posting and Ensayo will list what they likely need, the three things they must believe about you, and the gaps.</span>
          <textarea className="e-input" rows={6} style={{ width: "100%" }} aria-label="Job posting text" placeholder="Paste the whole posting here" value={posting || extras.postingText} onChange={(e) => setPosting(e.target.value)} />
          <span style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <button type="button" className="e-btn e-btn-primary" disabled={reading.busy || !(posting || extras.postingText).trim()} onClick={() => void readPosting(posting || extras.postingText)}>{reading.busy ? "Reading" : "Read the posting"}</button>
            <ErrorLine error={reading.error} />
          </span>
        </section>
      )}
      {lastRead?.result.notice && <Notice>{lastRead.result.notice}</Notice>}
      {analysis && (
        <>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "12px" }}>
              <span className="e-h2">What they likely need</span>
              <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {editNeeds ? (
                  <input className="e-input" style={{ ...editInput, width: "320px", fontSize: "14px" }} aria-label="Summary" value={analysis.summary} onChange={(e) => patch((a) => ({ ...a, summary: e.target.value }))} />
                ) : (
                  <span className="e-small">{analysis.summary}</span>
                )}
                <Edited app={app} path="analysis.summary" />
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={editNeeds ? "Done editing what they likely need" : "Edit what they likely need"} disabled={saving.busy} onClick={() => (editNeeds ? void finish(() => setEditNeeds(false)) : setEditNeeds(true))}>
                  {editNeeds ? "Done" : "Edit"}
                </button>
              </span>
            </div>
            <ErrorLine error={saving.error} />
            {analysis.priorities.length === 0 && <span className="e-meta">No priorities read yet.</span>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
              {analysis.priorities.map((p, i) => (
                <div key={i} className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {editNeeds ? (
                    <>
                      <input className="e-input" style={{ ...editInput, fontWeight: 600 }} aria-label={`Priority ${i + 1} title`} value={p.title} onChange={(e) => patch((a) => ({ ...a, priorities: a.priorities.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))} />
                      <textarea className="e-input" rows={3} style={{ fontSize: "14px" }} aria-label={`Priority ${i + 1} detail`} value={p.detail} onChange={(e) => patch((a) => ({ ...a, priorities: a.priorities.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)) }))} />
                    </>
                  ) : (
                    <>
                      <span className="e-h3">{p.title}</span>
                      <span className="e-meta">{p.detail}</span>
                      <Edited app={app} path={`analysis.priorities.${i}`} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "8px" }}>
              <span className="e-h2">Three things they need to believe about you</span>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label={editBeliefs ? "Done editing beliefs" : "Edit beliefs"} disabled={saving.busy} onClick={() => (editBeliefs ? void finish(() => setEditBeliefs(false)) : setEditBeliefs(true))}>
                {editBeliefs ? "Done" : "Edit"}
              </button>
            </div>
            {analysis.beliefs.length === 0 && <span className="e-meta">Nothing to show until the posting is read.</span>}
            {analysis.beliefs.map((b, i) => {
              const story = b.storyId ? stories.find((s) => s.id === b.storyId) : undefined;
              const covered = b.covered && !!b.storyId;
              return (
                <div key={i} className="e-rowline" style={{ alignItems: "flex-start", ...(i === analysis.beliefs.length - 1 ? { borderBottom: "none" } : {}) }}>
                  <span className="e-h2" style={{ width: "28px", color: "var(--e-muted)" }}>{i + 1}</span>
                  <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {editBeliefs ? (
                      <input className="e-input" style={editInput} aria-label={`Belief ${i + 1}`} value={b.text} onChange={(e) => patch((a) => ({ ...a, beliefs: a.beliefs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))} />
                    ) : (
                      <span className="e-h3">{b.text}</span>
                    )}
                    <Edited app={app} path={`analysis.beliefs.${i}`} />
                    <span className="e-meta">{covered ? (b.story || (story ? `${story.title} · ${story.headline}` : "")) : (b.why ?? "None of your stories shows this yet.")}</span>
                  </div>
                  {covered ? (
                    <>
                      <span className="e-badge e-badge-ok">Covered</span>{" "}<Link to="5-4-story" className="e-btn e-btn-ghost e-btn-sm">Open</Link>
                    </>
                  ) : (
                    <>
                      <span className="e-badge">No story yet</span>{" "}<Link to="5-2-add-a-story-paste" className="e-btn e-btn-line e-btn-sm">Add one</Link>
                    </>
                  )}
                </div>
              );
            })}
          </section>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
            <section className="e-card" style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <span className="e-h3">They ask for, and your stories don't mention</span>
              {analysis.gaps.length === 0 && <span className="e-meta">Nothing missing. Your stories cover what the posting asks for.</span>}
              {analysis.gaps.map((g, i) => (
                <div key={i} className="e-rowline" style={{ padding: "10px 0", ...(i === analysis.gaps.length - 1 ? { borderBottom: "none" } : {}) }}>
                  <span style={{ flex: "1" }}>{g}</span>
                  <Link to={link("2-3-start-a-session", { stage: next?.id })} className="e-small" style={{ textDecoration: "none" }}>practice the gap question</Link>
                </div>
              ))}
            </section>
            <section className="e-card" style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <span className="e-h3">Their words, worth echoing</span>
              {analysis.echo.length === 0 && <span className="e-meta">No phrases picked out yet.</span>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {analysis.echo.map((e, i) => (
                  <span key={i} className="e-pill" style={{ background: "var(--e-ground)", color: "var(--e-ink)" }}>{e}</span>
                ))}
              </div>
            </section>
          </div>
          {fits.length > 0 && (
            <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <span className="e-h3">How each target reads this posting</span>
              {fits.map((f, i) => (
                <div key={f.target.id} className="e-rowline" style={{ padding: "12px 0", ...(i === fits.length - 1 ? { borderBottom: "none" } : {}) }}>
                  <TargetMark target={f.target} />
                  <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontWeight: "600" }}>{f.target.name}</span>
                    {f.why && <span className="e-small">{f.why}</span>}
                  </span>
                  <span className={fitClass(f.fit)}>{FIT_LABEL[f.fit]}</span>
                </div>
              ))}
            </section>
          )}
          <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span className="e-h3">The posting</span>
            <span className="e-small">{extras.postingText ? `Pasted ${shortDate(extras.postingPastedOn)}. Reading it again never overwrites what you edited.` : "No posting text saved. Add it from Edit details to read it again."}</span>
            {lastRead && lastRead.result.changed.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "2px" }} aria-label="What changed">
                {lastRead.result.changed.map((c, i) => (
                  <li key={i} className="e-meta">{c}</li>
                ))}
              </ul>
            )}
            {lastRead && lastRead.result.changed.length === 0 && lastRead.result.source !== "unchanged" && <span className="e-meta">Nothing changed.</span>}
            {kept.length > 0 && <span className="e-small">{`Kept what you edited: ${kept.join(", ")}.`}</span>}
            {extras.postingText && (
              <span style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={reading.busy} onClick={() => void readPosting()}>{reading.busy ? "Reading" : "Read the posting again"}</button>
                <ErrorLine error={reading.error} />
              </span>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}

export default withFeatured(Overview);
