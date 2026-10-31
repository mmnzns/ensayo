import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuiltInPanel } from "../screens/settings/AiEngine";
import type { AiScreenState, LocalAiView, LocalModel } from "../screens/settings/aiSettings";
import SpeechModelList, { type SpeechModelListProps } from "../screens/settings/SpeechModelList";
import { modelRows, type SpeechModelEntry } from "../screens/settings/speechModels";

const entry = (id: string, state: SpeechModelEntry["state"], over: Partial<SpeechModelEntry> = {}): SpeechModelEntry => ({ id, name: `Name of ${id}`, maker: "OpenAI", note: "", languages: "", size_mb: 100, recommended: true, state, ...over });

const no = () => {};
function list(models: SpeechModelEntry[], over: Partial<SpeechModelListProps> = {}, inUse = "") {
  const props: SpeechModelListProps = { rows: modelRows(models, inUse), fraction: 0, busy: false, showAll: false, confirmId: null, onShowAll: no, onUse: no, onFetch: no, onCancel: no, onAskDelete: no, onDelete: no, ...over };
  return renderToString(<SpeechModelList {...props} />);
}

describe("the speech model rows", () => {
  it("shows Download for a missing model and no Delete", () => {
    const html = list([entry("a", "missing")]);
    expect(html).toContain("Download");
    expect(html).toContain("Not downloaded");
    expect(html).not.toContain("Delete");
  });

  it("shows Resume and how much is there for an interrupted download", () => {
    const html = list([entry("a", "partial", { fraction: 0.4 })]);
    expect(html).toContain("Resume");
    expect(html).toContain("Partly downloaded, 40%");
    expect(html).toContain('aria-valuenow="40"');
    expect(html).not.toContain("Delete");
  });

  it("shows Cancel and the live percent for a download running here, with no Download button", () => {
    const html = list([entry("a", "downloading", { fraction: 0.1 })], { fraction: 0.55, busy: true });
    expect(html).toContain("Cancel");
    expect(html).toContain("Downloading, 55%");
    expect(html).not.toContain(">Download<");
    expect(html).not.toContain("Resume");
  });

  it("says another Craft Concepts app is downloading it, with no button to start one", () => {
    const html = list([entry("a", "downloading_elsewhere", { fraction: 0.5 })]);
    expect(html).toContain("Another Craft Concepts app is downloading it");
    expect(html).not.toContain("Cancel");
    expect(html).not.toContain(">Download<");
    expect(html).not.toContain("Delete");
  });

  it("shows Delete on every installed model, from this app or another", () => {
    const html = list([entry("a", "ready"), entry("b", "on_this_computer")]);
    expect(html.match(/>Delete</g)).toHaveLength(2);
  });

  it("asks before deleting, naming the model and saying other apps keep it", () => {
    const html = list([entry("a", "ready")], { confirmId: "a" });
    expect(html).toContain("Delete Name of a? Other Craft Concepts apps that use it keep it.");
    expect(html).toContain("Keep it");
  });

  it("keeps the other models behind Show all models, and lists them when asked", () => {
    const models = [entry("a", "ready"), entry("b", "missing", { recommended: false })];
    const closed = list(models);
    expect(closed).toContain("Show all models");
    expect(closed).toContain("1 more");
    expect(closed).not.toContain("Name of b");
    const open = list(models, { showAll: true });
    expect(open).toContain("Name of b");
    expect(open).toContain("Show fewer models");
  });

  it("has no Show all models button when everything is already shown", () => {
    expect(list([entry("a", "ready")])).not.toContain("Show all models");
  });
});

const localModel = (id: string, over: Partial<LocalModel> = {}): LocalModel => ({ id, name: `Model ${id}`, maker: "Qwen", note: "A note.", licence: "Apache-2.0", size_mb: 2740, recommended: true, state: "missing", ...over });
const settings = { provider: "local", fast_model: "", strong_model: "", base_url: "", cost_cap_usd: 1 };
const st: AiScreenState = { kind: "local", cloudId: "claude", settings };

function panel(m: LocalModel, over: Record<string, unknown> = {}) {
  const status: LocalAiView = { models: [m], selected: m.id, helper_found: true };
  const ai = { status, busy: null, error: "", notice: "", confirming: null, askDelete: no, download: no, cancel: no, remove: no, ...over };
  return renderToString(<BuiltInPanel ai={ai as never} st={st} change={no} />);
}

describe("the built-in local AI panel", () => {
  it("offers Download for a missing model", () => {
    const html = panel(localModel("a"));
    expect(html).toContain(">Download<");
    expect(html).not.toContain("Delete");
  });

  it("offers Resume for an interrupted download", () => {
    const html = panel(localModel("a", { state: "partial", fraction: 0.4 }));
    expect(html).toContain(">Resume<");
    expect(html).toContain("Partly downloaded, 40%");
  });

  it("shows progress and Cancel while it downloads here", () => {
    const html = panel(localModel("a", { state: "downloading", fraction: 0.2 }), { busy: { id: "a", fraction: 0.6 } });
    expect(html).toContain("Cancel");
    expect(html).toContain("Downloading… 60%");
    expect(html).not.toContain(">Resume<");
  });

  it("says another app is downloading it and nothing to press", () => {
    const html = panel(localModel("a", { state: "downloading_elsewhere", fraction: 0.3 }));
    expect(html).toContain("Another Craft Concepts app is downloading it");
    expect(html).not.toContain(">Download<");
    expect(html).not.toContain(">Resume<");
  });

  it("shows Delete for a model that is here, and the question before it goes", () => {
    expect(panel(localModel("a", { state: "ready" }))).toContain(">Delete<");
    const html = panel(localModel("a", { state: "on_this_computer" }), { confirming: "a" });
    expect(html).toContain("Delete Model a? Other Craft Concepts apps that use it keep it.");
    expect(html).toContain("Keep it");
  });

  it("says what a delete did", () => {
    expect(panel(localModel("a"), { notice: "Model a is deleted from this computer." })).toContain("is deleted from this computer.");
  });
});
