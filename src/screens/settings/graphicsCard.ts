// Settings, Speech: the "Use the graphics card" switch. The backend says whether the card is on, its name when there is a
// separate one, and what the default is; these decide what the screen says.
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { explainTestError } from "./aiSettings";

/** What `graphics_card` returns. */
export interface GraphicsCard {
  on: boolean;
  /** The separate graphics card's name, when the computer has one. */
  card: string | null;
  /** Whether the switch is on when the person hasn't chosen. */
  default_on: boolean;
}

export const GRAPHICS_TITLE = "Use the graphics card";

/** The line under the switch: names the card when there is one, and says what it speeds up. */
export function graphicsHint(g: GraphicsCard): string {
  if (g.card) return `Ensayo found ${g.card}. Using it makes speech to text and the built-in local AI faster.`;
  if (g.default_on) return "Uses this computer's graphics chip to make speech to text and the built-in local AI faster.";
  return "Ensayo didn't find a separate graphics card, so it uses the processor.";
}

/** Reads the setting and changes it. A change takes effect on the next answer (the backend lets go of what is loaded). */
export function useGraphicsCard() {
  const [card, setCard] = useState<GraphicsCard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    invoke<GraphicsCard>("graphics_card").then(setCard, () => {});
  }, []);
  const set = (on: boolean) => {
    const before = card;
    setError("");
    setCard((c) => (c ? { ...c, on } : c));
    invoke("set_graphics_card", { on }).catch((e) => {
      setCard(before);
      setError(explainTestError(e));
    });
  };
  return { card, error, set };
}
