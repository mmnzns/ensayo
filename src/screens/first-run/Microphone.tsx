// Draft generated from Design/screens/html/1-4-microphone.html by scripts/html-to-tsx.mjs. Data wiring and interactions are added by hand.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import FocusShell from "../../ui/FocusShell";
import Link from "../../ui/Link";
import { isApp } from "../../data/real";
import { useStore } from "../../data/store";
import StepHeader from "./StepHeader";
import { levelVerdict, micFix, micView, osOf, pushLevel } from "./setup";

/** How long the mock level test runs, like the real three-second check. */
const TEST_MS = 3000;

/** In the app the step asks the computer for real; in the browser preview it stays the sample below. */
export default function Microphone() {
  return isApp() ? <MicrophoneLive /> : <MicrophoneMock />;
}

const BARS = 14;
const LIVE_MS = 3000;
const POLL_MS = 100;

/** Reads the loudness for three seconds from the real recorder, then throws the recording away. */
function useLevelTest(device: string) {
  const [listening, setListening] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const [verdict, setVerdict] = useState<{ ok: boolean; line: string } | null>(null);
  const [trouble, setTrouble] = useState("");
  const recording = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const finish = async (peak: number | null) => {
    window.clearInterval(timer.current);
    if (recording.current) {
      recording.current = false;
      try {
        const rec = await invoke<{ path: string }>("stop_recording");
        // This was only a level check: the sound is not kept.
        await invoke("discard_recording", { path: rec.path }).catch(() => {});
      } catch {
        // Nothing was recording any more.
      }
    }
    setListening(false);
    if (peak !== null) setVerdict(levelVerdict(peak));
  };

  const start = async () => {
    if (listening) return;
    setTrouble("");
    setVerdict(null);
    setLevels([]);
    try {
      await invoke("start_recording", { device: device || null });
    } catch (e) {
      setTrouble(typeof e === "string" && e.trim() ? e : "Ensayo couldn't start listening. Check the microphone and try again.");
      return;
    }
    recording.current = true;
    setListening(true);
    let peak = 0;
    const began = Date.now();
    timer.current = window.setInterval(() => {
      void invoke<{ level: number } | null>("recording_level").then((l) => {
        const level = l?.level ?? 0;
        peak = Math.max(peak, level);
        setLevels((h) => pushLevel(h, level, BARS));
      }, () => {});
      if (Date.now() - began >= LIVE_MS) void finish(peak);
    }, POLL_MS);
  };

  // Leaving the screen while listening stops the recorder, so practice can have it.
  useEffect(() => () => void finish(null), []);

  return { listening, levels, verdict, trouble, start };
}

function MicrophoneLive() {
  const [permission, setPermission] = useState("checking");
  const [devices, setDevices] = useState<string[]>([]);
  const [device, setDevice] = useState("");
  const [asking, setAsking] = useState(false);
  const test = useLevelTest(device);
  const os = osOf(typeof navigator === "undefined" ? "" : navigator.userAgent);

  const check = () => invoke<string>("mic_permission").then(setPermission, () => setPermission("unknown"));
  useEffect(() => {
    void check();
    invoke<string[]>("list_input_devices").then(setDevices, () => {});
    // Coming back from the system's settings, read the answer again.
    const again = () => void check();
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, []);

  const allow = async () => {
    setAsking(true);
    try {
      await invoke("request_mic_permission");
    } catch {
      // The check below says where it stands.
    }
    await check();
    setAsking(false);
  };

  const view = permission === "checking" ? null : micView(permission);
  const heard = test.verdict?.ok === true;
  const canContinue = (view?.canContinue ?? false) || heard;
  const bars = Array.from({ length: BARS }, (_, i) => test.levels[i - (BARS - test.levels.length)] ?? 0);

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%", gap: "32px" }}>
        <StepHeader step={4} />
        <div className="e-narrow" style={{ gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 4 of 7</span>
            <h1 className="e-h1">Let's hear you</h1>
            <p className="e-meta" style={{ margin: "0" }}>Ensayo needs your microphone to hear your answers. Your voice is processed on this computer.</p>
          </div>
          <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div className="e-rowline" style={{ paddingTop: "0", borderBottom: "none" }}>
                <span className="e-dot" aria-hidden="true" />{" "}<span style={{ flex: "1", fontSize: "15px" }}>Microphone access</span>{" "}
                {view ? <span className={view.state === "allowed" ? "e-badge e-badge-ok" : "e-badge"}>{view.badge}</span> : <span className="e-meta" role="status">Checking…</span>}
              </div>
              {view ? <span className="e-meta" role="status">{view.line}</span> : null}
              {view?.state === "ask" ? (
                <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => void allow()} disabled={asking}>
                  {asking ? "Waiting for your answer" : "Allow the microphone"}
                </button>
              ) : null}
            </div>
            {view?.state === "blocked" ? (
              <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <span className="e-h3">How to turn it on</span>
                <ol className="e-meta" style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {micFix(os).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button type="button" className="e-btn e-btn-soft e-btn-sm" onClick={() => void invoke("open_mic_settings").catch(() => {})}>Open settings</button>
                  <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => void check()}>Check again</button>
                </div>
              </div>
            ) : null}
            {devices.length > 1 ? (
              <div className="e-field">
                <label htmlFor="mic">Microphone</label>
                <select id="mic" className="e-input" value={device} onChange={(e) => setDevice(e.target.value)}>
                  <option value="">This computer's default</option>
                  {devices.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600" }}>Say a few words</span>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "64px", padding: "0 4px" }} aria-label={test.listening ? "Input level, listening" : "Input level"}>
                {bars.map((level, i) => (
                  <span
                    key={i}
                    style={{
                      flex: "1",
                      height: `${Math.max(8, Math.round(level * 100))}%`,
                      borderRadius: "4px",
                      background: level > 0.05 ? "var(--e-primary)" : "var(--e-line)",
                      transition: "height 120ms ease",
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <span className="e-meta" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }} aria-live="polite">
                  {test.listening ? (
                    "Listening"
                  ) : test.trouble ? (
                    test.trouble
                  ) : test.verdict ? (
                    <>
                      {test.verdict.ok ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--e-primary)" }} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : null}
                      {" "}{test.verdict.line}
                    </>
                  ) : (
                    "Press the button and say a few words."
                  )}
                </span>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => void test.start()} disabled={test.listening || view?.state === "blocked"}>
                  {test.listening ? "Testing" : test.verdict || test.trouble ? "Test again" : "Test the microphone"}
                </button>
              </div>
            </div>
          </div>
          <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-h3">For the best results</span>
            <span className="e-meta">A quiet room and a headset or earbuds. Ensayo listens for one voice, yours. The test is not kept.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <Link to="1-3-what-to-work-on" className="e-btn e-btn-ghost">← Back</Link>
            {canContinue ? (
              <Link to="1-5-speech" className="e-btn e-btn-primary">Continue</Link>
            ) : (
              <button type="button" className="e-btn e-btn-primary" disabled>Continue</button>
            )}
          </div>
        </div>
      </div>
    </FocusShell>
  );
}

function MicrophoneMock() {
  const { screens } = useStore();
  const { microphones, levelBars } = screens.firstRun;
  const [device, setDevice] = useState(microphones[0] ?? "");
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState<number[]>([]);

  // While listening, the bars move on a timer; then they settle on the sample reading.
  useEffect(() => {
    if (!listening) return;
    const tick = window.setInterval(() => setLive(levelBars.heights.map(() => 8 + Math.round(Math.random() * 84))), 140);
    const stop = window.setTimeout(() => setListening(false), TEST_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(stop);
    };
  }, [listening, levelBars.heights]);

  const startTest = () => {
    setLive(levelBars.heights);
    setListening(true);
  };

  return (
    <FocusShell>
      <div className="e-wrap" style={{ width: "100%", gap: "32px" }}>
        <StepHeader step={4} />
        <div className="e-narrow" style={{ gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="e-label">Step 4 of 7</span>
            <h1 className="e-h1">Let's hear you</h1>
            <p className="e-meta" style={{ margin: "0" }}>Ensayo needs your microphone to hear your answers. Your voice is processed on this computer.</p>
          </div>
          <div className="e-card" style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            <div className="e-rowline" style={{ paddingTop: "0" }}>
              <span className="e-dot" aria-hidden="true" />{" "}<span style={{ flex: "1", fontSize: "15px" }}>Microphone access</span>{" "}<span className="e-badge e-badge-ok">Allowed</span>
            </div>
            <div className="e-field">
              <label htmlFor="mic">Microphone</label>
              <select id="mic" className="e-input" value={device} onChange={(e) => setDevice(e.target.value)}>
                {microphones.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600" }}>Say a few words</span>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "64px", padding: "0 4px" }} aria-label={listening ? "Input level, listening" : "Input level, good"}>
                {levelBars.heights.map((h, i) => (
                  <span
                    key={i}
                    style={{
                      flex: "1",
                      height: `${listening ? (live[i] ?? h) : h}%`,
                      borderRadius: "4px",
                      background: listening || i < levelBars.lit ? "var(--e-primary)" : "var(--e-line)",
                      transition: "height 120ms ease",
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <span className="e-meta" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }} aria-live="polite">
                  {listening ? (
                    "Listening"
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--e-primary)" }} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      {" "}Sounds clear.
                    </>
                  )}
                </span>
                <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={startTest} disabled={listening}>
                  {listening ? "Testing" : "Test again"}
                </button>
              </div>
            </div>
          </div>
          <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="e-h3">For the best results</span>
            <span className="e-meta">A quiet room and a headset or earbuds. Ensayo listens for one voice, yours.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <Link to="1-3-what-to-work-on" className="e-btn e-btn-ghost">← Back</Link>
            <Link to="1-5-speech" className="e-btn e-btn-primary">Continue</Link>
          </div>
        </div>
      </div>
    </FocusShell>
  );
}
