import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRoute } from "../../ui/router";

/** Read a line aloud with the browser's voice when there is one. Returns false when nothing can speak. */
export function speak(text: string, onEnd?: () => void): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    /* nothing to stop */
  }
}

/** A Listen button: reads `text` aloud, and says Stop while it speaks. Quiet when the device has no voice. */
export function ListenButton({ text, className = "e-btn e-btn-ghost e-btn-sm", style, children }: { text: string; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => stopSpeaking(), []);
  const toggle = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(speak(text, () => setPlaying(false)));
  };
  return (
    <button type="button" className={className} style={style} onClick={toggle} aria-pressed={playing}>
      {children}
      {playing ? "Stop" : "Listen"}
    </button>
  );
}

/** Space runs `onSpace`, only while `screenId` is the active route. */
export function useSpaceKey(screenId: string, onSpace: () => void) {
  const route = useRoute();
  const active = route === screenId;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      onSpace();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onSpace]);
}

/** "0:52" from seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The stage label with ", startup" when the application is an early company. */
export function stageWithKind(stage: string, startup: boolean | undefined): string {
  return startup ? `${stage}, startup` : stage;
}
