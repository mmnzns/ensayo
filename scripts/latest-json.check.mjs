// Run with: node --test scripts/latest-json.check.mjs
// (Not named *.test.* so Vitest, which runs the app's tests, doesn't pick it up.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_REPO, buildLatest, missingPlatforms, platformsFor } from "./latest-json.mjs";

const base = { repo: "mmnzns/ensayo", tag: "v0.2.0", notes: "n", pubDate: "2026-10-20T00:00:00.000Z" };
const WIN = { name: "Ensayo_0.2.0_x64-setup.exe.sig", signature: "WIN" };
const ARM = { name: "Ensayo_0.2.0_aarch64.app.tar.gz.sig", signature: "ARM\n" };
const INTEL = { name: "Ensayo_0.2.0_x64.app.tar.gz.sig", signature: "INTEL" };

describe("latest.json", () => {
  it("maps updater signatures to the updater's platform keys", () => {
    assert.deepEqual(platformsFor(WIN.name), ["windows-x86_64", "windows-x86_64-nsis"]);
    assert.deepEqual(platformsFor(ARM.name), ["darwin-aarch64", "darwin-aarch64-app"]);
    assert.deepEqual(platformsFor(INTEL.name), ["darwin-x86_64", "darwin-x86_64-app"]);
    assert.deepEqual(platformsFor("Ensayo_0.2.0_aarch64.dmg"), []);
  });

  it("holds every platform whichever was uploaded first", () => {
    const sigs = [ARM, WIN, INTEL];
    const a = buildLatest({ ...base, sigs });
    assert.deepEqual(a, buildLatest({ ...base, sigs: [...sigs].reverse() }));
    assert.equal(a.version, "0.2.0");
    assert.deepEqual(Object.keys(a.platforms).sort(), ["darwin-aarch64", "darwin-aarch64-app", "darwin-x86_64", "darwin-x86_64-app", "windows-x86_64", "windows-x86_64-nsis"]);
    assert.deepEqual(a.platforms["windows-x86_64"], { signature: "WIN", url: "https://github.com/mmnzns/ensayo/releases/download/v0.2.0/Ensayo_0.2.0_x64-setup.exe" });
    assert.equal(a.platforms["darwin-aarch64"].signature, "ARM");
    assert.equal(a.platforms["darwin-x86_64"].url, "https://github.com/mmnzns/ensayo/releases/download/v0.2.0/Ensayo_0.2.0_x64.app.tar.gz");
  });

  it("finds signatures the uploaded file lacks, so a racing upload gets rebuilt", () => {
    const winOnly = buildLatest({ ...base, sigs: [WIN] });
    assert.deepEqual(missingPlatforms(winOnly, [WIN]), []);
    assert.deepEqual(missingPlatforms(winOnly, [WIN, ARM]), ["darwin-aarch64", "darwin-aarch64-app"]);
    assert.deepEqual(missingPlatforms(buildLatest({ ...base, sigs: [WIN, ARM] }), [WIN, ARM]), []);
    assert.deepEqual(missingPlatforms(winOnly, [{ ...WIN, signature: "WIN2" }]), ["windows-x86_64", "windows-x86_64-nsis"]);
    assert.equal(missingPlatforms(undefined, [WIN]).length, 2);
  });

  it("refuses to write an empty file", () => {
    assert.throws(() => buildLatest({ ...base, sigs: [] }), /no updater signatures/);
  });

  it("points at the Ensayo repo itself, the same one tauri.conf.json's endpoint names", () => {
    const conf = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
    assert.deepEqual(conf.plugins.updater.endpoints, [`https://github.com/${DEFAULT_REPO}/releases/latest/download/latest.json`]);
    assert.equal(conf.bundle.createUpdaterArtifacts, true);
  });
});
