import { invoke } from "@tauri-apps/api/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { allVerified, deleteStory as deleteStoryIn, mergeMethods, saveMethod as saveMethodIn, saveStory as saveStoryIn, setProofVerified as setProofIn, type DataState } from "./actions";
import { mockStore } from "./mock";
import { StoreProvider, type Store } from "./store";
import type { Method, Profile, Story } from "./types";

/** True inside the desktop app. In a plain browser (`npm run dev`) the data is the mock, held in memory. */
export const isApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface DataStatus {
  folder: string;
  state: "ready" | "missing" | "other_machine" | "stale_lock";
  machine: string | null;
  age_secs: number | null;
}

interface LoadAll {
  profile: Profile | null;
  stories: Story[];
  methods: { situation: string; spoken: string; storyIds: string[] }[];
  problems: string[];
}

/** What the screens can change. Each one saves first (in the app) and then updates what is on screen. */
export interface Actions {
  saveStory(story: Story): Promise<Story>;
  deleteStory(id: string): Promise<void>;
  setProofVerified(storyId: string, label: string, verified: boolean): Promise<void>;
  saveMethod(method: Method): Promise<void>;
  saveProfile(profile: Profile): Promise<void>;
}

const unavailable = () => Promise.reject(new Error("The data store is not ready"));
const NO_ACTIONS: Actions = { saveStory: unavailable, deleteStory: unavailable, setProofVerified: unavailable, saveMethod: unavailable, saveProfile: unavailable };

const ActionsContext = createContext<Actions>(NO_ACTIONS);
export const useActions = (): Actions => useContext(ActionsContext);

const DataInfoContext = createContext<{ problems: string[] }>({ problems: [] });
/** Plain-words lines for data files that could not be read (a damaged file, one from a newer Ensayo). */
export const useDataProblems = (): string[] => useContext(DataInfoContext).problems;

type Phase = "loading" | "ready" | "blocked" | "error";

const HEARTBEAT_MS = 60_000;

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="e-focus" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="e-card" style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Blocked({ status, onRetry, onOpenAnyway }: { status: DataStatus | null; onRetry: () => void; onOpenAnyway: () => void }) {
  if (status?.state === "other_machine") {
    const minutes = Math.max(1, Math.round((status.age_secs ?? 0) / 60));
    return (
      <Centered>
        <h1 className="e-h2">Another computer has Ensayo open</h1>
        <p className="e-meta" style={{ margin: 0 }}>
          {status.machine} was using this data folder {minutes === 1 ? "a minute" : `${minutes} minutes`} ago. Running both at once is how copies of your stories get out of step. Close Ensayo there first, or open it here anyway.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="e-btn e-btn-primary" onClick={onRetry}>Try again</button>
          <button type="button" className="e-btn e-btn-line" onClick={onOpenAnyway}>Open anyway</button>
        </div>
      </Centered>
    );
  }
  return (
    <Centered>
      <h1 className="e-h2">Your data folder isn't available</h1>
      <p className="e-meta" style={{ margin: 0 }}>
        Ensayo looked for it at {status?.folder ?? "its usual place"} and didn't find it. If it is on a drive, wait for the drive to finish loading. Ensayo won't start an empty one in its place.
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="e-btn e-btn-primary" onClick={onRetry}>Try again</button>
      </div>
    </Centered>
  );
}

/** Owns the user's data. In the app it loads from the data folder through the backend; in the browser it starts from the mock. */
export function DataProvider({ children }: { children: ReactNode }) {
  const app = isApp();
  const [state, setState] = useState<DataState>(() =>
    app ? { profile: mockStore.profile, stories: [], methods: mergeMethods([], mockStore.methods) } : { profile: mockStore.profile, stories: mockStore.stories, methods: mockStore.methods },
  );
  const [phase, setPhase] = useState<Phase>(app ? "loading" : "ready");
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);

  const readAll = useCallback(async () => {
    const all = await invoke<LoadAll>("load_all");
    setState({ profile: all.profile ?? mockStore.profile, stories: all.stories, methods: mergeMethods(all.methods, mockStore.methods) });
    setProblems(all.problems);
    setPhase("ready");
  }, []);

  const load = useCallback(async () => {
    if (!app) return;
    setPhase("loading");
    try {
      const st = await invoke<DataStatus>("data_status");
      setStatus(st);
      if (st.state === "missing" || st.state === "other_machine") {
        setPhase("blocked");
        return;
      }
      await invoke("acquire_data_lock");
      await readAll();
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }, [app, readAll]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the "this computer has it open" lock fresh while the app is open.
  useEffect(() => {
    if (!app || phase !== "ready") return;
    const t = window.setInterval(() => void invoke("data_heartbeat").catch(() => {}), HEARTBEAT_MS);
    return () => window.clearInterval(t);
  }, [app, phase]);

  const openAnyway = useCallback(async () => {
    try {
      await invoke("acquire_data_lock");
      await readAll();
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }, [readAll]);

  const actions = useMemo<Actions>(
    () => ({
      async saveStory(story) {
        const saved = app ? await invoke<Story>("save_story", { story }) : { ...story, verified: allVerified(story) };
        setState((s) => saveStoryIn(s, saved));
        return saved;
      },
      async deleteStory(id) {
        if (app) await invoke("delete_story", { id });
        setState((s) => deleteStoryIn(s, id));
      },
      async setProofVerified(storyId, label, verified) {
        if (app) {
          const saved = await invoke<Story>("set_proof_verified", { storyId, label, verified });
          setState((s) => saveStoryIn(s, saved));
        } else {
          setState((s) => setProofIn(s, storyId, label, verified));
        }
      },
      async saveMethod(method) {
        if (app) await invoke("save_method", { method: { situation: method.situation, spoken: method.spoken, storyIds: method.storyIds } });
        setState((s) => saveMethodIn(s, method));
      },
      async saveProfile(profile) {
        if (app) await invoke("save_profile", { profile });
        setState((s) => ({ ...s, profile }));
      },
    }),
    [app],
  );

  const store = useMemo<Store>(() => ({ ...mockStore, profile: state.profile ?? mockStore.profile, stories: state.stories, methods: state.methods }), [state]);
  const info = useMemo(() => ({ problems }), [problems]);

  if (phase === "loading") return <Centered><p className="e-meta" style={{ margin: 0 }}>Opening your data…</p></Centered>;
  if (phase === "blocked") return <Blocked status={status} onRetry={() => void load()} onOpenAnyway={() => void openAnyway()} />;
  if (phase === "error") {
    return (
      <Centered>
        <h1 className="e-h2">Ensayo couldn't open your data</h1>
        <p className="e-meta" style={{ margin: 0 }}>{error}</p>
        <div><button type="button" className="e-btn e-btn-primary" onClick={() => void load()}>Try again</button></div>
      </Centered>
    );
  }
  return (
    <ActionsContext.Provider value={actions}>
      <DataInfoContext.Provider value={info}>
        <StoreProvider store={store}>{children}</StoreProvider>
      </DataInfoContext.Provider>
    </ActionsContext.Provider>
  );
}
