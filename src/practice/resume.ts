// "Continue where you left off": Home asks the backend for the newest session under a day old that was not ended
// and still has questions left, and shows it with the words below. The rules (24 hours, ended, questions left) live
// in the backend, next to the saved session; this file only fetches and words it.

import { useEffect, useState } from "react";
import { isApp } from "./api";
import { STAGE_LABELS } from "./habits";
import type { ResumableSession } from "./live";

export const CONTINUE_TITLE = "Continue where you left off";

/** "Hiring manager · Drill · question 3 of 5": which session, and the question it comes back to. */
export function continueLine(r: ResumableSession, companyOf?: (applicationId: string) => string | undefined): string {
  const total = r.resume.plan.length;
  const at = Math.min(r.resume.next_index + 1, total);
  const company = r.application_id ? companyOf?.(r.application_id) : undefined;
  const stage = STAGE_LABELS[r.stage] ?? r.stage;
  return `${company ? `${company} · ` : ""}${stage} · ${r.mode === "mock" ? "Mock" : "Drill"} · question ${at} of ${total}`;
}

/** The session to offer, or null (also outside the app, where nothing is saved). Looks again whenever a rep is saved. */
export function useResumable(): ResumableSession | null {
  const [found, setFound] = useState<ResumableSession | null>(null);
  useEffect(() => {
    if (!isApp()) return;
    let alive = true;
    const read = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const s = await invoke<ResumableSession | null>("resumable_session");
        if (alive) setFound(s ?? null);
      } catch {
        // Offering nothing is better than blocking Home.
        if (alive) setFound(null);
      }
    };
    void read();
    window.addEventListener("ensayo:history", read);
    return () => {
      alive = false;
      window.removeEventListener("ensayo:history", read);
    };
  }, []);
  return found;
}
