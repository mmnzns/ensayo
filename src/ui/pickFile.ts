// The system file and folder picker (Tauri dialog plugin), used only in the app. The browser keeps its own file input.
// Each returns the chosen path, or null when the person cancels or the picker is not available.

export const RESUME_FILTER = { name: "PDF or Word", extensions: ["pdf", "doc", "docx"] };

async function pick(options: { directory: boolean; title: string; filters?: (typeof RESUME_FILTER)[] }): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const chosen = await open({ multiple: false, ...options });
    return typeof chosen === "string" && chosen ? chosen : null;
  } catch {
    return null;
  }
}

export const pickResumePath = () => pick({ directory: false, filters: [RESUME_FILTER], title: "Choose your resume" });
export const pickFolder = () => pick({ directory: true, title: "Choose the data folder" });

export const BACKUP_FILTER = { name: "Ensayo backup", extensions: ["zip"] };

/** Asks where to save a backup, starting from `defaultName`. Null when the person cancels or the picker is not there. */
export async function pickBackupSavePath(defaultName: string): Promise<string | null> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const chosen = await save({ title: "Save your backup", defaultPath: defaultName, filters: [BACKUP_FILTER] });
    return typeof chosen === "string" && chosen ? chosen : null;
  } catch {
    return null;
  }
}

/** Asks for a backup zip to restore from. */
export const pickBackupFile = () => pick({ directory: false, filters: [BACKUP_FILTER], title: "Choose a backup to restore" });
