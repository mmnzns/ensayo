import { useEffect, useRef, useState } from "react";
import BackLink from "../../components/BackLink";
import { emptyStory } from "../../data/actions";
import { isApp, useActions } from "../../data/real";
import { useStore } from "../../data/store";
import AppShell from "../../ui/AppShell";
import { useDirtyGuard } from "../../ui/dirtyGuard";
import Link from "../../ui/Link";
import BulkReviewFields from "./BulkReviewFields";
import { canSave, itemStory, newItem, progressLine, reviewOf, runReads, saveItems, savable, savedLine, unsavedCount, withBlank, withFailure, withRead, type BulkItem } from "./bulkFlow";
import { estimateLine, NO_ENGINE_LINE } from "./bulkEstimate";
import { pickStoryFiles, pickStoryFolder, pickStoryZip, readStoryFiles, storyReadPrice } from "./bulkPick";
import { editPiece, firstLine, foundLine, mergeNext, piecesFromFiles, piecesFromPaste, removePiece, splitAt, titleFromFileName, type Piece } from "./bulkSplit";
import ResultPill from "./ResultPill";
import type { ParsedDraft } from "./selection";
import type { ReviewFields } from "./parseDraft";
import type { NumberRow } from "./Numbers";

type Phase = "input" | "split" | "read";

/** The browser preview has no engine, so a read there makes a plain draft from the text. Never used in the app. */
const previewParse = async (raw: string): Promise<ParsedDraft> => {
  if (raw.includes("[fail]")) throw new Error("The AI's reply couldn't be read this time. Try again, or fill it in yourself.");
  return { story: { ...emptyStory(), title: firstLine(raw), context: raw.slice(0, 160) }, missing: ["approach", "ownership"], dropped: [] };
};

interface Props {
  /** Tests and the preview pass their own read; the app uses the real one. */
  parse?: (raw: string, employerHint: string) => Promise<ParsedDraft>;
}

export default function AddManyStories({ parse }: Props = {}) {
  const store = useStore();
  const { saveStory } = useActions();
  const engineKind = store.engine.kind;
  const savedStories = useRef(store.stories);
  savedStories.current = store.stories;

  const [phase, setPhase] = useState<Phase>("input");
  const [raw, setRaw] = useState("");
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [items, setItems] = useState<BulkItem[]>([]);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [editingPiece, setEditingPiece] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSave, setLastSave] = useState("");
  const [price, setPrice] = useState<[number, number] | null>(null);
  const [mode, setMode] = useState<"paste" | "files">("paste");
  const [picking, setPicking] = useState(false);
  const stop = useRef(false);
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== "split" || engineKind !== "key" || !isApp()) return;
    void storyReadPrice().then((p) => here.current && setPrice(p));
  }, [phase, engineKind]);

  // Drafts not yet saved or skipped, and a read in progress, are asked about before leaving.
  useDirtyGuard(phase === "read" && (running || unsavedCount(items) > 0));

  const patchItem = (id: string, f: (i: BulkItem) => BulkItem) => setItems((all) => all.map((i) => (i.id === id ? f(i) : i)));

  // ---------- Step 1: the text ----------

  const findInPaste = () => {
    const found = piecesFromPaste(raw);
    setNotes([]);
    setPieces(found);
    setPhase("split");
  };
  const fromPaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    setPicking(true);
    try {
      const got = await readStoryFiles(paths);
      if (!here.current) return;
      setNotes(got.skipped);
      setPieces(piecesFromFiles(got.files));
      setPhase("split");
    } catch {
      if (here.current) setNotes(["Ensayo could not read those files. Check that they are still there, then try again."]);
    } finally {
      if (here.current) setPicking(false);
    }
  };

  // ---------- Step 2: check the split ----------

  const total = pieces.reduce((n, p) => n + p.text.length, 0);

  // ---------- Step 3: read ----------

  const startRun = async (ids: string[], list: BulkItem[]) => {
    stop.current = false;
    setStopping(false);
    setRunning(true);
    const todo = ids.map((id) => list.find((i) => i.id === id)).filter((i): i is BulkItem => !!i);
    await runReads(todo, {
      parse: parse ?? (isApp() ? undefined : previewParse),
      stopRequested: () => stop.current,
      alive: () => here.current,
      onStart: (id) => patchItem(id, (i) => ({ ...i, status: "reading", error: undefined })),
      onRead: (id, draft) => patchItem(id, (i) => withRead(i, draft, savedStories.current)),
      onFail: (id, message) => patchItem(id, (i) => withFailure(i, message)),
    });
    if (here.current) {
      setRunning(false);
      setStopping(false);
    }
  };
  const readAll = () => {
    const list = pieces.map(newItem);
    setItems(list);
    setLastSave("");
    setReviewing(null);
    setPhase("read");
    void startRun(list.map((i) => i.id), list);
  };
  const readRest = () => void startRun(items.filter((i) => i.status === "waiting").map((i) => i.id), items);
  const tryAgain = (id: string) => void startRun([id], items);
  const onStop = () => {
    stop.current = true;
    setStopping(true);
  };

  // ---------- Step 4: the list ----------

  const readCount = items.filter((i) => i.status === "read" || i.status === "failed").length;
  const waiting = items.filter((i) => i.status === "waiting").length;
  const chosen = savable(items);

  const editFields = (item: BulkItem, patch: Partial<ReviewFields>) => patchItem(item.id, (i) => ({ ...i, fields: { ...reviewOf(i).fields, ...patch } }));
  const editRows = (item: BulkItem, rows: NumberRow[]) => patchItem(item.id, (i) => ({ ...i, rows }));

  const save = async (list: BulkItem[]) => {
    if (list.length === 0 || saving) return;
    setSaving(true);
    let failed = 0;
    const n = await saveItems(list, saveStory, (id, ok) => {
      if (ok) patchItem(id, (i) => ({ ...i, outcome: "saved", saveFailed: false }));
      else {
        failed++;
        patchItem(id, (i) => ({ ...i, saveFailed: true }));
      }
    });
    if (here.current) {
      setSaving(false);
      setLastSave(savedLine(n, failed));
    }
  };

  const noEngine = engineKind === "timing" && isApp();

  // ---------- Screen ----------

  return (
    <AppShell nav="stories">
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <BackLink to="5-1-stories" label="Stories" />
        <h1 className="e-h1">Add many stories</h1>
        <span className="e-meta">Paste several at once, or pick the files. You check the split first, then every draft, and nothing is saved until you say so.</span>
      </div>

      {phase === "input" && (
        <>
          <div style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)", alignSelf: "flex-start" }} role="tablist">
            <button type="button" role="tab" aria-selected={mode === "paste"} className={mode === "paste" ? "e-btn e-btn-sm" : "e-btn e-btn-sm e-btn-ghost"} style={mode === "paste" ? { background: "var(--e-tint)", color: "var(--e-ink)" } : undefined} onClick={() => setMode("paste")}>Paste them</button>
            <button type="button" role="tab" aria-selected={mode === "files"} className={mode === "files" ? "e-btn e-btn-sm" : "e-btn e-btn-sm e-btn-ghost"} style={mode === "files" ? { background: "var(--e-tint)", color: "var(--e-ink)" } : undefined} onClick={() => setMode("files")}>Pick files</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
            <section className="e-card" style={{ flex: "999 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
              {mode === "paste" ? (
                <>
                  <div className="e-field">
                    <label htmlFor="many-raw">Your stories, one after another</label>
                    <textarea id="many-raw" className="e-input" rows={12} value={raw} onChange={(e) => setRaw(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                    <button type="button" className="e-btn e-btn-primary" disabled={raw.trim() === ""} style={raw.trim() === "" ? { opacity: 0.5, cursor: "not-allowed" } : undefined} onClick={findInPaste}>Find the stories</button>
                    <Link to="5-1-stories" className="e-btn e-btn-ghost">Cancel</Link>
                    {raw.trim() === "" && <span className="e-small">Paste something first.</span>}
                  </div>
                </>
              ) : (
                <>
                  <span className="e-meta">Each file becomes one story. Pick Markdown or text files, a folder of them, or a Notion export zip.</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                    <button type="button" className="e-btn e-btn-primary" disabled={picking || !isApp()} onClick={() => void pickStoryFiles().then(fromPaths)}>Choose files</button>
                    <button type="button" className="e-btn e-btn-soft" disabled={picking || !isApp()} onClick={() => void pickStoryFolder().then(fromPaths)}>Choose a folder</button>
                    <button type="button" className="e-btn e-btn-soft" disabled={picking || !isApp()} onClick={() => void pickStoryZip().then(fromPaths)}>Choose a Notion zip</button>
                    <Link to="5-1-stories" className="e-btn e-btn-ghost">Cancel</Link>
                  </div>
                  {!isApp() && <span className="e-small">Picking files works in the Ensayo app, not in the browser preview.</span>}
                  {picking && <span className="e-small" role="status">Reading your files…</span>}
                  {notes.map((n) => (
                    <span key={n} className="e-meta" role="status">{n}</span>
                  ))}
                </>
              )}
            </section>
            <aside className="e-card" style={{ flex: "1 1 280px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
              <span className="e-h3">How it splits</span>
              <span className="e-meta">At each heading that starts with # or ##. With no headings, at lines of three or more dashes, then at two blank lines in a row. You can fix the split before anything is read.</span>
              <span className="e-h3">From Notion</span>
              <span className="e-meta">In Notion, choose Export, then Markdown. Pick the zip here, or unzip it and pick the folder.</span>
              <div className="e-soft" style={{ padding: "14px 16px" }}>
                <span className="e-meta" style={{ color: "var(--e-ink)" }}>Ensayo never adds a number, result or detail that isn't in your text.</span>
              </div>
            </aside>
          </div>
        </>
      )}

      {phase === "split" && (
        <section className="e-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <h2 className="e-h2">{pieces.length === 0 ? "We didn't find any stories" : foundLine(pieces.length)}</h2>
            <span className="e-meta">{pieces.length === 0 ? "Go back and check the text or the files." : "Check the split. Join two that belong together, cut one in two, or remove one."}</span>
            {notes.map((n) => (
              <span key={n} className="e-meta" role="status">{n}</span>
            ))}
          </div>
          <ol style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column" }}>
            {pieces.map((p, i) => (
              <li key={p.id} className="e-rowline" style={{ flexDirection: "column", alignItems: "stretch", gap: "10px", padding: "12px 0" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
                  <span className="e-small" style={{ flex: "none", width: "28px" }}>{i + 1}</span>
                  <div style={{ flex: "1 1 240px", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontWeight: "600", overflowWrap: "anywhere" }}>{firstLine(p.text) || (p.source ? titleFromFileName(p.source) : "(no text)")}</span>
                    <span className="e-small">{p.source ? `${p.source} · ` : ""}{p.text.length.toLocaleString()} characters</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setEditingPiece(editingPiece === i ? null : i)} aria-expanded={editingPiece === i}>{editingPiece === i ? "Close" : "Cut in two"}</button>
                    <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={i === pieces.length - 1} onClick={() => setPieces(mergeNext(pieces, i))}>Join with next</button>
                    <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setPieces(removePiece(pieces, i))}>Remove</button>
                  </div>
                </div>
                {editingPiece === i && (
                  <SplitEditor
                    text={p.text}
                    onText={(t) => setPieces(editPiece(pieces, i, t))}
                    onCut={(offset) => {
                      setPieces(splitAt(pieces, i, offset));
                      setEditingPiece(null);
                    }}
                  />
                )}
              </li>
            ))}
          </ol>
          {pieces.length > 0 && (
            <div className="e-soft" role="status">
              <span className="e-meta" style={{ color: "var(--e-ink)" }}>{estimateLine({ count: pieces.length, totalChars: total, kind: noEngine ? "timing" : engineKind, price })}</span>
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
            <button type="button" className="e-btn e-btn-primary" disabled={pieces.length === 0 || noEngine} style={pieces.length === 0 || noEngine ? { opacity: 0.5, cursor: "not-allowed" } : undefined} onClick={readAll}>
              {pieces.length === 1 ? "Read this story" : `Read these ${pieces.length}`}
            </button>
            <button type="button" className="e-btn e-btn-ghost" onClick={() => setPhase("input")}>Back</button>
            {noEngine && <span className="e-small">{NO_ENGINE_LINE}</span>}
          </div>
        </section>
      )}

      {phase === "read" && (
        <>
          <section className="e-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px 20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}>
              <span className="e-h3" role="status" aria-live="polite">
                {running ? (stopping ? `Stopping after this one (${readCount} of ${items.length} read)` : progressLine(readCount, items.length)) : waiting > 0 ? `Stopped. ${readCount} of ${items.length} read.` : `Read ${items.length} ${items.length === 1 ? "story" : "stories"}`}
              </span>
              <span className="e-meta">{lastSave || "Nothing is saved yet. Tick the ones you want, then save them."}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {running && (
                <button type="button" className="e-btn e-btn-line" disabled={stopping} onClick={onStop}>
                  Stop
                </button>
              )}
              {!running && waiting > 0 && <button type="button" className="e-btn e-btn-soft" onClick={readRest}>Read the other {waiting}</button>}
              <button type="button" className="e-btn e-btn-primary" disabled={chosen.length === 0 || saving} style={chosen.length === 0 || saving ? { opacity: 0.5, cursor: "not-allowed" } : undefined} onClick={() => void save(chosen)}>
                {saving ? "Saving…" : `Save all checked (${chosen.length})`}
              </button>
            </div>
          </section>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {items.map((item, n) => (
              <DraftCard
                key={item.id}
                item={item}
                n={n + 1}
                running={running}
                saving={saving}
                open={reviewing === item.id}
                onOpen={() => setReviewing(reviewing === item.id ? null : item.id)}
                onCheck={(on) => patchItem(item.id, (i) => ({ ...i, checked: on }))}
                onSave={() => void save([item])}
                onSkip={() => patchItem(item.id, (i) => ({ ...i, outcome: i.outcome === "skipped" ? "open" : "skipped", checked: false }))}
                onAgain={() => tryAgain(item.id)}
                onBlank={() => patchItem(item.id, (i) => withBlank(i, savedStories.current))}
                onFields={(p) => editFields(item, p)}
                onRows={(r) => editRows(item, r)}
              />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

/** Cutting a piece in two: its text in a box, and a button that cuts where the cursor is. */
function SplitEditor({ text, onText, onCut }: { text: string; onText: (t: string) => void; onCut: (offset: number) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span className="e-meta">Click where the second story starts, then press Cut here. You can also fix the text.</span>
      <textarea ref={ref} className="e-input" rows={8} aria-label="This story's text" value={text} onChange={(e) => onText(e.target.value)} />
      <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => onCut(ref.current?.selectionStart ?? 0)}>Cut here</button>
    </div>
  );
}

interface CardProps {
  item: BulkItem;
  n: number;
  running: boolean;
  saving: boolean;
  open: boolean;
  onOpen: () => void;
  onCheck: (on: boolean) => void;
  onSave: () => void;
  onSkip: () => void;
  onAgain: () => void;
  onBlank: () => void;
  onFields: (p: Partial<ReviewFields>) => void;
  onRows: (r: NumberRow[]) => void;
}

function DraftCard({ item, n, running, saving, open, onOpen, onCheck, onSave, onSkip, onAgain, onBlank, onFields, onRows }: CardProps) {
  const label = firstLine(item.text) || `Story ${n}`;
  const skipped = item.outcome === "skipped";
  const saved = item.outcome === "saved";
  const review = reviewOf(item);
  const story = item.draft?.story;
  const numbers = review.rows.filter((r) => r.label.trim() || r.value.trim());
  const shown = numbers.slice(0, 3).map((r) => (r.label.trim() ? `${r.label.trim()}: ${r.value.trim()}` : r.value.trim()));
  const pill = item.status === "read" || item.blank ? itemStory(item).headline : "";
  const body = (
    <>
      {item.status === "waiting" && <span className="e-meta">Waiting. {label}</span>}
      {item.status === "reading" && <span className="e-meta" role="status">Reading this one… {label}</span>}
      {item.status === "failed" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span className="e-h3">Couldn't read this one</span>
          <span className="e-meta" style={{ overflowWrap: "anywhere" }}>{label}</span>
          {item.error && <span className="e-meta" style={{ color: "var(--e-warn-ink)", overflowWrap: "anywhere" }}>{item.error}</span>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <button type="button" className="e-btn e-btn-soft e-btn-sm" disabled={running} onClick={onAgain}>Try again</button>
            <button type="button" className="e-btn e-btn-soft e-btn-sm" onClick={onBlank}>Start blank</button>
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={onSkip}>{skipped ? "Bring it back" : "Skip"}</button>
          </div>
        </div>
      )}
      {(item.status === "read" || item.blank) && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "0" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
            <span className="e-h3" style={{ overflowWrap: "anywhere", minWidth: "0" }}>{review.fields.title || label}</span>
            {item.blank && <span className="e-badge">Started blank</span>}
            {item.duplicateOf && <span className="e-badge" title={`Likely duplicate of ${item.duplicateOf}`} style={{ background: "var(--e-highlight)", color: "var(--e-warn-ink)" }}>Likely duplicate of {item.duplicateOf}</span>}
            {saved && <span className="e-badge e-badge-ok">Saved</span>}
            {skipped && <span className="e-badge">Skipped</span>}
            {item.saveFailed && <span className="e-badge" style={{ color: "var(--e-warn-ink)" }}>Could not save</span>}
          </div>
          <span className="e-small">{[review.fields.company, story?.year].filter((x) => x && String(x).trim()).join(" · ") || "No company found"}</span>
          {pill !== "" && <ResultPill headline={pill} />}
          {review.fields.headline.trim() !== "" && <span className="e-meta" style={{ overflowWrap: "anywhere" }}>{review.fields.headline}</span>}
          <span className="e-meta">{shown.length > 0 ? shown.join(" · ") : "No numbers found in your text."}</span>
          {!saved && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button type="button" className="e-btn e-btn-soft e-btn-sm" aria-expanded={open} onClick={onOpen}>{open ? "Close review" : "Review"}</button>
              {!skipped && <button type="button" className="e-btn e-btn-primary e-btn-sm" disabled={saving || !canSave(item)} onClick={onSave}>Save</button>}
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={onSkip}>{skipped ? "Bring it back" : "Skip"}</button>
            </div>
          )}
          {open && !saved && (
            <>
              {item.blank && (
                <details>
                  <summary className="e-small" style={{ cursor: "pointer" }}>Your text</summary>
                  <p className="e-meta" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.text}</p>
                </details>
              )}
              <BulkReviewFields idPrefix={`bulk-${item.id}`} fields={review.fields} rows={review.rows} dropped={review.dropped} onFields={onFields} onRows={onRows} />
            </>
          )}
        </div>
      )}
    </>
  );
  const ready = item.status === "read" || item.blank;
  return (
    <article className="e-card" style={{ display: "flex", alignItems: "flex-start", gap: "14px", minWidth: "0", ...(skipped ? { opacity: 0.6 } : {}) }} aria-label={`Story ${n}`}>
      {ready && !saved && !skipped ? (
        <input type="checkbox" className="e-check" style={{ marginTop: "4px", flex: "none" }} checked={item.checked} aria-label={`Save story ${n}: ${label}`} onChange={(e) => onCheck(e.target.checked)} />
      ) : (
        <span className="e-small" style={{ flex: "none", width: "18px", marginTop: "2px" }}>{n}</span>
      )}
      <div style={{ flex: "1", minWidth: "0" }}>{body}</div>
    </article>
  );
}
