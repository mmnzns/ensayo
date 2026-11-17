// The story "Read it" call and what each way it can end does. Kept apart from the screen so the rules can be tested:
// a stopped read leaves the form as it was, and a read that finishes after the person left the screen goes nowhere.
import { invoke } from "@tauri-apps/api/core";
import { isStopped } from "../../ui/aiStop";
import type { ParsedDraft } from "./selection";

export type ReadEnd = "reviewed" | "stopped" | "failed" | "gone";

export interface ReadDeps {
  /** True while the screen that started the read is still the one on show. */
  alive: () => boolean;
  parse?: (raw: string, employerHint: string) => Promise<ParsedDraft>;
  setDraft: (d: ParsedDraft) => void;
  setFailure: (e: string) => void;
  goTo: (screen: string) => void;
}

const parseStory = (raw: string, employerHint: string) => invoke<ParsedDraft>("parse_story", { raw, employerHint });

/** Reads the story. Stopped: back to the form with nothing changed and no banner. Failed: the error page. Done: the review screen (with the person's own title, if they gave one), unless the person already left. */
export async function readStory(raw: string, employerHint: string, deps: ReadDeps, titleHint = ""): Promise<ReadEnd> {
  let draft: ParsedDraft;
  try {
    draft = await (deps.parse ?? parseStory)(raw, employerHint);
  } catch (e) {
    if (isStopped(e)) return "stopped";
    if (!deps.alive()) return "gone";
    deps.setFailure(String(e));
    deps.goTo("stories-parse-error");
    return "failed";
  }
  if (!deps.alive()) return "gone";
  // A title the person typed is kept as it is; only a blank one is left for the read to suggest.
  const given = titleHint.trim();
  deps.setDraft(given ? { ...draft, story: { ...draft.story, title: given } } : draft);
  deps.goTo("5-3-add-a-story-review");
  return "reviewed";
}
