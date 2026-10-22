import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { copyText } from "../../ui/clipboard";
import type { CueSheet } from "../../data/applicationCommands";
import { useActions } from "../../data/real";
import { useHashParam } from "../../data/selection";
import { plainError } from "../../data/actions";
import { useStore } from "../../data/store";
import { STAGE_LABEL, boldParts, longDate, nextStage, timeText } from "./format";
import { fileSlug } from "./forms";
import { ErrorLine, useAppLink, withFeatured, type Featured } from "./parts";

/** The sheet is paper: it keeps its own light colours whatever the app theme is. */
const PAPER = {
  "--e-ink": "#2B2722",
  "--e-muted": "#5B5960",
  "--e-line": "#E6E6E9",
  "--e-pen": "#B8432C",
  "--e-highlight": "#EEF0F4",
  "--e-warn-ink": "#3D4555",
  background: "#FFFFFF",
  color: "#2B2722",
} as CSSProperties;

function Bold({ text }: { text: string }) {
  return (
    <>
      {boldParts(text).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}
    </>
  );
}

function download(name: string, text: string) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    /* nothing to save to; the sheet is still on screen */
  }
}

function Cue({ app, extras }: Featured) {
  const store = useStore();
  const actions = useActions();
  const link = useAppLink();
  const named = useHashParam("stage");
  const stages = [...app.process].sort((a, b) => a.order - b.order);
  const lockedIds = stages.filter((s) => extras.lockedByStage?.[s.id]).map((s) => s.id);
  const stage =
    stages.find((s) => s.id === named) ??
    stages.find((s) => s.id === extras.nightBefore?.stageId) ??
    stages.find((s) => lockedIds.includes(s.id)) ??
    nextStage(app);
  const stageId = stage?.id ?? "";
  const nb = (stage && extras.lockedByStage?.[stage.id]) || (extras.nightBefore && extras.nightBefore.stageId === stageId ? extras.nightBefore : undefined);

  // In the app the sheet is made from the lock when you open it; the sample data brings its own.
  const [fetched, setFetched] = useState<{ key: string; sheet: CueSheet | null } | null>(null);
  const [loadError, setLoadError] = useState("");
  const lockKey = `${stageId}|${JSON.stringify(nb ?? null)}`;
  const sample = extras.cue;
  useEffect(() => {
    if (sample || !stageId) return;
    let live = true;
    setLoadError("");
    actions
      .cueSheet(app.id, stageId)
      .then((sheet) => live && setFetched({ key: lockKey, sheet }))
      .catch((e) => live && setLoadError(plainError(e)));
    return () => {
      live = false;
    };
  }, [actions, app.id, stageId, lockKey, sample]);
  const cue: CueSheet | null | undefined = sample ? (sample as CueSheet) : fetched?.key === lockKey ? fetched.sheet : undefined;
  const loading = !sample && !!stageId && cue === undefined && !loadError;

  const stageLine = cue?.stageLine ?? (stage ? [stage.label || STAGE_LABEL[stage.stage], longDate(stage.at), timeText(stage.at)].filter(Boolean).join(" · ") : "");
  const company = cue?.company ?? app.company;
  const story = nb ? store.stories.find((s) => s.id === nb.powerStoryId) : undefined;
  const powerTitle = (cue?.powerStoryTitle ?? story?.title ?? "your power story").toLowerCase();
  const asks = cue?.questions ?? nb?.questions ?? [];
  const prompt = cue?.openerPrompt ?? nb?.openerPrompt ?? "Tell me about yourself";

  const [status, setStatus] = useState("");
  const [exportError, setExportError] = useState("");

  /** Markdown the screen builds itself, for the sample data. In the app the backend writes it. */
  const sampleMarkdown = () => {
    if (!cue) return `# ${company}\n\n${stageLine}\n`;
    const p = cue.power;
    const note = (n: string) => (n ? ` (${n})` : "");
    return [
      `# ${company}`,
      stageLine,
      "",
      `## Opener, ${prompt.toLowerCase()}`,
      ...cue.openerBeats.map((b) => `- ${b}`),
      "",
      `## Power story, ${powerTitle}`,
      `- **Headline:** ${p.headline}${note(p.headlineNote)}`,
      `- **Noticed:** ${p.noticed}`,
      `- **Decided:** ${p.decided}`,
      `- **Did:** ${p.did}${note(p.didNote)}`,
      `- **Result:** ${p.result}`,
      `- **If pushed:** ${p.ifPushed}`,
      "",
      "## Ask them",
      ...asks.map((a, i) => `${i + 1}. ${a}`),
      "",
      "## Say the same way every time",
      ...cue.said.map((s) => `- **${s.label}:** ${s.text}`),
      "",
      cue.reminders.join(" "),
      "",
    ].join("\n");
  };
  const markdown = async (): Promise<string> => (sample ? sampleMarkdown() : actions.cueSheetMarkdown(app.id, stageId));

  const copy = async () => {
    setExportError("");
    try {
      const ok = await copyText(await markdown());
      if (ok) setStatus("Copied. Paste it anywhere.");
      else setExportError("Ensayo couldn't copy it. Use Download instead.");
    } catch (e) {
      setExportError(plainError(e));
    }
  };
  const save = async () => {
    setExportError("");
    try {
      download(fileSlug(company, "cue-sheet.md"), await markdown());
      setStatus("Saved a Markdown file to your downloads.");
    } catch (e) {
      setExportError(plainError(e));
    }
  };

  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <>
      <span className="e-small" style={{ paddingTop: "2px" }}>{label}</span>
      <span>{children}</span>
    </>
  );

  return (
    <FocusShell>
      <style>{"@media print{.cue-noprint{display:none !important}.e-focus{padding:0 !important;background:#fff !important}.cue-sheet{box-shadow:none !important;padding:24px 0 !important;max-width:none !important}}"}</style>
      <div className="e-wrap" style={{ gap: "24px", width: "100%" }}>
        <header className="cue-noprint" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <Link to={link("6-6-application-stages-and-night-before")} className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }}>{`‹ ${app.company}`}</Link>
          <span className="e-meta">Keep it off camera. Beats, not a script.</span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" className="e-btn e-btn-white e-btn-sm" disabled={!cue} onClick={() => void copy()}>Copy Markdown</button>
            <button type="button" className="e-btn e-btn-white e-btn-sm" disabled={!cue} onClick={() => void save()}>Download .md</button>
            <button type="button" className="e-btn e-btn-primary e-btn-sm" disabled={!cue} onClick={() => window.print()}>Save as PDF</button>
          </div>
        </header>
        {(status || exportError) && (
          <div className="cue-noprint" style={{ display: "flex", justifyContent: "flex-end" }}>
            {exportError ? <ErrorLine error={exportError} /> : <span className="e-small" role="status">{status}</span>}
          </div>
        )}
        {lockedIds.length > 1 && (
          <nav className="cue-noprint" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }} aria-label="Stage">
            {stages.filter((s) => lockedIds.includes(s.id)).map((s) => (
              <Link key={s.id} to={link("6-7-cue-sheet", { stage: s.id })} className={s.id === stageId ? "e-chip e-chip-on" : "e-chip"} aria-current={s.id === stageId ? "page" : undefined}>
                {s.label || STAGE_LABEL[s.stage]}
              </Link>
            ))}
          </nav>
        )}
        <article className="cue-sheet" style={{ ...PAPER, width: "100%", maxWidth: "760px", margin: "0 auto", borderRadius: "8px", boxShadow: "0 1px 2px rgba(43,39,34,0.06), 0 12px 40px rgba(43,39,34,0.08)", padding: "56px 64px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "26px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", borderBottom: "2px solid var(--e-ink)", paddingBottom: "14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="e-hand" style={{ fontSize: "25px" }}>{company}</span>
              <span className="e-meta">{stageLine || "No stage dated yet"}</span>
            </div>
            <span className="e-small">ensayo</span>
          </div>
          {loadError && <ErrorLine error={loadError} />}
          {loading && <span className="e-meta">Making the sheet</span>}
          {!cue && !loading && !loadError && (
            <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span className="e-label">Nothing to put on the sheet yet</span>
              <span className="e-meta">Lock your opener, one power story and two questions on the night-before page and they show up here.</span>
              <span className="cue-noprint"><Link to={link("6-6-application-stages-and-night-before", { stage: stageId })} className="e-btn e-btn-line e-btn-sm">Go lock them</Link></span>
            </section>
          )}
          {cue && (
            <>
              <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span className="e-label">{`Opener · ${prompt.toLowerCase()}`}</span>
                <ul style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "15px", lineHeight: "1.5" }}>
                  {cue.openerBeats.map((b, i) => (
                    <li key={i}><Bold text={b} /></li>
                  ))}
                </ul>
              </section>
              <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span className="e-label">{`Power story · ${powerTitle}`}</span>
                <div style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr)", rowGap: "8px", columnGap: "16px", fontSize: "15px", lineHeight: "1.5" }}>
                  <Row label="Headline">
                    <Bold text={cue.power.headline} /> {cue.power.headlineNote && <span className="e-small">{cue.power.headlineNote}</span>}
                  </Row>
                  <Row label="Noticed">{cue.power.noticed}</Row>
                  <Row label="Decided">{cue.power.decided}</Row>
                  <Row label="Did">
                    {cue.power.did} {cue.power.didNote && <span className="e-badge">{cue.power.didNote}</span>}
                  </Row>
                  <Row label="Result"><Bold text={cue.power.result} /></Row>
                  <Row label="If pushed">{cue.power.ifPushed}</Row>
                </div>
              </section>
              {cue.numbers && cue.numbers.length > 0 && (
                <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span className="e-label">Say the numbers the same way</span>
                  <div style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr)", rowGap: "6px", columnGap: "16px", fontSize: "15px" }}>
                    {cue.numbers.map((n) => (
                      <Row key={n.label} label={n.label}>
                        {n.value}
                        {n.resumeSays && (
                          <>
                            {" "}
                            {n.mismatch ? <span className="e-badge">{`Resume says ${n.resumeSays}`}</span> : <span className="e-small">Resume says the same</span>}
                          </>
                        )}
                      </Row>
                    ))}
                  </div>
                </section>
              )}
              <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span className="e-label">Ask them</span>
                {asks.length === 0 && <span className="e-meta">No questions picked yet.</span>}
                <ol style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "15px", lineHeight: "1.5" }}>
                  {asks.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              </section>
              {cue.said.length > 0 && (
                <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span className="e-label">Say the same way every time</span>
                  <div style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr)", rowGap: "6px", columnGap: "16px", fontSize: "15px" }}>
                    {cue.said.map((s) => (
                      <Row key={s.label} label={s.label}>{s.text}</Row>
                    ))}
                  </div>
                </section>
              )}
              <div style={{ borderTop: "1px solid var(--e-line)", paddingTop: "16px", display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
                {cue.reminders.map((r) => (
                  <span key={r} className="e-hand" style={{ fontSize: "18px" }}>{r}</span>
                ))}
              </div>
            </>
          )}
        </article>
      </div>
    </FocusShell>
  );
}

export default withFeatured(Cue);
