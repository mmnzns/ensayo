import { beforeEach, describe, expect, it, vi } from "vitest";

const open = vi.fn();
const save = vi.fn();
let broken = false;
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (o: unknown) => {
    if (broken) throw new Error("no dialog");
    return open(o);
  },
  save: (o: unknown) => {
    if (broken) throw new Error("no dialog");
    return save(o);
  },
}));

import { pickBackupFile, pickBackupSavePath } from "../ui/pickFile";
import { backupFileName, backupProblemLine, countsLine, dateWords, lastBackupLine, readLastBackup, restoredLine, saveLastBackup } from "../screens/settings/backup";
import { clearPrefs, LAST_BACKUP_KEY } from "../screens/settings/prefs";

beforeEach(() => {
  open.mockReset();
  save.mockReset();
  broken = false;
});

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("the backup dialogs", () => {
  it("asks where to save, starting from the dated name, and only offers zip", async () => {
    save.mockResolvedValue("/Users/me/Desktop/ensayo-backup-2026-10-22.zip");
    expect(await pickBackupSavePath("ensayo-backup-2026-10-22.zip")).toBe("/Users/me/Desktop/ensayo-backup-2026-10-22.zip");
    expect(save).toHaveBeenCalledWith({ title: "Save your backup", defaultPath: "ensayo-backup-2026-10-22.zip", filters: [{ name: "Ensayo backup", extensions: ["zip"] }] });
  });
  it("asks for one zip to restore from", async () => {
    open.mockResolvedValue("/Users/me/backup.zip");
    expect(await pickBackupFile()).toBe("/Users/me/backup.zip");
    expect(open).toHaveBeenCalledWith({ multiple: false, directory: false, filters: [{ name: "Ensayo backup", extensions: ["zip"] }], title: "Choose a backup to restore" });
  });
  it("gives null when the person cancels, and in the browser preview where there is no dialog", async () => {
    save.mockResolvedValue(null);
    open.mockResolvedValue(null);
    expect(await pickBackupSavePath("x.zip")).toBeNull();
    expect(await pickBackupFile()).toBeNull();
    broken = true;
    await expect(pickBackupSavePath("x.zip")).resolves.toBeNull();
    await expect(pickBackupFile()).resolves.toBeNull();
  });
});

describe("the backup words", () => {
  it("names the file by the date", () => {
    expect(backupFileName(new Date(2026, 9, 22))).toBe("ensayo-backup-2026-10-22.zip");
    expect(backupFileName(new Date(2026, 0, 5))).toBe("ensayo-backup-2026-01-05.zip");
  });
  it("says the last backup date, or that there is none", () => {
    expect(dateWords(new Date(2026, 9, 22, 12).toISOString())).toBe("Oct 22, 2026");
    expect(lastBackupLine(new Date(2026, 9, 22, 12).toISOString())).toBe("Last backup: Oct 22, 2026");
    expect(lastBackupLine(null)).toBe("No backup made on this computer yet.");
    expect(lastBackupLine("garbage")).toBe("No backup made on this computer yet.");
  });
  it("counts what is in a backup", () => {
    expect(countsLine({ stories: 12, targets: 2, applications: 1, sessions: 0 })).toBe("12 stories, 2 targets, 1 application, 0 sessions");
  });
  it("says what a restore did, with no em dashes", () => {
    const merge = restoredLine({ mode: "merge", written: 11, unchanged: 1, skipped: 2, safety_backup: null });
    expect(merge).toContain("Added 11 files");
    expect(merge).toContain("2 files were already there with different content, so your version was kept");
    expect(restoredLine({ mode: "merge", written: 1, unchanged: 0, skipped: 0, safety_backup: null })).toBe("Added 1 file from the backup. Ensayo is reopening.");
    expect(restoredLine({ mode: "replace", written: 5, unchanged: 0, skipped: 0, safety_backup: "/x.zip" })).toContain("A copy of what you had before is saved");
    for (const line of [merge, restoredLine({ mode: "replace", written: 1, unchanged: 0, skipped: 0, safety_backup: "/x" })]) expect(line).not.toContain("—");
  });
  it("shows a command's error without the Error prefix", () => {
    expect(backupProblemLine("This backup is from a newer Ensayo. Update the app first.")).toBe("This backup is from a newer Ensayo. Update the app first.");
    expect(backupProblemLine(new Error("Error: nope"))).toBe("nope");
    expect(backupProblemLine("")).toBe("Something went wrong. Nothing was changed.");
  });
});

describe("the last backup memory", () => {
  it("is kept on this computer, ignores junk, survives blocked storage, and goes with the other saved choices on delete", () => {
    const mem = memory();
    expect(readLastBackup(mem)).toBeNull();
    saveLastBackup("2026-10-22T09:30:00Z", mem);
    expect(readLastBackup(mem)).toBe("2026-10-22T09:30:00Z");
    mem.setItem(LAST_BACKUP_KEY, "junk");
    expect(readLastBackup(mem)).toBeNull();
    saveLastBackup("2026-10-22T09:30:00Z", mem);
    clearPrefs(mem);
    expect(readLastBackup(mem)).toBeNull();
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readLastBackup(blocked)).toBeNull();
    expect(() => saveLastBackup("2026-10-22T09:30:00Z", blocked)).not.toThrow();
    expect(readLastBackup(null)).toBeNull();
  });
});
