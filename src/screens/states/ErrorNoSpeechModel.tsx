import { useEffect, useState } from "react";
import { useStore } from "../../data/store";
import Link from "../../ui/Link";
import StatePage from "./StatePage";

/** No speech model on this computer yet: Download, with a short fake progress. */
export default function ErrorNoSpeechModel() {
  const { name, sizeMb } = useStore().screens.states.speechModel;
  const [running, setRunning] = useState(false);
  const [percent, setPercent] = useState(0);
  const done = percent >= 100;

  useEffect(() => {
    if (!running || done) return;
    const id = window.setInterval(() => setPercent((p) => Math.min(100, p + 8)), 250);
    return () => window.clearInterval(id);
  }, [running, done]);

  const downloaded = Math.round((sizeMb * Math.min(percent, 100)) / 100);

  return (
    <StatePage
      icon="download"
      title="Ensayo needs a speech model first"
      actions={
        done ? (
          <Link to="2-1-home" className="e-btn e-btn-primary e-btn-big">Start practicing</Link>
        ) : (
          <>
            <button type="button" className="e-btn e-btn-primary e-btn-big" disabled={running} style={running ? { opacity: 0.6, cursor: "default" } : undefined} onClick={() => setRunning(true)}>
              {running ? "Downloading" : `Download ${name} (${sizeMb} MB)`}
            </button>
            <Link to="8-4-settings-speech" className="e-btn e-btn-ghost">Choose a different one</Link>
          </>
        )
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        Ensayo turns your voice into text on this computer, and there's no speech model here yet. It downloads once, and your recordings never leave.
      </p>
      <p className="e-meta" style={{ margin: 0 }}>
        You can pick another model, or use one already on this computer, in Settings under Speech.
      </p>
      {running ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="e-bar" role="progressbar" aria-label={`Downloading ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(percent, 100)}>
            <span style={{ width: `${Math.min(percent, 100)}%` }} />
          </div>
          <span role="status" className="e-small">
            {done ? `${name} is ready.` : `${downloaded} of ${sizeMb} MB`}
          </span>
        </div>
      ) : null}
    </StatePage>
  );
}
