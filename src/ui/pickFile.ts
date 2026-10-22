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
