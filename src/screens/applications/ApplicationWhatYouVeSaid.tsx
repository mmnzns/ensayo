import { useState } from "react";
import AppShell from "../../ui/AppShell";
import type { Claim, ClaimMatch } from "../../data/types";
import { MATCH_LABEL } from "./format";
import { AppHeader, AppTabs, MatchChip, withFeatured, type Featured } from "./parts";

const CURRENT = "Marked as the current answer";

function groupStatus(claims: Claim[]): ClaimMatch {
  if (claims.some((c) => c.status === "differs")) return "differs";
  if (claims.some((c) => c.status === "updated")) return "updated";
  if (claims.length === 1) return claims[0].status;
  return "consistent";
}

function Said({ app, now }: Featured) {
  const [claims, setClaims] = useState<Claim[]>(app.claims);
  const [editing, setEditing] = useState<string | null>(null);

  // Group by subject, in the order each subject first appears.
  const subjects: string[] = [];
  for (const c of claims) if (!subjects.includes(c.subject)) subjects.push(c.subject);

  const markCurrent = (id: string) => setClaims(claims.map((c) => (c.id === id ? { ...c, status: "updated", note: CURRENT } : c)));
  const setQuote = (id: string, quote: string) => setClaims(claims.map((c) => (c.id === id ? { ...c, quote, value: quote } : c)));
  const remove = (id: string) => setClaims(claims.filter((c) => c.id !== id));

  return (
    <AppShell nav="applications">
      <AppHeader app={app} now={now} />
      <AppTabs current="said" />
      <p className="e-meta" style={{ margin: "0" }}>{`Everything ${app.company} has heard from you: first your resume, then every stage you've practiced. The same facts should come out the same way every time. If a line was heard wrong, edit or remove it.`}</p>
      <section className="e-card" style={{ padding: "8px 28px" }}>
        {subjects.length === 0 && <span className="e-meta" style={{ display: "block", padding: "20px 0" }}>Nothing yet. Once you practice or attach a resume, what you've said shows up here.</span>}
        {subjects.map((subject, gi) => {
          const group = claims.filter((c) => c.subject === subject);
          const status = groupStatus(group);
          const differs = status === "differs";
          const updatedIdx = group.findIndex((c) => c.status === "updated");
          const last = gi === subjects.length - 1;
          const isEditing = editing === subject;
          const note = group.find((c) => c.status === "differs")?.note;
          const differsClaim = group.find((c) => c.status === "differs");
          const differsId = differsClaim?.id;
          const num = differsClaim ? /\d+(?:\.\d+)?/.exec(differsClaim.quote)?.[0] : undefined;
          return (
            <div key={subject} className="e-rowline" style={{ padding: "18px 0", alignItems: "flex-start", ...(differs ? { background: "var(--e-highlight)", margin: "0 -28px", paddingLeft: "28px", paddingRight: "28px" } : {}), ...(last ? { borderBottom: "none" } : {}) }}>
              <span className="e-h3" style={{ width: "180px", flex: "none" }}>{subject}</span>
              <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
                {group.map((c, i) => {
                  const struck = updatedIdx > -1 && i < updatedIdx;
                  const where = c.status === "updated" && c.note ? `${c.stage_label} · ${c.note.charAt(0).toLowerCase()}${c.note.slice(1)}` : c.stage_label;
                  if (isEditing) {
                    return (
                      <span key={c.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                        <input className="e-input" style={{ flex: "1 1 260px", minHeight: "40px", padding: "8px 10px", fontSize: "15px" }} aria-label={`${subject}, ${c.stage_label}`} value={c.quote} onChange={(e) => setQuote(c.id, e.target.value)} />
                        <span className="e-small">{c.stage_label}</span>
                        {c.status !== "updated" && group.length > 1 && (
                          <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => markCurrent(c.id)}>Mark as current</button>
                        )}
                        <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => remove(c.id)}>Remove</button>
                      </span>
                    );
                  }
                  return (
                    <span key={c.id} style={{ fontSize: "15px" }}>
                      {struck ? <s style={{ color: "var(--e-muted)" }}>{`"${c.quote}"`}</s> : `"${c.quote}"`}{" "}
                      <span className="e-small">{`· ${where}`}</span>
                    </span>
                  );
                })}
                {differs && note && !isEditing && <span className="e-meta" style={{ color: "var(--e-warn-ink)" }}>{note}</span>}
              </div>
              {differs && !isEditing && differsId && (
                <button type="button" className="e-btn e-btn-white e-btn-sm" onClick={() => markCurrent(differsId)}>{num ? `It's ${num} now` : "Mark as updated"}</button>
              )}
              {!differs && <MatchChip status={status} text={MATCH_LABEL[status]} />}{" "}
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" aria-label="Edit" onClick={() => setEditing(isEditing ? null : subject)}>{isEditing ? "Done" : "Edit"}</button>
            </div>
          );
        })}
      </section>
      <span className="e-small">{`Only answers inside this application are compared. Tailoring for a different company is fine.`}</span>
    </AppShell>
  );
}

export default withFeatured(Said);
