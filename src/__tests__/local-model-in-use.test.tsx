import { readSource } from "./helpers/readSource";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoModelLine } from "../screens/first-run/FeedbackEngine";
import { isLocalModelMissing, LOCAL_MODEL_MISSING, LOCAL_MODEL_MISSING_LINE } from "../screens/first-run/setup";
import { StoryProblem } from "../screens/first-run/YourFirstStory";
import { localModelOf, noUsableLocalModel, type LocalAiView, type LocalModel } from "../screens/settings/aiSettings";
import type { AiSettings } from "../screens/settings/aiSettings";

const model = (id: string, state: LocalModel["state"], extra: Partial<LocalModel> = {}): LocalModel =>
  ({ id, name: id, maker: "", note: "", licence: "Apache-2.0", size_mb: 1, recommended: id === "qwen3.5-4b", state, ...extra }) as LocalModel;
const view = (...models: LocalModel[]): LocalAiView => ({ models, selected: "", helper_found: true });
const settings = (fast_model: string) => ({ provider: "local", fast_model }) as AiSettings;

describe("the local model in use", () => {
  const qwen = (s: LocalModel["state"]) => model("qwen3.5-4b", s);
  const granite = (s: LocalModel["state"]) => model("granite-4.2-3b", s);
  const gemma = (s: LocalModel["state"], big = false) => model("gemma-4-e4b", s, { too_small_here: big });

  it("is the recommended model when it is installed", () => {
    expect(localModelOf(view(qwen("ready"), granite("ready")), settings(""))?.id).toBe("qwen3.5-4b");
  });
  it("is an installed model when none is picked and the recommended one is missing", () => {
    expect(localModelOf(view(qwen("missing"), granite("ready"), gemma("on_this_computer")), settings(""))?.id).toBe("granite-4.2-3b");
    expect(localModelOf(view(qwen("missing"), granite("missing"), gemma("ready")), settings("claude-haiku-5-5"))?.id).toBe("gemma-4-e4b");
  });
  it("skips an installed model that is too big for this computer", () => {
    expect(localModelOf(view(qwen("missing"), granite("missing"), gemma("ready", true)), settings(""))?.id).toBe("qwen3.5-4b");
  });
  it("keeps a model the person picked, even when it is missing", () => {
    expect(localModelOf(view(qwen("missing"), granite("ready")), settings("qwen3.5-4b"))?.id).toBe("qwen3.5-4b");
    expect(localModelOf(view(qwen("ready"), granite("missing")), settings("granite-4.2-3b"))?.id).toBe("granite-4.2-3b");
  });
  it("is the recommended one when nothing is installed", () => {
    expect(localModelOf(view(qwen("missing"), granite("partial")), settings(""))?.id).toBe("qwen3.5-4b");
  });
});

describe("step 6 with no model", () => {
  const none = view(model("qwen3.5-4b", "missing"), model("granite-4.2-3b", "missing"));
  const line = "No model is on this computer yet. Download one above, or continue and Ensayo will give timing notes only.";
  it("says so under the list when the built-in AI is chosen and nothing is installed", () => {
    expect(noUsableLocalModel(none)).toBe(true);
    expect(renderToString(<NoModelLine kind="local" builtIn status={none} />)).toContain(line);
  });
  it("says nothing when a usable model is installed, or the list is not known yet", () => {
    const some = view(model("qwen3.5-4b", "missing"), model("granite-4.2-3b", "ready"));
    expect(renderToString(<NoModelLine kind="local" builtIn status={some} />)).toBe("");
    expect(renderToString(<NoModelLine kind="local" builtIn status={null} />)).toBe("");
  });
  it("counts an installed model that is too big as no model, and stays quiet for other engines", () => {
    expect(noUsableLocalModel(view(model("gemma-4-e4b", "ready", { too_small_here: true })))).toBe(true);
    expect(renderToString(<NoModelLine kind="key" builtIn status={none} />)).toBe("");
    expect(renderToString(<NoModelLine kind="local" builtIn={false} status={none} />)).toBe("");
  });
});

describe("step 7 when the story cannot be read", () => {
  const noop = () => {};
  it("recognises the missing-model error by the constant the backend uses", () => {
    const rust = readSource("src-tauri/src/ai_commands.rs");
    expect(rust).toContain(`pub const LOCAL_MODEL_MISSING: &str = "${LOCAL_MODEL_MISSING}";`);
    expect(isLocalModelMissing("The local AI model (Qwen3.5 4B) isn't downloaded yet. Download it in Settings › AI.")).toBe(true);
    expect(isLocalModelMissing(new Error("Offline."))).toBe(false);
  });
  it("sends the person back to the AI step without naming Settings", () => {
    const html = renderToString(<StoryProblem problem="The local AI model (Qwen3.5 4B) isn't downloaded yet. Download it in Settings › AI." noModel onFillIn={noop} onBack={noop} />);
    expect(html).toContain(LOCAL_MODEL_MISSING_LINE);
    expect(html).toContain("Back to the AI step");
    expect(html).toContain("Fill it in yourself");
    expect(html).not.toContain("Settings");
  });
  it("keeps other problems as they are, with only the fill-in button", () => {
    const html = renderToString(<StoryProblem problem="Offline." noModel={false} onFillIn={noop} onBack={noop} />);
    expect(html).toContain("Offline.");
    expect(html).not.toContain("Back to the AI step");
  });
});
