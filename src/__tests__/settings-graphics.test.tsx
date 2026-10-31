import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { GRAPHICS_TITLE, graphicsHint, type GraphicsCard } from "../screens/settings/graphicsCard";
import { ToggleRow } from "../screens/settings/parts";
import { CardNotes, clearCardNotes, dismissCardNote, fellBackNote, noteCardFellBack } from "../ui/cardNote";

afterEach(clearCardNotes);

describe("the Use the graphics card switch", () => {
  const card = (over: Partial<GraphicsCard> = {}): GraphicsCard => ({ on: true, card: null, default_on: true, ...over });

  it("names the card when the computer has one", () => {
    expect(graphicsHint(card({ card: "NVIDIA GeForce RTX 4060" }))).toBe("Ensayo found NVIDIA GeForce RTX 4060. Using it makes speech to text and the built-in local AI faster.");
  });

  it("says what it uses on a computer that has the chip on by default, and that it falls back to the processor without a card", () => {
    expect(graphicsHint(card())).toContain("graphics chip");
    expect(graphicsHint(card({ on: false, default_on: false }))).toBe("Ensayo didn't find a separate graphics card, so it uses the processor.");
  });

  it("renders as a switch with its title and line, on or off", () => {
    const row = (g: GraphicsCard) => renderToString(<ToggleRow title={GRAPHICS_TITLE} hint={graphicsHint(g)} checked={g.on} onChange={() => {}} last />);
    const on = row(card({ card: "AMD Radeon RX 7800 XT" }));
    expect(on).toContain("Use the graphics card");
    expect(on).toContain("AMD Radeon RX 7800 XT");
    expect(on).toContain('checked=""');
    expect(row(card({ on: false, card: "AMD Radeon RX 7800 XT" }))).not.toContain('checked=""');
  });
});

describe("the note that the graphics card didn't work", () => {
  it("says which work it was, that the processor was used, and where to turn the card off", () => {
    expect(fellBackNote("speech to text")).toBe("The graphics card didn't work for speech to text, so Ensayo used the processor. You can turn the card off in Settings.");
    expect(fellBackNote("the built-in local AI")).toContain("for the built-in local AI,");
  });

  it("shows once per kind of work until the person dismisses it", () => {
    expect(renderToString(<CardNotes />)).toBe("");
    noteCardFellBack("speech to text");
    noteCardFellBack("speech to text");
    noteCardFellBack("the built-in local AI");
    const html = renderToString(<CardNotes />);
    expect(html.match(/Got it/g)).toHaveLength(2);
    expect(html).toContain("for speech to text");
    expect(html).toContain("for the built-in local AI");
    dismissCardNote(fellBackNote("speech to text"));
    const after = renderToString(<CardNotes />);
    expect(after).not.toContain("for speech to text");
    expect(after).toContain("for the built-in local AI");
  });
});
