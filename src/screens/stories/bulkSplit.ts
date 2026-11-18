// Splitting one big paste, or the files a person picked, into separate stories. Pure: no screen and no AI, so the rules
// can be tested. The split is only a first guess; the person merges, splits and removes before anything is read.

export interface Piece {
  id: string;
  text: string;
  /** The file it came from, when it came from a file. */
  source?: string;
}

const DASHES = /^\s*-{3,}\s*$/;
const FENCE = /^\s*(```|~~~)/;

let counter = 0;
const nextId = () => `p${++counter}`;
export const makePiece = (text: string, source?: string): Piece => ({ id: nextId(), text: text.trim(), ...(source ? { source } : {}) });

/** The heading level (1 or 2) of a "# Title" or "## Title" line, else 0. Deeper headings are sections inside a story. */
function headingLevel(line: string): number {
  const m = /^(#{1,2})\s+\S/.exec(line);
  return m ? m[1].length : 0;
}

/** The lines outside code fences, with their index, so a "#" inside a code block never splits anything. */
function outsideFences(lines: string[]): boolean[] {
  let inside = false;
  return lines.map((l) => {
    if (FENCE.test(l)) {
      inside = !inside;
      return false;
    }
    return !inside;
  });
}

const blank = (s: string) => s.trim() === "";
const hasWords = (s: string) => /[\p{L}\p{N}]/u.test(s);

/** Cuts the lines into blocks before each index in `starts` (and drops lines in `drop`). */
function cut(lines: string[], starts: Set<number>, drop: Set<number>): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  lines.forEach((l, i) => {
    if (starts.has(i) && cur.length) {
      out.push(cur.join("\n"));
      cur = [];
    }
    if (!drop.has(i)) cur.push(l);
  });
  out.push(cur.join("\n"));
  return out;
}

/** The blocks of a paste. Headings (# or ##) first, using the highest level that is there; else lines of three or more
 *  dashes; else two or more blank lines in a row. Empty blocks are dropped. */
export function splitPaste(raw: string): string[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const live = outsideFences(lines);
  const levels = lines.map((l, i) => (live[i] ? headingLevel(l) : 0));
  const top = levels.some((v) => v === 1) ? 1 : levels.some((v) => v === 2) ? 2 : 0;
  const dashes = new Set(lines.flatMap((l, i) => (live[i] && DASHES.test(l) ? [i] : [])));

  let blocks: string[];
  if (top > 0 || dashes.size > 0) {
    const starts = new Set<number>([...dashes]);
    if (top > 0) levels.forEach((v, i) => v === top && starts.add(i));
    blocks = cut(lines, starts, dashes);
  } else {
    const starts = new Set<number>();
    const drop = new Set<number>();
    let run = 0;
    lines.forEach((l, i) => {
      if (blank(l)) {
        run++;
        return;
      }
      if (run >= 2) {
        starts.add(i);
        for (let k = i - run; k < i; k++) drop.add(k);
      }
      run = 0;
    });
    blocks = cut(lines, starts, drop);
  }
  return blocks.map((b) => b.trim()).filter(hasWords);
}

export const piecesFromPaste = (raw: string): Piece[] => splitPaste(raw).map((t) => makePiece(t));

/** One file is one story, whatever is inside it. Empty files are left out. */
export const piecesFromFiles = (files: { name: string; text: string }[]): Piece[] => files.filter((f) => hasWords(f.text)).map((f) => makePiece(f.text, f.name));

/** The first line of a story as a person would name it: no "#" marks, no list bullets, cut at 80 characters. */
export function firstLine(text: string): string {
  const line = text.split(/\r?\n/).find((l) => hasWords(l)) ?? "";
  const clean = line.replace(/^\s*(#{1,6}\s+|[-*+]\s+|>\s*)/, "").replace(/[*_`]/g, "").trim();
  return clean.length > 80 ? `${clean.slice(0, 79).trimEnd()}…` : clean;
}

/** A file's name as a title: no extension, and no Notion id (a run of 32 letters and digits) at the end. */
export function titleFromFileName(name: string): string {
  return name.replace(/\.(md|markdown|txt)$/i, "").replace(/\s+[0-9a-f]{32}$/i, "").trim();
}

/** Joins a piece to the one after it. */
export function mergeNext(pieces: Piece[], index: number): Piece[] {
  if (index < 0 || index >= pieces.length - 1) return pieces;
  const [a, b] = [pieces[index], pieces[index + 1]];
  const joined: Piece = { ...a, text: `${a.text}\n\n${b.text}` };
  return [...pieces.slice(0, index), joined, ...pieces.slice(index + 2)];
}

/** Cuts a piece in two at a character position. Nothing changes when either side would be empty. */
export function splitAt(pieces: Piece[], index: number, offset: number): Piece[] {
  const p = pieces[index];
  if (!p) return pieces;
  const left = p.text.slice(0, offset).trim();
  const right = p.text.slice(offset).trim();
  if (!hasWords(left) || !hasWords(right)) return pieces;
  return [...pieces.slice(0, index), { ...p, text: left }, makePiece(right, p.source), ...pieces.slice(index + 1)];
}

export const removePiece = (pieces: Piece[], index: number): Piece[] => pieces.filter((_, i) => i !== index);

export const editPiece = (pieces: Piece[], index: number, text: string): Piece[] => pieces.map((p, i) => (i === index ? { ...p, text } : p));

/** "We found 12 stories", "We found 1 story". */
export const foundLine = (n: number): string => `We found ${n} ${n === 1 ? "story" : "stories"}`;
