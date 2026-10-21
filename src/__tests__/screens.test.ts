import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allScreens, registry } from "../screens/registry";
import { manifest } from "../screens/manifest";

const DESIGN = "/Users/miguel.monzones/My Drive (mikeymonzones@gmail.com)/MAIN DRIVE - Miguel/FILES - Projects & Work/Ensayo/Design/screens/html";

describe("screens", () => {
  it("has 46 designed screens with unique ids", () => {
    const ids = manifest.filter((m) => m.designed).map((m) => m.id);
    expect(ids.length).toBe(46);
    expect(new Set(ids).size).toBe(46);
  });

  it("matches the design folder when it is available", () => {
    let files: string[];
    try {
      files = readdirSync(DESIGN).filter((f) => f.endsWith(".html") && f !== "ensayo-logo.html");
    } catch {
      return; // the Drive folder is not mounted here (CI)
    }
    expect(manifest.filter((m) => m.designed).map((m) => `${m.id}.html`).sort()).toEqual(files.sort());
  });

  it("registers a component for every screen, extras included, with no duplicate ids", () => {
    const ids = allScreens.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(registry[id], id).toBeTruthy();
  });

  it("names every screen's component uniquely within its group", () => {
    const seen = new Set<string>();
    for (const s of allScreens) {
      const key = `${s.group}/${s.name}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("gives app-shell screens a sidebar item and focus screens none", () => {
    for (const s of allScreens) {
      if (s.shell === "app") expect(s.nav, s.id).toBeTruthy();
      else expect(s.nav, s.id).toBeUndefined();
    }
  });
});
