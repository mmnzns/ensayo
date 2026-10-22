import { useState } from "react";
import AppShell from "../../ui/AppShell";
import { useActions } from "../../data/real";
import { MATCH_LABEL, STAGE_LABEL } from "./format";
import { ADD_KINDS, groupClaims, numberIn } from "./claimsLog";
import { AppHeader, AppTabs, ErrorLine, MatchChip, useRun, withFeatured, type Featured } from "./parts";

function Said({ app, now }: Featured) {
  const actions = useActions();
  const { busy, error, run, setError } = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [nowValue, setNowValue] = useState("");
  const [adding, setAdding] = useState<{ kind: string; subject: string; value: string; stage: string } | null>(null);
  const stages = [...app.process].sort((a, b) => a.order - b.order);

  const groups = groupClaims(app.claims);
  const saveClaim = async (id: string, value: string) => {
    const done = await run(() => actions.editClaim(app.id, id, { value, quote: value }));
    if (done) setDrafts(({ [id]: _gone, ...rest }) => rest);
  };
  const addLine = async () => {
    if (!adding) return;
    const kind = ADD_KINDS.find((k) => k.id === adding.kind);
    const done = await run(() => actions.addClaim(app.id, { type: adding.kind, subject: adding.subject.trim() || kind?.subject || "", value: adding.value, stage: adding.stage }));
    if (done) setAdding(null);
  };
  const kind = ADD_KINDS.find((k) => k.id === adding?.kind);

  return (
    <AppShell nav="applications">
      <AppHeader app={app} now={now} />
      <AppTabs current="said" />
      <p className="e-meta" style={{ margin: "0" }}>{`Everything ${app.company} has heard from you: first your resume, then every stage you've practiced. The same facts should come out the same way every time. If a line was heard wrong, edit or remove it.`}</p>
      <ErrorLine error={error} />
      <section className="e-card" style={{ padding: "8px 28px" }}>
        {groups.length === 0 && <span className="e-meta" style={{ display: "block", padding: "20px 0" }}>Nothing yet. Once you practice or attach a resume, what you've said shows up here.</span>}
        {groups.map((g, gi) => {
          const differs = g.status === "differs";
          const last = gi === groups.length - 1 && !adding;
          const isEditing = editing === g.subject;
          const num = g.differs ? numberIn(g.differs.quote) : undefined;
          const live = g.claims.filter((c) => !g.struck.has(c.id));
          return (
            <div key={g.subject} className="e-rowline" style={{ padding: "18px 0", alignItems: "flex-start", ...(differs ? { background: "var(--e-highlight)", margin: "0 -28px", paddingLeft: "28px", paddingRight: "28px" } : {}), ...(last ? { borderBottom: "none" } : {}) }}>
              <span className="e-h3" style={{ width: "180px", flex: "none" }}>{g.subject}</span>
              <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
                {g.claims.map((c) => {
                  const struck = g.struck.has(c.id);
                  const where = c.status === "updated" && c.note ? `${c.stage_label} · ${c.note.charAt(0).toLowerCase()}${c.note.slice(1)}` : c.stage_label;
                  if (isEditing) {
                    const text = drafts[c.id] ?? c.quote;
                    return (
                      <span key={c.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                        <input className="e-input" style={{ flex: "1 1 260px", minHeight: "40px", padding: "8px 10px", fontSize: "15px", ...(struck ? { textDecoration: "line-through" } : {}) }} aria-label={`${g.subject}, ${c.stage_label}`} value={text} onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })} />
                        <span className="e-small">{c.edited ? `${c.stage_label} · edited by you` : c.stage_label}</span>
                        {text !== c.quote && <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy || !text.trim()} onClick={() => void saveClaim(c.id, text)}>Save</button>}
                        {(struck || (c.status !== "updated" && live.length > 1)) && (
                          <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy} onClick={() => void run(() => actions.markClaimCurrent(app.id, c.id))}>Mark as current</button>
                        )}
                        <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={busy} onClick={() => void run(() => actions.removeClaim(app.id, c.id))}>Remove</button>
                      </span>
                    );
                  }
                  return (
                    <span key={c.id} style={{ fontSize: "15px" }}>
                      {struck ? <s style={{ color: "var(--e-muted)" }}>{`"${c.quote}"`}</s> : `"${c.quote}"`}{" "}
                      <span className="e-small">{`· ${where}${c.edited ? " · edited by you" : ""}`}</span>
                    </span>
                  );
                })}
                {isEditing && live.length > 0 && (
                  <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", paddingTop: "6px" }}>
                    <input className="e-input" style={{ flex: "1 1 260px", minHeight: "40px", padding: "8px 10px", fontSize: "15px" }} aria-label={`What ${g.subject.toLowerCase()} is now`} placeholder="What it is now, if it changed" value={nowValue} onChange={(e) => setNowValue(e.target.value)} />
                    <button
                      type="button"
                      className="e-btn e-btn-line e-btn-sm"
                      disabled={busy || !nowValue.trim()}
                      onClick={async () => {
                        const done = await run(() => actions.markClaimUpdated(app.id, live[live.length - 1].id, nowValue));
                        if (done) setNowValue("");
                      }}
                    >
                      Use this as the current answer
                    </button>
                  </span>
                )}
                {differs && g.differs?.note && !isEditing && <span className="e-meta" style={{ color: "var(--e-warn-ink)" }}>{g.differs.note}</span>}
              </div>
              {differs && !isEditing && g.differs && (
                <button type="button" className="e-btn e-btn-white e-btn-sm" disabled={busy} onClick={() => void run(() => actions.markClaimCurrent(app.id, (g.differs as { id: string }).id))}>{num ? `It's ${num} now` : "Mark as updated"}</button>
              )}
              {!differs && <MatchChip status={g.status} text={MATCH_LABEL[g.status]} />}{" "}
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit" onClick={() => { setEditing(isEditing ? null : g.subject); setError(""); }}>{isEditing ? "Done" : "Edit"}</button>
            </div>
          );
        })}
        {adding && (
          <div className="e-rowline" style={{ padding: "18px 0", alignItems: "flex-start", flexWrap: "wrap", borderBottom: "none" }}>
            <select className="e-input" style={{ minHeight: "40px", padding: "8px 10px", fontSize: "14px", width: "190px" }} aria-label="What the line is about" value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value })}>
              {ADD_KINDS.map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
            {!kind?.subject && <input className="e-input" style={{ flex: "1 1 160px", minHeight: "40px", padding: "8px 10px", fontSize: "15px" }} aria-label="What it is about" placeholder="What it is about" value={adding.subject} onChange={(e) => setAdding({ ...adding, subject: e.target.value })} />}
            <input className="e-input" style={{ flex: "2 1 240px", minHeight: "40px", padding: "8px 10px", fontSize: "15px" }} aria-label="What you said" placeholder="What you said, in your words" value={adding.value} onChange={(e) => setAdding({ ...adding, value: e.target.value })} />
            <select className="e-input" style={{ minHeight: "40px", padding: "8px 10px", fontSize: "14px", width: "170px" }} aria-label="Where you said it" value={adding.stage} onChange={(e) => setAdding({ ...adding, stage: e.target.value })}>
              {stages.map((st) => (
                <option key={st.id} value={st.id}>{st.label || STAGE_LABEL[st.stage]}</option>
              ))}
            </select>
            <button type="button" className="e-btn e-btn-line e-btn-sm" disabled={busy || !adding.value.trim()} onClick={() => void addLine()}>Save</button>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setAdding(null)}>Cancel</button>
          </div>
        )}
        {!adding && stages.length > 0 && (
          <div style={{ padding: "4px 0 14px" }}>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" style={{ paddingLeft: "0" }} onClick={() => setAdding({ kind: "availability", subject: "", value: "", stage: stages[0].id })}>+ Add a line</button>
          </div>
        )}
      </section>
      <span className="e-small">{`Only answers inside this application are compared. Tailoring for a different company is fine.`}</span>
    </AppShell>
  );
}

export default withFeatured(Said);
