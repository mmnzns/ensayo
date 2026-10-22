// The feedback engine choices, shared by Settings > AI and the setup step "Who gives the feedback?": the state behind
// them (kind, provider, model, key, Test, the built-in local AI) and the part of the form under the three cards.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AiKind } from "../../data/screens/settings";
import {
  BUILT_IN,
  LOCAL_ENGINES,
  OTHER_MODEL,
  announceAiChange,
  cloudProviders,
  explainTestError,
  initialState,
  isLocalAddress,
  localEngineOf,
  localModelLine,
  localModelOf,
  localProgressLine,
  modelChoices,
  shownModel,
  testedLine,
  withKind,
  withLocalModel,
  withLocalEngine,
  withModelChoice,
  withProvider,
  withTypedModel,
  type AiScreenState,
  type AiView,
  type LocalAiView,
  type ProviderInfo,
} from "./aiSettings";
import { formatSize } from "./format";
import { CheckIcon } from "./parts";

export type TestState = { sig: string; status: "testing" | "ok" | "bad" | "empty"; line: string };

/** Reads the saved AI settings and the providers. `failed` is true when the backend could not be asked. */
export function useAiView() {
  const [view, setView] = useState<AiView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    invoke<AiView>("ai_settings").then(setView, () => setFailed(true));
  }, []);
  return { view, failed };
}

const fallbackProvider = (id: string): ProviderInfo => ({ id, name: id, models: [], fast_default: "", strong_default: "", has_key: false, needs_key: id !== "compatible", base_default: "" });

/** What the built-in local AI row knows: the models and where each stands, and one download at a time with its progress. */
export function useLocalAi(active: boolean) {
  const [status, setStatus] = useState<LocalAiView | null>(null);
  const [busy, setBusy] = useState<{ id: string; fraction: number } | null>(null);
  const [error, setError] = useState("");
  const cancelled = useRef(false);

  const refresh = () => invoke<LocalAiView>("local_ai_status").then(setStatus, (e) => setError(explainTestError(e)));
  useEffect(() => {
    if (active) void refresh();
  }, [active]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let gone = false;
    listen<{ id: string; fraction: number }>("local-ai-progress", (e) => setBusy((b) => (b ? { id: e.payload.id, fraction: e.payload.fraction } : b))).then(
      (off) => (gone ? off() : (stop = off)),
      () => {},
    );
    return () => {
      gone = true;
      stop?.();
    };
  }, []);

  const download = (id: string) => {
    cancelled.current = false;
    setError("");
    setBusy({ id, fraction: 0 });
    invoke("download_local_ai", { id }).then(
      () => {
        setBusy(null);
        void refresh();
        announceAiChange();
      },
      (e) => {
        setBusy(null);
        setError(cancelled.current ? "Download stopped. Press Download to pick up where it left off." : explainTestError(e));
        void refresh();
      },
    );
  };
  const cancel = () => {
    cancelled.current = true;
    invoke("cancel_local_ai_download").catch((e) => setError(explainTestError(e)));
  };
  return { status, busy, error, download, cancel };
}

type LocalAi = ReturnType<typeof useLocalAi>;

const percent = (fraction: number) => Math.round(Math.min(1, Math.max(0, fraction || 0)) * 100);

/** The built-in local AI: which model, where it stands, and the download. Nothing here needs a key. */
export function BuiltInPanel({ ai, st, change }: { ai: LocalAi; st: AiScreenState; change: (next: AiScreenState) => void }) {
  const { status, busy, error } = ai;
  const [sizeOpen, setSizeOpen] = useState(false);
  const m = localModelOf(status, st.settings);

  if (status && !status.helper_found) {
    return (
      <span className="e-meta" role="status" style={{ color: "var(--e-ink)" }}>
        The built-in local AI can't run on this installation, because a part of it is missing. Reinstalling Ensayo brings it back. Until then, pick another engine or use timing only.
      </span>
    );
  }
  if (!status || !m) {
    return (
      <span className="e-meta" role="status" style={{ color: error ? "var(--e-ink)" : undefined }}>
        {error || "Looking at what is on this computer…"}
      </span>
    );
  }
  const downloading = busy?.id === m.id;
  const showSizes = status.models.length > 1 && (sizeOpen || !m.recommended);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div className="e-soft" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span className="e-h3" style={{ fontSize: "15px" }}>{m.name}</span>
            <span className="e-small">{formatSize(m.size_mb)} · {m.licence} licence · made by {m.maker}</span>
          </span>
          {m.state !== "missing" ? (
            <span className="e-badge e-badge-ok">{localModelLine(m)}</span>
          ) : (
            !downloading && <button type="button" className="e-btn e-btn-line e-btn-sm" onClick={() => ai.download(m.id)}>Download</button>
          )}
        </div>
        <span className="e-small">{m.note}</span>
        {downloading && busy && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div className="e-bar" role="progressbar" aria-label="Download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(busy.fraction)}>
              <span style={{ width: `${percent(busy.fraction)}%` }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <span className="e-meta" role="status">{localProgressLine(busy.fraction)}</span>
              <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={ai.cancel}>Cancel</button>
            </div>
          </div>
        )}
        {m.state === "missing" && !downloading && <span className="e-meta">{localModelLine(m)}. Until then you'll get timing notes only.</span>}
      </div>
      {status.models.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {showSizes ? (
            <>
              <label htmlFor="ls" className="e-small">Size</label>
              <select id="ls" className="e-input" style={{ width: "320px" }} disabled={!!busy} value={m.id} onChange={(e) => change({ ...st, settings: withLocalModel(status, st.settings, e.target.value) })}>
                {status.models.map((x) => (
                  <option key={x.id} value={x.id}>{`${x.name} · ${formatSize(x.size_mb)}${x.recommended ? " (recommended)" : ""}`}</option>
                ))}
              </select>
            </>
          ) : (
            <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={() => setSizeOpen(true)}>Other size</button>
          )}
        </div>
      )}
      <span className="e-meta">
        No key needed, and nothing you say leaves this computer. A small model like this is good for judging your answers and reading your stories. It is weaker at follow-up questions, so if the follow-up drill matters to you, use a cloud key instead.
      </span>
      {error && (
        <span className="e-meta" role="status" style={{ color: "var(--e-ink)" }}>{error}</span>
      )}
    </div>
  );
}

/** Everything the engine form needs: the screen state, saving a moment after the last change, the key, Test, and the local AI. */
export function useAiEngine(view: AiView) {
  const { providers } = view;
  const [st, setSt] = useState<AiScreenState>(() => initialState(view));
  const [hasKey, setHasKey] = useState<Record<string, boolean>>(() => Object.fromEntries(providers.map((p) => [p.id, p.has_key])));
  const [typedKey, setTypedKey] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);
  const [test, setTest] = useState<TestState | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [problem, setProblem] = useState("");
  const local = useLocalAi(st.kind === "local");

  // Settings save a moment after the last change, and straight away if the screen is left first. The key is never kept here: it goes to the key store and the box empties.
  const latest = useRef(st.settings);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = useRef((): Promise<void> => Promise.resolve());
  flush.current = () => {
    clearTimeout(timer.current);
    if (!dirty.current) return Promise.resolve();
    dirty.current = false;
    return invoke("save_ai_settings", { ai: latest.current }).then(
      () => {
        setProblem("");
        announceAiChange();
      },
      (e) => setProblem(explainTestError(e)),
    );
  };
  useEffect(() => () => void flush.current(), []);

  const typedRef = useRef("");
  const hasKeyRef = useRef(hasKey);
  const keySave = useRef<Promise<string | null>>(Promise.resolve(null));
  const markKey = (id: string, has: boolean) => {
    hasKeyRef.current = { ...hasKeyRef.current, [id]: has };
    setHasKey(hasKeyRef.current);
  };
  const typeKey = (value: string) => {
    typedRef.current = value;
    setTypedKey(value);
  };

  const { kind, settings } = st;
  const cloud = cloudProviders(providers);
  const provider = providers.find((p) => p.id === (kind === "local" ? "compatible" : st.cloudId)) ?? fallbackProvider(kind === "local" ? "compatible" : st.cloudId);
  const sig = `${settings.provider}|${settings.base_url}`;
  const result = test && test.sig === sig ? test : null;

  const change = (next: AiScreenState) => {
    setSt(next);
    latest.current = next.settings;
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush.current(), 350);
  };
  const moved = (next: AiScreenState) => {
    setOtherOpen(false);
    setFound([]);
    setTest(null);
    change(next);
  };

  /** Saves what is typed in the key box to the system key store (the key never goes into the settings file). Resolves to a plain-words problem, or null. */
  const storeKey = (): Promise<string | null> => {
    const key = typedRef.current.trim();
    if (!key) return keySave.current;
    const id = st.cloudId;
    typeKey("");
    keySave.current = invoke("save_api_key", { provider: id, key }).then(
      () => {
        markKey(id, true);
        announceAiChange();
        return null;
      },
      (e) => {
        typeKey(key);
        return explainTestError(e);
      },
    );
    return keySave.current;
  };
  const removeKey = () => {
    const id = st.cloudId;
    invoke("clear_api_key", { provider: id }).then(
      () => {
        markKey(id, false);
        setTest(null);
        announceAiChange();
      },
      (e) => setProblem(explainTestError(e)),
    );
  };

  const runTest = async () => {
    if (kind === "key") {
      const trouble = await storeKey();
      if (trouble) return setTest({ sig, status: "bad", line: trouble });
      if (!hasKeyRef.current[st.cloudId]) return setTest({ sig, status: "empty", line: "" });
    }
    setTest({ sig, status: "testing", line: "" });
    try {
      // With no key given, the saved one is tested.
      const r = await invoke<{ models: string[]; recommended: string | null }>("test_ai", { provider: settings.provider, baseUrl: kind === "local" ? settings.base_url : undefined });
      setFound(r.models);
      setTest({ sig, status: "ok", line: testedLine(r.models.length) });
    } catch (e) {
      setTest({ sig, status: "bad", line: explainTestError(e) });
    }
  };

  /** Saves everything now (a typed key, then the settings) and says what went wrong in plain words, or null. */
  const saveNow = async (): Promise<string | null> => {
    const trouble = await storeKey();
    await flush.current();
    return trouble;
  };

  const clearTest = () => setTest(null);
  const providerChange = (id: string) => withProvider(st, id, providers);
  /** The three engine cards. "On this computer" means the built-in local AI; Ollama and LM Studio stay in Settings. */
  const chooseKind = (next: AiKind) => moved(next === "local" ? withLocalEngine(withKind(st, "local", providers), "Built-in local AI") : withKind(st, next, providers));

  return { st, providers, kind, settings, cloud, provider, hasKey, typedKey, typeKey, otherOpen, setOtherOpen, test, result, found, problem, local, change, moved, storeKey, removeKey, runTest, saveNow, clearTest, providerChange, chooseKind };
}

export type AiEngine = ReturnType<typeof useAiEngine>;

/** The part of the engine form under the three cards: provider and model, the key and Test, or the built-in local AI. `guided` is the setup step, where "on this computer" means the built-in model. */
export function EngineDetails({ ai, guided = false }: { ai: AiEngine; guided?: boolean }) {
  const { st, kind, settings, cloud, provider, hasKey, typedKey, otherOpen, setOtherOpen, result, found, problem, local, change, moved } = ai;
  const shown = shownModel(provider, settings);
  const choice = otherOpen ? OTHER_MODEL : shown.choice;
  const showTyped = choice === OTHER_MODEL;
  const engine = localEngineOf(settings);
  const builtIn = settings.provider === BUILT_IN;
  const keyed = !!typedKey || hasKey[st.cloudId];

  const testLine =
    result && (
      <span className="e-meta" role="status" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: result.status === "ok" ? "var(--e-primary-dark)" : result.status === "testing" ? undefined : "var(--e-ink)" }}>
        {result.status === "ok" && <CheckIcon />}
        {result.status === "testing" ? "Testing…" : result.status === "empty" ? "Paste a key first." : result.line}
        {result.status === "ok" && kind === "key" && " Your key is kept in your system's secure key storage."}
      </span>
    );

  return (
    <>
      {kind === "timing" ? (
        <span className="e-meta">Ensayo will tell you how fast you got to the point, how long you ran and how many filler words you used. Notes on what you said need an AI engine; you can add one any time.</span>
      ) : guided && builtIn ? (
        <BuiltInPanel ai={local} st={st} change={change} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
            <div className="e-field">
              <label htmlFor="pv">{kind === "local" ? "Engine" : "Provider"}</label>
              {kind === "local" ? (
                <select id="pv" className="e-input" value={engine.name} onChange={(e) => moved(withLocalEngine(st, e.target.value))}>
                  {LOCAL_ENGINES.map((e) => {
                    const broken = e.provider === BUILT_IN && local.status?.helper_found === false;
                    return (
                      <option key={e.name} value={e.name} disabled={!e.available || broken}>
                        {broken ? `${e.name} · Can't run on this installation` : e.name}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <select id="pv" className="e-input" value={st.cloudId} onChange={(e) => moved(ai.providerChange(e.target.value))}>
                  {cloud.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
            {!builtIn && (
              <div className="e-field">
                <label htmlFor="md">Model</label>
                <select
                  id="md"
                  className="e-input"
                  value={choice}
                  onChange={(e) => {
                    setOtherOpen(e.target.value === OTHER_MODEL);
                    change({ ...st, settings: withModelChoice(provider, settings, e.target.value) });
                  }}
                >
                  {modelChoices(provider).map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {builtIn ? (
            <BuiltInPanel ai={local} st={st} change={change} />
          ) : (
            <>
              {(showTyped || kind === "local") && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
                  {kind === "local" && (
                    <div className="e-field">
                      <label htmlFor="ad">Server address</label>
                      <input id="ad" className="e-input" placeholder="http://localhost:11434" value={settings.base_url} onChange={(e) => change({ ...st, settings: { ...settings, base_url: e.target.value.trim() } })} />
                    </div>
                  )}
                  {showTyped && (
                    <div className="e-field">
                      <label htmlFor="om">Model name</label>
                      <input
                        id="om"
                        className="e-input"
                        list="found-models"
                        placeholder={kind === "local" ? "The name of a model you have installed" : "Exactly as the provider spells it"}
                        value={shown.typed}
                        onChange={(e) => change({ ...st, settings: withTypedModel(settings, e.target.value) })}
                      />
                      <datalist id="found-models">
                        {found.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                  )}
                </div>
              )}
              {kind === "key" ? (
                <div className="e-field">
                  <label htmlFor="ky">API key</label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <input
                      id="ky"
                      className="e-input"
                      type="password"
                      autoComplete="off"
                      placeholder={hasKey[st.cloudId] ? "Saved. Paste a new key to replace it." : "Paste key"}
                      value={typedKey}
                      onChange={(e) => {
                        ai.typeKey(e.target.value);
                        ai.clearTest();
                      }}
                      onBlur={() => void ai.storeKey()}
                      style={{ flex: "1" }}
                    />
                    <button type="button" className="e-btn e-btn-soft e-btn-sm" style={{ minHeight: "48px" }} disabled={result?.status === "testing"} onClick={() => void ai.runTest()}>Test</button>
                  </div>
                  {testLine}
                  {!result && hasKey[st.cloudId] && !typedKey && (
                    <span className="e-meta" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      A key is saved in your system's secure key storage.
                      <button type="button" className="e-btn e-btn-ghost e-btn-sm" onClick={ai.removeKey}>Remove it</button>
                    </span>
                  )}
                  {!keyed && !result && <span className="e-meta">Ensayo needs a key from {provider.name} to give notes on your answers.</span>}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span className="e-meta">
                    {isLocalAddress(settings.base_url)
                      ? `No key needed. Ensayo looks for ${engine.name} on this computer, and nothing you say leaves it.`
                      : "No key needed. That address is not on this computer, so what you say is sent there. Check that you trust it."}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <button type="button" className="e-btn e-btn-soft e-btn-sm" disabled={result?.status === "testing"} onClick={() => void ai.runTest()}>Test</button>
                    {testLine}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
      {problem && (
        <span className="e-meta" role="status" style={{ color: "var(--e-ink)" }}>
          Ensayo couldn't save that change. {problem}
        </span>
      )}
    </>
  );
}
