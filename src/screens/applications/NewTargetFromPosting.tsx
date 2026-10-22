import { useEffect, useRef, useState } from "react";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import { plainError } from "../../data/actions";
import { isApp, useActions } from "../../data/real";
import { withParams } from "../../data/selection";
import { useStore } from "../../data/store";
import { blankTarget } from "../../data/targetState";
import type { SellsTo, Seniority, StageId, Target } from "../../data/types";
import { STAGE_LABEL } from "./format";
import { ErrorLine, useFeatured, useRun } from "./parts";
import { closestTarget, draftFromPosting, pitchNeedsWork, SELLS_TO_LABEL, SENIORITY_LABEL } from "./targetPick";

const STAGE_ORDER: StageId[] = ["recruiter", "hiring_manager", "technical", "panel", "leadership"];
const SENIORITY: Seniority[] = ["early", "mid", "senior", "lead", "director"];
const SELLS_TO: SellsTo[] = ["b2b", "b2c", "both"];

const Badge = ({ children, strong }: { children: string; strong?: boolean }) => (
  <span className="e-badge" style={strong ? { fontWeight: "600" } : { background: "var(--e-tint)", color: "var(--e-primary-dark)" }}>{children}</span>
);

function FieldHead({ id, label, badge }: { id: string; label: string; badge: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
      <label htmlFor={id} style={{ fontSize: "14px", fontWeight: "600" }}>{label}</label>
      <Badge>{badge}</Badge>
    </span>
  );
}

export default function NewTargetFromPosting() {
  const { app } = useFeatured();
  const back = app ? withParams("6-3-application-overview", { app: app.id }) : "6-1-applications";
  if (!app) {
    return (
      <FocusShell style={{ background: "rgba(43,39,34,0.32)", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
        <div role="dialog" aria-modal="true" aria-labelledby="tf-title" className="e-card" style={{ width: "100%", maxWidth: "720px", padding: "36px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <h1 id="tf-title" className="e-h2" style={{ fontSize: "24px" }}>No application to read</h1>
          <span className="e-meta">Open an application with a posting and choose Make a new target from this posting.</span>
          <Link to="6-1-applications" className="e-btn e-btn-line" style={{ alignSelf: "flex-start" }}>Back to applications</Link>
        </div>
      </FocusShell>
    );
  }
  return <Draft key={app.id} appId={app.id} back={back} />;
}

type Loaded = { target: Target; pitchCopied: boolean };

function Draft({ appId, back }: { appId: string; back: string }) {
  const store = useStore();
  const actions = useActions();
  const app = store.applications.find((a) => a.id === appId);
  const closest = app ? closestTarget(app, store.targets) : undefined;
  const [loaded, setLoaded] = useState<Loaded | null>(() => (!isApp() && app ? draftFromPosting(app, store.targets, blankTarget(store.targets)) : null));
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Target | null>(loaded?.target ?? null);
  const [copiedPitch, setCopiedPitch] = useState(loaded?.target.pitch ?? "");
  const [asking, setAsking] = useState(false);
  const [made, setMade] = useState<Target | null>(null);
  const { busy, error, run } = useRun();
  const pitchBox = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (loaded || !isApp()) return;
    let live = true;
    actions
      .targetFromPosting(appId)
      .then((out) => {
        if (!live) return;
        setLoaded(out);
        setDraft(out.target);
        setCopiedPitch(out.pitchCopied ? out.target.pitch : "");
      })
      .catch((e) => live && setLoadError(plainError(e)));
    return () => {
      live = false;
    };
    // The posting is read once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  const shell = (children: React.ReactNode) => (
    <FocusShell style={{ background: "rgba(43,39,34,0.32)", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="tf-title" className="e-card" style={{ width: "100%", maxWidth: "720px", padding: "36px", display: "flex", flexDirection: "column", gap: "20px", boxShadow: "0 24px 64px rgba(43,39,34,0.18)" }}>
        {children}
      </div>
    </FocusShell>
  );

  if (!app) return shell(<span className="e-meta">That application isn't here any more.</span>);
  if (!draft) {
    return shell(
      <>
        <h1 id="tf-title" className="e-h2" style={{ fontSize: "24px" }}>{`New target from the ${app.company} posting`}</h1>
        {loadError ? (
          <>
            <ErrorLine error={loadError} />
            <Link to={back} className="e-btn e-btn-line" style={{ alignSelf: "flex-start" }}>{`Back to ${app.company}`}</Link>
          </>
        ) : (
          <span className="e-meta" role="status">Reading the posting against your targets.</span>
        )}
      </>,
    );
  }

  const set = (patch: Partial<Target>) => setDraft({ ...draft, ...patch });
  const needsPitch = pitchNeedsWork(draft.pitch, copiedPitch);
  const copiedFrom = closest?.name ?? "your closest target";
  const copiedStories = (closest?.pinnedStoryIds.length ?? 0) > 0 || (closest?.hiddenStoryIds.length ?? 0) > 0 ? closest : undefined;
  const toggleStage = (s: StageId) => set({ defaultProcess: STAGE_ORDER.filter((x) => (x === s ? !draft.defaultProcess.includes(s) : draft.defaultProcess.includes(x))) });

  const create = () =>
    run(async () => {
      if (!draft.name.trim() && !draft.role.trim()) throw new Error("Give the target a name or a role first.");
      const saved = made ?? (await actions.saveTarget({ ...draft, id: "", name: draft.name.trim(), role: draft.role.trim(), industry: draft.industry.trim(), pitch: draft.pitch.trim() }));
      setMade(saved);
      try {
        await actions.updateApplication(appId, { targetId: saved.id, rebuildQuestions: true });
      } catch (e) {
        throw new Error(`${saved.name} is saved, but ${app.company} wasn't moved: ${plainError(e)} Move it from Edit details.`);
      }
      go(back);
    });

  const save = () => {
    if (needsPitch && !asking) {
      setAsking(true);
      return;
    }
    void create();
  };

  return shell(
    <>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h1 id="tf-title" className="e-h2" style={{ fontSize: "24px" }}>{`New target from the ${app.company} posting`}</h1>
          <span className="e-meta">{`Filled in from the posting${closest ? ` and your ${closest.name} target` : ""}. Check it before you save.`}</span>
        </div>
        <Link to={back} className="e-btn e-btn-ghost e-btn-sm" aria-label="Close">✕</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
        <div className="e-field">
          <FieldHead id="tf-name" label="Target name" badge="suggested" />
          <input id="tf-name" className="e-input" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="e-field">
          <FieldHead id="tf-role" label="Role" badge="from the posting" />
          <input id="tf-role" className="e-input" value={draft.role} onChange={(e) => set({ role: e.target.value })} />
        </div>
        <div className="e-field">
          <FieldHead id="tf-sells" label="Sells to" badge="from the posting" />
          <select id="tf-sells" className="e-input" value={draft.sellsTo} onChange={(e) => set({ sellsTo: e.target.value as SellsTo })}>
            {SELLS_TO.map((s) => (
              <option key={s} value={s}>{SELLS_TO_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="e-field">
          <FieldHead id="tf-industry" label="Industry" badge="from the posting" />
          <input id="tf-industry" className="e-input" value={draft.industry} onChange={(e) => set({ industry: e.target.value })} />
        </div>
        <div className="e-field">
          <FieldHead id="tf-seniority" label="Seniority" badge="from the posting" />
          <select id="tf-seniority" className="e-input" value={draft.seniority} onChange={(e) => set({ seniority: e.target.value as Seniority })}>
            {SENIORITY.map((s) => (
              <option key={s} value={s}>{SENIORITY_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="e-field">
          <FieldHead id="tf-stages" label="Usual stages" badge="from the posting" />
          <div id="tf-stages" role="group" aria-label="Usual stages" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {STAGE_ORDER.map((s) => {
              const on = draft.defaultProcess.includes(s);
              return (
                <button key={s} type="button" className={on ? "e-chip e-chip-on" : "e-chip"} aria-pressed={on} style={{ minHeight: "36px", padding: "6px 12px", fontSize: "14px" }} onClick={() => toggleStage(s)}>
                  {STAGE_LABEL[s]}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="e-field">
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <label htmlFor="tf-pitch" style={{ fontSize: "14px", fontWeight: "600" }}>Your pitch</label>
          {loaded?.pitchCopied && needsPitch && <Badge strong>{`copied from ${copiedFrom}`}</Badge>}
        </span>
        <textarea id="tf-pitch" ref={pitchBox} className="e-input" rows={2} value={draft.pitch} onChange={(e) => set({ pitch: e.target.value })} />
        {needsPitch && (
          <div className="e-soft" style={{ background: "var(--e-highlight)", padding: "12px 16px" }}>
            <span className="e-meta" style={{ color: "var(--e-warn-ink)" }}>
              {loaded?.pitchCopied
                ? `This still pitches ${copiedFrom}. Write your own pitch for ${draft.name.trim() || "this target"} before your first Mock for it. Ensayo won't write it for you.`
                : `There is no pitch yet. Write your own for ${draft.name.trim() || "this target"} before your first Mock for it. Ensayo won't write it for you.`}
            </span>
          </div>
        )}
      </div>
      {copiedStories && (
        <div className="e-soft" style={{ background: "var(--e-ground)", display: "flex", flexDirection: "column", gap: "6px", padding: "16px 20px" }}>
          <span className="e-h3" style={{ fontSize: "15px" }}>{`Also copied from ${copiedFrom}`}</span>
          <span className="e-meta">{`${copiedStories.pinnedStoryIds.length} pinned ${copiedStories.pinnedStoryIds.length === 1 ? "story" : "stories"} and ${copiedStories.hiddenStoryIds.length} hidden ${copiedStories.hiddenStoryIds.length === 1 ? "story" : "stories"}. Change them in the target after you save.`}</span>
        </div>
      )}
      {asking && needsPitch && (
        <div className="e-soft" role="alertdialog" aria-label="Write your pitch first" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <span className="e-meta" style={{ color: "var(--e-ink)" }}>Your pitch is not your own yet. You can save now and write it later in Settings, but practice for this target works best once it is.</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button
              type="button"
              className="e-btn e-btn-line e-btn-sm"
              onClick={() => {
                setAsking(false);
                pitchBox.current?.focus();
              }}
            >
              Write it now
            </button>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={busy} onClick={() => void create()}>Save anyway</button>
          </span>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: "12px" }}>
        <ErrorLine error={error} />
        <Link to={back} className="e-btn e-btn-ghost">Cancel</Link>
        <button type="button" className="e-btn e-btn-primary" disabled={busy} onClick={save}>{busy ? "Saving" : `Create and move ${app.company}`}</button>
      </div>
    </>,
  );
}
