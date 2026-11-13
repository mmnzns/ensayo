// A data file Ensayo could not read (a damaged you.json or method). The rest of the data loads; this names the file
// (its name only, never the folder) and offers Show file so the person can look at it, fix it or send it.
import { revealPath } from "../ui/openExternal";

export interface DamagedFile {
  name: string;
  /** Only for Show file. Never shown or logged. */
  path: string;
}

/** The sentence for one file. */
export const damagedFileLine = (file: DamagedFile): string => `${file.name} can't be read, so Ensayo left it out. Your other data is here.`;

export function DamagedFilesBanner({ files, reveal = revealPath }: { files: DamagedFile[]; reveal?: (path: string) => Promise<void> }) {
  if (files.length === 0) return null;
  return (
    <div role="alert" className="e-card" style={{ margin: "12px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
      {files.map((f) => (
        <div key={f.path} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="e-meta" style={{ flex: "1 1 320px", color: "var(--e-warn-ink)" }}>{damagedFileLine(f)}</span>
          <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => void reveal(f.path).catch(() => {})}>Show file</button>
        </div>
      ))}
    </div>
  );
}
