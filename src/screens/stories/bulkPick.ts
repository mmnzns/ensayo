// Choosing and reading the files for "Add many at once" (app only; the Tauri dialog plugin the resume picker already
// uses). Each picker returns the chosen paths, or none when the person cancels or the picker is not there.
import { invoke } from "@tauri-apps/api/core";

export const STORY_FILTER = { name: "Notes (Markdown or text)", extensions: ["md", "markdown", "txt"] };
export const ZIP_FILTER = { name: "Notion export", extensions: ["zip"] };

async function pick(options: { directory: boolean; multiple: boolean; title: string; filters?: { name: string; extensions: string[] }[] }): Promise<string[]> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const chosen = await open(options);
    return Array.isArray(chosen) ? chosen.filter((c): c is string => typeof c === "string" && c !== "") : typeof chosen === "string" && chosen ? [chosen] : [];
  } catch {
    return [];
  }
}

export const pickStoryFiles = () => pick({ directory: false, multiple: true, filters: [STORY_FILTER], title: "Choose your story files" });
export const pickStoryZip = () => pick({ directory: false, multiple: false, filters: [ZIP_FILTER], title: "Choose a Notion export" });
export const pickStoryFolder = () => pick({ directory: true, multiple: false, title: "Choose a folder of stories" });

export interface ReadFiles {
  files: { name: string; text: string }[];
  skipped: string[];
}

/** The text of the picked files, a folder's files or a zip's files. The Rust side only reads. */
export const readStoryFiles = (paths: string[]): Promise<ReadFiles> => invoke<ReadFiles>("read_story_files", { paths });

/** `[input, output]` dollars per million tokens for the model the story read uses, or null when it is not on the price list. */
export async function storyReadPrice(): Promise<[number, number] | null> {
  try {
    const view = await invoke<{ settings: { provider: string; fast_model: string }; providers: { id: string; fast_default: string }[] }>("ai_settings");
    const p = view.providers.find((x) => x.id === view.settings.provider);
    const model = (view.settings.fast_model || p?.fast_default || "").trim();
    return model ? await invoke<[number, number] | null>("model_price", { model }) : null;
  } catch {
    return null;
  }
}
