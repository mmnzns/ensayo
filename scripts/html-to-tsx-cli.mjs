// node scripts/html-to-tsx-cli.mjs [--index] [screen-id ...]   (no ids = every designed screen)
// Reads src/screens/manifest.ts and the design export, writes src/screens/<group>/<Name>.tsx drafts.
// --index also (re)writes each group's index.ts with the routes of the screens that have a file. One-time bootstrap:
// after that, each group owns its index.ts and its screens, and re-running this would overwrite hand work.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convertPage } from "./html-to-tsx.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESIGN = process.env.ENSAYO_DESIGN || "/Users/miguel.monzones/My Drive (mikeymonzones@gmail.com)/MAIN DRIVE - Miguel/FILES - Projects & Work/Ensayo/Design/screens/html";

const manifestSrc = readFileSync(join(root, "src/screens/manifest.ts"), "utf8");
const entries = [...manifestSrc.matchAll(/\{ id: "([^"]+)", title: ("(?:[^"\\]|\\.)*"), shell: "(app|focus)",(?: nav: "(\w+)",)? group: "([\w-]+)", name: "(\w+)", designed: true \}/g)].map((m) => ({
  id: m[1],
  shell: m[3],
  nav: m[4],
  group: m[5],
  name: m[6],
}));
if (entries.length !== 46) throw new Error(`expected 46 designed screens in the manifest, found ${entries.length}`);

const args = process.argv.slice(2);
const writeIndex = args.includes("--index");
const ids = args.filter((a) => !a.startsWith("--"));
const todo = ids.length ? entries.filter((e) => ids.includes(e.id)) : entries;

for (const e of todo) {
  const html = readFileSync(join(DESIGN, `${e.id}.html`), "utf8");
  const dir = join(root, "src/screens", e.group);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${e.name}.tsx`), convertPage(html, e));
  console.log(`${e.id} -> src/screens/${e.group}/${e.name}.tsx`);
}

if (writeIndex) {
  for (const group of [...new Set(entries.map((e) => e.group))]) {
    const mine = entries.filter((e) => e.group === group && existsSync(join(root, "src/screens", group, `${e.name}.tsx`)));
    const lines = [
      `import type { ComponentType } from "react";`,
      `import type { ManifestEntry } from "../manifest";`,
      ...mine.map((e) => `import ${e.name} from "./${e.name}";`),
      "",
      "/** Screen id to component, for this group's screens. */",
      "export const routes: Record<string, ComponentType> = {",
      ...mine.map((e) => `  "${e.id}": ${e.name},`),
      "};",
      "",
      "/** Extra screens (states, dialogs) this group adds beyond the 46 in the design export. */",
      "export const extras: ManifestEntry[] = [];",
      "",
    ];
    writeFileSync(join(root, "src/screens", group, "index.ts"), lines.join("\n"));
    console.log(`src/screens/${group}/index.ts (${mine.length} screens)`);
  }
}
