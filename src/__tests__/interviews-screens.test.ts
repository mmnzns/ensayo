import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockApplication } from "../data/actions";
import type { AppBundle } from "../data/applicationCommands";
import { mockSaveInterviewNote } from "../data/interviews";
import { mockStore } from "../data/mock";
import type { ApplicationExtras, InterviewNote, NewApplicationDraft } from "../data/screens/applications";
import { StoreProvider, type Store } from "../data/store";
import { registry } from "../screens/registry";
import { InterviewForm } from "../screens/applications/AfterTheInterview";
import { EMPTY_DRAFT } from "../screens/applications/afterInterview";

const BLANK: NewApplicationDraft = { company: "", role: "", status: "applied", appliedOn: "", source: "", contact: "", resumeFileName: "", resumePages: 0, postingText: "", startup: false, stages: [] };
const NOW = new Date("2026-10-22T09:00:00");

function appStore(bundles: AppBundle[]): Store {
  const byApp: Record<string, ApplicationExtras> = {};
  for (const b of bundles) byApp[b.application.id] = b.extras;
  return { ...mockStore, now: () => NOW, applications: bundles.map((b) => b.application), screens: { ...mockStore.screens, applications: { ...mockStore.screens.applications, featuredId: "", byApp, newApplication: BLANK } } };
}
const render = (id: string, store: Store) => renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(registry[id]) }));
const strip = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, " ").replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

/** An application whose recruiter call was yesterday and whose hiring manager call is next week. */
function made(): AppBundle {
  const b = mockApplication({ company: "Heronpay", stages: [{ stage: "recruiter", at: "2026-10-21T10:00" }, { stage: "hiring_manager", at: "2026-10-29T14:00" }] }, NOW);
  return b;
}
const FORM: Record<string, unknown> & { note: InterviewNote | undefined } = { company: "Heronpay", stageLabel: "Recruiter", stageDate: "Oct 21", note: undefined, draft: EMPTY_DRAFT, onChange: () => {}, onSave: () => {}, onDelete: () => {}, onClose: () => {}, busy: false, error: "", saved: false, confirmDelete: false, backTo: "6-6-application-stages-and-night-before" };
const html = (over: Partial<typeof FORM> = {}) => renderToStaticMarkup(createElement(InterviewForm, { ...FORM, ...over } as never));

describe("After the interview, the sheet", () => {
  it("is empty the first time: plain labels, the placeholder, nothing saved", () => {
    const text = strip(html());
    for (const s of ["How did the recruiter go?", "How it went", "Badly", "Very well", "What did they ask?", "What you said that worked", "What you'd change", "Who you spoke to", "Next step", "Nothing written for this stage yet."]) expect(text).toContain(s);
    expect(html()).toContain("One question per line. Rough wording is fine.");
    expect(text).toContain("No questions noted. You can add them later from the Stages tab.");
    expect(text).not.toContain("Delete this note");
    expect(text).toContain("Close without saving");
    expect(html()).not.toContain("—");
  });

  it("shows what was written when there is a note, with a way to delete it", () => {
    const base = made();
    const stage = base.application.process[0].id;
    const b = mockSaveInterviewNote(base, { stage_id: stage, rating: 4, asked: ["Why Heronpay?", "How soon could you start?"], worked: "The activation story", differently: "Slow down on pay", spoke_to: "Priya", next_step: "Hiring manager next week" }, NOW);
    const note = b.extras.interviewNotes![0];
    const out = html({ note, draft: { rating: 4, asked: "Why Heronpay?\nHow soon could you start?", worked: "The activation story", differently: "Slow down on pay", spokeTo: "Priya", nextStep: "Hiring manager next week" } });
    const text = strip(out);
    expect(out).toContain("Why Heronpay?\nHow soon could you start?");
    expect(out).toContain('aria-checked="true"');
    expect(out).toContain('value="Priya"');
    expect(text).toContain("2 questions. They go into this application's questions, marked as asked.");
    expect(text).toContain("Delete this note");
    expect(text).not.toContain("Nothing written for this stage yet.");
  });

  it("says it was saved, and offers the way back", () => {
    const text = strip(html({ saved: true }));
    expect(text).toContain("Saved. The stage is marked done.");
    expect(text).toContain("Back to stages");
  });

  it("asks before deleting, and shows a failed save in plain words", () => {
    expect(strip(html({ confirmDelete: true, note: { stageId: "s", heldOn: "", rating: null, asked: [], worked: "", differently: "", spokeTo: "", nextStep: "", created: "", edited: "2026-10-22T09:00:00Z" } }))).toContain("The questions already in this application's questions stay there.");
    expect(strip(html({ error: "The data folder isn't available." }))).toContain("The data folder isn't available.");
  });
});

describe("After the interview, as a screen", () => {
  it("opens on the stage that has happened, with its name and date", () => {
    const text = strip(render("6-11-after-the-interview", appStore([made()])));
    expect(text).toContain("How did the recruiter go?");
    expect(text).toContain("Heronpay");
    expect(text).toContain("Oct 21");
  });

  it("opens the written note for the stage", () => {
    const b = made();
    const done = mockSaveInterviewNote(b, { stage_id: b.application.process[0].id, rating: 5, asked: ["Why Heronpay?"], worked: "Opened with the number", differently: "", spoke_to: "Priya", next_step: "Wait" }, NOW);
    const out = render("6-11-after-the-interview", appStore([done]));
    expect(out).toContain("Why Heronpay?");
    expect(out).toContain("Opened with the number");
    expect(out).toContain('value="Priya"');
  });
});

describe("the Stages tab and the Overview around the note", () => {
  it("offers After the interview for a stage whose date has passed, and not for one still ahead", () => {
    const b = made();
    const out = render("6-6-application-stages-and-night-before", appStore([b]));
    expect(out).toContain(`6-11-after-the-interview?app=${b.application.id}&amp;stage=${b.application.process[0].id}`);
    expect(out).not.toContain(`6-11-after-the-interview?app=${b.application.id}&amp;stage=${b.application.process[1].id}`);
    expect(strip(out)).toContain("After the interview");
  });

  it("offers it for a stage marked done even without a date, and shows the note once written", () => {
    const b = made();
    const done = { ...b, application: { ...b.application, process: b.application.process.map((p, i) => (i === 1 ? { ...p, done: true } : p)) } };
    expect(render("6-6-application-stages-and-night-before", appStore([done]))).toContain(`stage=${b.application.process[1].id}`);
    const written = mockSaveInterviewNote(b, { stage_id: b.application.process[0].id, rating: null, asked: ["One?", "Two?", "Three?", "Four?"], worked: "", differently: "", spoke_to: "", next_step: "" }, NOW);
    const text = strip(render("6-6-application-stages-and-night-before", appStore([written])));
    expect(text).toContain("They asked 4 questions at the recruiter stage");
    expect(text).toContain("Edit");
  });

  it("the Overview has a line with a link to the questions they asked", () => {
    const b = made();
    const written = mockSaveInterviewNote(b, { stage_id: b.application.process[0].id, rating: null, asked: ["One?", "Two?"], worked: "", differently: "", spoke_to: "", next_step: "" }, NOW);
    const out = render("6-3-application-overview", appStore([written]));
    expect(strip(out)).toContain("They asked 2 questions at the recruiter stage · see them");
    expect(out).toContain(`applications-questions?app=${b.application.id}&amp;stage=${b.application.process[0].id}`);
    expect(strip(render("6-3-application-overview", appStore([b])))).not.toContain("They asked");
  });

  it("the Questions tab shows what they asked first, marked, and the switch", () => {
    const b = made();
    const written = mockSaveInterviewNote(b, { stage_id: b.application.process[0].id, rating: null, asked: ["Why Heronpay?"], worked: "", differently: "", spoke_to: "", next_step: "" }, NOW);
    const open = { ...written.application, current_stage_id: b.application.process[0].id, process: written.application.process.map((p, i) => ({ ...p, done: i === 1 })).map((p, i) => (i === 0 ? { ...p, done: false } : p)) };
    const withOwn: AppBundle = { application: open, extras: { ...written.extras, questions: [{ id: "q_1", stageId: b.application.process[0].id, type: "factual", text: "A prepared question about notice." }, ...written.extras.questions] } };
    const out = render("applications-questions", appStore([withOwn]));
    const text = strip(out);
    expect(text).toContain("Asked at the recruiter stage");
    expect(text).toContain("They asked this");
    expect(text.indexOf("Why Heronpay?")).toBeLessThan(text.indexOf("A prepared question about notice."));
    expect(text).toContain("Start a later stage's Drill with up to two questions they asked at earlier stages");
    expect(out).toMatch(/type="checkbox"[^>]*checked/);
    const off = render("applications-questions", appStore([{ ...withOwn, extras: { ...withOwn.extras, askedFirst: false } }]));
    expect(off).not.toMatch(/type="checkbox"[^>]*checked/);
  });

  it("the Questions tab has no switch when nothing was asked", () => {
    expect(strip(render("applications-questions", appStore([made()])))).not.toContain("Start a later stage's Drill");
  });
});
