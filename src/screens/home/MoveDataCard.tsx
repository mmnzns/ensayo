import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { isApp } from "../../data/real";
import { revealPath } from "../../ui/openExternal";
import { hideMoveCard, moveCardHidden } from "../settings/prefs";

/** What `data_move_offer` answers. */
export interface MoveOffer {
  state: "none" | "offer" | "both";
  legacy: string;
  target: string;
}

export const MOVE_TITLE = "Move your data to Documents › Ensayo";
export const MOVE_BODY = "On Windows, uninstalling Ensayo can delete the folder your data is in now. In Documents it's safe, and easy to find and back up.";
export const MOVE_BOTH_BODY = "Documents › Ensayo already has data in it, so Ensayo won't move or merge anything. Your current data stays where it is. You can look at both folders and decide.";
export const MOVE_DONE = "Your data is now in Documents › Ensayo. The old copy is kept in Ensayo's app folder for now.";
export const MOVE_FAILED = "The move didn't finish, and nothing was changed. Try again in a moment.";

export function MoveDataCardView({ offer, busy, done, error, onMove, onShowBoth, onNotNow }: { offer: MoveOffer; busy?: boolean; done?: boolean; error?: string; onMove?: () => void; onShowBoth?: () => void; onNotNow?: () => void }) {
  if (offer.state === "none") return null;
  return (
    <section className="e-soft" aria-label={MOVE_TITLE} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <span className="e-h3">{MOVE_TITLE}</span>
      <span className="e-meta" role={error ? "alert" : "status"}>{done ? MOVE_DONE : error || (offer.state === "both" ? MOVE_BOTH_BODY : MOVE_BODY)}</span>
      {!done && (
        <span style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {offer.state === "offer" ? (
            <button type="button" className="e-btn e-btn-white e-btn-sm" disabled={busy} onClick={onMove}>{busy ? "Moving…" : "Move it"}</button>
          ) : (
            <button type="button" className="e-btn e-btn-white e-btn-sm" onClick={onShowBoth}>Show both folders</button>
          )}
          <button type="button" className="e-btn e-btn-ghost e-btn-sm" disabled={busy} onClick={onNotNow}>Not now</button>
        </span>
      )}
    </section>
  );
}

function MoveDataCardLive() {
  const [offer, setOffer] = useState<MoveOffer>({ state: "none", legacy: "", target: "" });
  const [hidden, setHidden] = useState(() => moveCardHidden(Date.now()));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!hidden) void invoke<MoveOffer>("data_move_offer").then(setOffer, () => {});
  }, [hidden]);
  if (hidden) return null;
  const move = async () => {
    setBusy(true);
    setError("");
    try {
      await invoke("move_data_to_documents");
      setDone(true);
      window.setTimeout(() => window.location.reload(), 2500);
    } catch (e) {
      setError(typeof e === "string" && e.trim() ? e : MOVE_FAILED);
      setBusy(false);
    }
  };
  const showBoth = () => {
    for (const path of [offer.legacy, offer.target]) void revealPath(path).catch(() => {});
  };
  return <MoveDataCardView offer={offer} busy={busy} done={done} error={error} onMove={() => void move()} onShowBoth={showBoth} onNotNow={() => { hideMoveCard(Date.now()); setHidden(true); }} />;
}

/** In the app, once, for anyone whose data is still in the old default folder. Nothing in the browser preview. */
export default function MoveDataCard() {
  return isApp() ? <MoveDataCardLive /> : null;
}
