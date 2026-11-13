import { useEffect, useState } from "react";
import { useStore } from "../../data/store";
import { isApp } from "../../data/real";
import { useSpeech } from "../first-run/useSpeech";
import Link from "../../ui/Link";
import StatePage from "./StatePage";

/** No speech model on this computer yet. In the app it reads and downloads the real one; the browser preview keeps a sample. */
export default function ErrorNoSpeechModel() {
  return isApp() ? <RealNoSpeechModel /> : <SampleNoSpeechModel />;
}

function RealNoSpeechModel() {
  const { plan, refresh, downloading, fraction, error, download } = useSpeech();
  const ready = plan?.kind === "ready";
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <StatePage
      icon="download"
      title="Ensayo needs a speech model first"
      actions={
        <>
          {ready ? (
            <Link to="2-1-home" className="e-btn e-btn-primary e-btn-big">Start practicing</Link>
          ) : plan?.kind === "download" ? (
            <button type="button" className="e-btn e-btn-primary e-btn-big" disabled={downloading} style={downloading ? { opacity: 0.6, cursor: "default" } : undefined} onClick={() => void download()}>
              {downloading ? `Downloading, ${percent}%` : `Download ${plan.name} (${plan.sizeMb} MB)`}
            </button>
          ) : null}
          <button type="button" className="e-btn e-btn-line" onClick={() => void refresh()}>Try again</button>
          <Link to="8-4-settings-speech" className="e-btn e-btn-ghost">Settings</Link>
          <Link to="2-1-home" className="e-btn e-btn-ghost">Back home</Link>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        Ensayo turns your voice into text on this computer, and there's no speech model here yet. It downloads once, and your recordings never leave.
      </p>
      <p className="e-meta" style={{ margin: 0 }}>
        You can pick another model, or use one already on this computer, in Settings under Speech. If you just added one, press Try again.
      </p>
      {ready ? <span role="status" className="e-small">{plan.name} is ready.</span> : null}
      {error ? <span role="alert" className="e-meta" style={{ color: "var(--e-warn-ink)" }}>{error}</span> : null}
    </StatePage>
  );
}

function SampleNoSpeechModel() {
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
            <Link to="2-1-home" className="e-btn e-btn-ghost">Back home</Link>
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
