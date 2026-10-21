import type { CSSProperties, ReactNode } from "react";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { useStore } from "../../data/store";
import { STAGE_LABEL, boldParts, longDate, nextStage, timeText } from "./format";
import { withFeatured, type Featured } from "./parts";

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
  const cue = extras.cue;
  const stage = extras.nightBefore ? app.process.find((s) => s.id === extras.nightBefore?.stageId) : nextStage(app);
  const stageLine = stage ? [stage.label || STAGE_LABEL[stage.stage], longDate(stage.at), timeText(stage.at)].filter(Boolean).join(" · ") : "";
  const nb = extras.nightBefore;
  const story = nb ? store.stories.find((s) => s.id === nb.powerStoryId) : undefined;
  const powerTitle = (story?.title ?? "your power story").toLowerCase();
  const asks = nb?.questions ?? [];

  const markdown = () => {
    if (!cue) return `# ${app.company}\n\n${stageLine}\n`;
    const p = cue.power;
    return [
      `# ${app.company}`,
      stageLine,
      "",
      "## Opener, tell me about yourself",
      ...cue.openerBeats.map((b) => `- ${b}`),
      "",
      `## Power story, ${powerTitle}`,
      `- **Headline:** ${p.headline} (${p.headlineNote})`,
      `- **Noticed:** ${p.noticed}`,
      `- **Decided:** ${p.decided}`,
      `- **Did:** ${p.did} (${p.didNote})`,
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
          <Link to="6-6-application-stages-and-night-before" className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }}>{`‹ ${app.company}`}</Link>
          <span className="e-meta">Keep it off camera. Beats, not a script.</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="e-btn e-btn-white e-btn-sm" onClick={() => download(`${app.company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-cue-sheet.md`, markdown())}>Markdown</button>
            <button type="button" className="e-btn e-btn-primary e-btn-sm" onClick={() => window.print()}>Save as PDF</button>
          </div>
        </header>
        <article className="cue-sheet" style={{ ...PAPER, width: "100%", maxWidth: "760px", margin: "0 auto", borderRadius: "8px", boxShadow: "0 1px 2px rgba(43,39,34,0.06), 0 12px 40px rgba(43,39,34,0.08)", padding: "56px 64px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "26px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", borderBottom: "2px solid var(--e-ink)", paddingBottom: "14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="e-hand" style={{ fontSize: "25px" }}>{app.company}</span>
              <span className="e-meta">{stageLine || "No stage dated yet"}</span>
            </div>
            <span className="e-small">ensayo</span>
          </div>
          {!cue && (
            <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span className="e-label">Nothing to put on the sheet yet</span>
              <span className="e-meta">Lock your opener, one power story and two questions on the night-before page and they show up here.</span>
            </section>
          )}
          {cue && (
            <>
              <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span className="e-label">Opener · tell me about yourself</span>
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
                    <Bold text={cue.power.headline} /> <span className="e-small">{cue.power.headlineNote}</span>
                  </Row>
                  <Row label="Noticed">{cue.power.noticed}</Row>
                  <Row label="Decided">{cue.power.decided}</Row>
                  <Row label="Did">
                    {cue.power.did} <span className="e-badge">{cue.power.didNote}</span>
                  </Row>
                  <Row label="Result"><Bold text={cue.power.result} /></Row>
                  <Row label="If pushed">{cue.power.ifPushed}</Row>
                </div>
              </section>
              <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span className="e-label">Ask them</span>
                {asks.length === 0 && <span className="e-meta">No questions picked yet.</span>}
                <ol style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "15px", lineHeight: "1.5" }}>
                  {asks.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              </section>
              <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span className="e-label">Say the same way every time</span>
                <div style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr)", rowGap: "6px", columnGap: "16px", fontSize: "15px" }}>
                  {cue.said.map((s) => (
                    <Row key={s.label} label={s.label}>{s.text}</Row>
                  ))}
                </div>
              </section>
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
