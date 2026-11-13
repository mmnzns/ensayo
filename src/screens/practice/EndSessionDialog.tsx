import Dialog from "../states/Dialog";
import { END_CONFIRM, END_KEEP, END_TITLE, endBody, type AtStake } from "./endSession";

/** Asks before a session is ended with an answer in flight. Esc or "Keep going" goes back to the answer. */
export default function EndSessionDialog({ stake, onEnd, onKeep }: { stake: Exclude<AtStake, null>; onEnd: () => void; onKeep: () => void }) {
  return (
    <Dialog
      title={END_TITLE}
      onClose={onKeep}
      width={440}
      actions={
        <>
          <button type="button" data-autofocus className="e-btn e-btn-line" onClick={onKeep}>{END_KEEP}</button>
          <button type="button" className="e-btn e-btn-primary" onClick={onEnd}>{END_CONFIRM}</button>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>{endBody(stake)}</p>
    </Dialog>
  );
}
