import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockApplication, patchApplication } from "../data/actions";
import type { AppBundle } from "../data/applicationCommands";
import { mockStore } from "../data/mock";
import type { ApplicationExtras, NewApplicationDraft } from "../data/screens/applications";
import { StoreProvider, type Store } from "../data/store";
import type { Application } from "../data/types";
import { registry } from "../screens/registry";

// The screens as the app serves them: no sample extras, no featured application, a blank new-application form, and
// applications in the shape the backend sends.

const BLANK: NewApplicationDraft = { company: "", role: "", status: "applied", appliedOn: "", source: "", contact: "", resumeFileName: "", resumePages: 0, postingText: "", startup: false, stages: [] };
const TODAY = new Date("2026-10-21T21:30:00");

function appStore(bundles: AppBundle[]): Store {
  const byApp: Record<string, ApplicationExtras> = {};
  for (const b of bundles) byApp[b.application.id] = b.extras;
  return { ...mockStore, applications: bundles.map((b) => b.application), screens: { ...mockStore.screens, applications: { ...mockStore.screens.applications, featuredId: "", byApp, newApplication: BLANK } } };
}

const render = (id: string, store: Store) => renderToStaticMarkup(createElement(StoreProvider, { store, children: createElement(registry[id]) }));
const strip = (html: string) =>
  html
    .replace(/<style>[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const inputValues = (html: string) => [...html.matchAll(/value="([^"]*)"/g)].map((m) => m[1]);

const fresh = (over: Partial<Application> = {}, extras: Partial<ApplicationExtras> = {}): AppBundle => {
  const b = mockApplication({ company: "Heronpay", role: "Lifecycle Manager" }, TODAY);
  return { application: { ...b.application, ...over }, extras: { ...b.extras, ...extras } };
};

const DETAIL = ["6-3-application-overview", "6-4-application-edit-details", "6-5-application-the-resume-you-sent", "6-6-application-stages-and-night-before", "6-7-cue-sheet", "6-8-application-what-you-ve-said", "applications-questions"];

describe("the applications screens as the app serves them", () => {
  it("the list says so when there is nothing yet, and shows nothing from the sample", () => {
    const text = strip(render("6-1-applications", appStore([])));
    expect(text).toContain("No applications yet");
    expect(text).not.toMatch(/Kestrel|Northpine/);
  });

  it("each row and the next-up card name the application they open", () => {
    const b = fresh();
    b.application.process[1].at = "2026-10-23T14:00";
    const html = render("6-1-applications", appStore([b]));
    expect(html).toContain(`href="#/6-3-application-overview?app=${b.application.id}"`);
    expect(html).toContain(`href="#/2-3-start-a-session?app=${b.application.id}&amp;stage=${b.application.process[1].id}"`);
  });

  it("New application starts blank, with the target's usual stages and no sample company", () => {
    const html = render("6-2-new-application", appStore([]));
    expect(inputValues(html)).not.toContain("Kestrel Pay");
    const text = strip(html);
    for (const s of ["Recruiter", "Hiring manager", "Technical", "Panel"]) expect(text).toContain(s);
    expect(text).toContain("Save and read both");
    expect(html).toContain('type="date"');
    expect(text).not.toContain("Closed");
  });

  it.each(DETAIL)("%s renders for an application that was just made", (id) => {
    const html = render(id, appStore([fresh()]));
    expect(html.length).toBeGreaterThan(200);
    for (const bad of ["undefined", "NaN", "[object Object]"]) expect(html, bad).not.toContain(bad);
    expect(strip(html)).toContain("Heronpay");
  });

  it("every detail link carries the application along", () => {
    const b = fresh();
    const html = render("6-3-application-overview", appStore([b, fresh({ id: "other", company: "Other Co" })]));
    for (const m of html.matchAll(/href="#\/(6-[3-8][^"?]*)([^"]*)"/g)) expect(m[2], m[1]).toBe(`?app=${b.application.id}`);
  });

  it("Overview with nothing read lets the posting be pasted and read right there", () => {
    const text = strip(render("6-3-application-overview", appStore([fresh()])));
    expect(text).toContain("Nothing read from the posting yet");
    expect(text).toContain("Read the posting");
  });

  it("Overview says what was edited, and offers a status the tracker suggests", () => {
    const analysis = { summary: "A lifecycle role.", priorities: [{ title: "Own onboarding", detail: "End to end." }], beliefs: [{ text: "You can run it alone", storyId: null, story: "", covered: false }], gaps: [], echo: [] };
    const b = fresh({ analysis, edited_by_user: ["analysis.summary", "analysis.priorities.0"], suggested_status: "interviewing" });
    const text = strip(render("6-3-application-overview", appStore([b])));
    expect(text).toContain("Edited by you");
    expect(text).toContain("Mark it Interviewing");
    expect(text).toContain("Next stage");
  });

  it("Stages offers to lock three things when nothing is locked, and the cue sheet when it is", () => {
    const b = fresh();
    const open = strip(render("6-6-application-stages-and-night-before", appStore([b])));
    expect(open).toContain("Lock these three");
    expect(open).not.toContain("Open cue sheet");
    const stage = b.application.process[0].id;
    const locked = fresh({}, { lockedByStage: { [stage]: { stageId: stage, openerPrompt: "Tell me about yourself", opener: "Lifecycle marketer.", powerStoryId: mockStore.stories[0].id, powerNumbers: "31% → 44%", questions: ["What does success look like?"], rehearseMinutes: 6 } } });
    const html = render("6-6-application-stages-and-night-before", appStore([{ application: { ...b.application }, extras: locked.extras }]));
    const text = strip(html);
    expect(text).toContain("Open cue sheet");
    expect(text).toContain("Rehearse just these · 6 min");
    expect(text).toContain("What does success look like?");
    expect(html).toContain(`6-7-cue-sheet?app=${b.application.id}&amp;stage=${stage}`);
  });

  it("Stages has a way to edit the list, with every kind of stage to add", () => {
    const text = strip(render("6-6-application-stages-and-night-before", appStore([fresh()])));
    expect(text).toContain("Edit stages");
  });

  it("Resume says what to do for each state of the file", () => {
    const none = strip(render("6-5-application-the-resume-you-sent", appStore([fresh()])));
    expect(none).toContain("No resume attached");
    expect(none).toContain("I didn't send one");
    const resume = { fileName: "dana.pdf", title: "", pages: 0, sentOn: "2026-10-15", readOn: "", claims: [], mustSay: [], suggestions: [], status: "no_text" as const, needs_paste: true, must_say_state: "" };
    const scan = render("6-5-application-the-resume-you-sent", appStore([fresh({ resume })]));
    expect(strip(scan)).toContain("Paste the text of your resume");
    expect(scan).toContain('aria-label="Your resume text"');
    const unread = strip(render("6-5-application-the-resume-you-sent", appStore([fresh({ resume: { ...resume, status: "attached", needs_paste: false } })])));
    expect(unread).toContain("hasn't read it yet");
    expect(unread).toContain("not read yet");
    const waiting = strip(render("6-5-application-the-resume-you-sent", appStore([fresh({ resume: { ...resume, status: "read", needs_paste: false, must_say_state: "waiting_for_posting" } })])));
    expect(waiting).toContain("Waiting for the posting");
    const no = strip(render("6-5-application-the-resume-you-sent", appStore([fresh({ no_resume: true })])));
    expect(no).toContain("You said you didn't send one");
  });

  it("Resume offers another application's resume only when there is one", () => {
    const withResume = fresh({ id: "app_a", company: "Alpha", resume: { fileName: "a.pdf", title: "", pages: 1, sentOn: "2026-10-01", readOn: "2026-10-01", claims: [], mustSay: [], suggestions: [], status: "read" } });
    const without = fresh({ id: "app_b", company: "Beta" });
    expect(strip(render("6-5-application-the-resume-you-sent", appStore([without, withResume])))).toContain("Use one from another application");
    expect(strip(render("6-5-application-the-resume-you-sent", appStore([without])))).not.toContain("Use one from another application");
  });

  it("What you've said strikes a replaced line and marks the one that is current", () => {
    const claim = (id: string, quote: string, over: Record<string, unknown>) => ({ id, type: "notice" as const, subject: "Notice period", value: quote, quote, stage: "stg_1", stage_label: "Recruiter", status: "consistent" as const, ...over });
    const b = fresh({ claims: [claim("a", "Four weeks", { superseded: true, note: "Replaced by the current answer." }), claim("b", "Two weeks", { status: "updated", note: "Marked as the current answer", superseded: false, edited: true })] });
    const html = render("6-8-application-what-you-ve-said", appStore([b]));
    expect(html).toContain("<s ");
    expect(strip(html)).toContain("Two weeks");
    expect(strip(html)).toContain("edited by you");
    expect(strip(html)).toContain("+ Add a line");
  });

  it("Questions marks the ones you wrote or changed", () => {
    const b = fresh();
    b.extras.questions = [
      { id: "q_1", stageId: b.application.process[0].id, type: "factual", text: "What is your notice period?" },
      { id: "q_2", stageId: b.application.process[0].id, type: "motivation", text: "Why us?", editedByUser: true, why: "The posting stresses mission." },
    ];
    const text = strip(render("applications-questions", appStore([b])));
    expect(text).toContain("What is your notice period?");
    expect(text.match(/Edited by you/g)).toHaveLength(1);
    expect(text).toContain("The posting stresses mission.");
  });

  it("Edit details asks why when the application is closed, and notes what was edited", () => {
    const b = patchApplication(fresh(), { status: "closed", closed_reason: "withdrew", role: "Senior Lifecycle Manager" });
    const html = render("6-4-application-edit-details", appStore([b]));
    const text = strip(html);
    expect(text).toContain("Why it closed");
    expect(text).toContain('Edited by you · was "Lifecycle Manager"');
    expect(text).toContain('was "Applied"');
    expect(html).toContain('type="date"');
    expect(html).toContain('value="2026-10-21"');
  });

  it("the cue sheet says there is nothing to put on it before anything is locked", () => {
    const text = strip(render("6-7-cue-sheet", appStore([fresh()])));
    expect(text).toContain("Making the sheet");
  });

  it("copy follows the house rules on every screen: no exclamation marks, no em dashes, no framework words", () => {
    const b = fresh({ no_resume: true, suggested_status: "screening" });
    // The person's own stories are theirs to word; the screens' copy is what is checked.
    for (const id of ["6-1-applications", "6-2-new-application", ...DETAIL]) {
      const text = strip(render(id, { ...appStore([b]), stories: [] }));
      expect(text, id).not.toMatch(/—|!|\bSTAR\b|\bCAAR\b|\bPREP\b/);
      expect(text, id).not.toMatch(/rubric|criterion|\bscore\b|\bfail/i);
    }
  });
});
