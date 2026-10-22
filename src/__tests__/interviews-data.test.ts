import { describe, expect, it } from "vitest";
import { mockApplication } from "../data/actions";
import type { InterviewNoteInput } from "../data/applicationCommands";
import { askedLine, guessKind, mockDeleteInterviewNote, mockForgetAsked, mockSaveInterviewNote, mockSetAskedFirst, noteFor, questionKey, splitAsked } from "../data/interviews";
import { mockDeleteQuestion } from "../data/actions";
import { defaultStage, draftOf, inputOf, interviewHappened, isBlank } from "../screens/applications/afterInterview";

const NOW = new Date("2026-10-22T09:00:00");
const fresh = () => mockApplication({ company: "Heronpay" }, NOW);
const input = (stage: string, over: Partial<InterviewNoteInput> = {}): InterviewNoteInput => ({ stage_id: stage, rating: 4, asked: ["Why Heronpay?", "How soon could you start?"], worked: "The activation story", differently: "Slow down", spoke_to: "Priya", next_step: "Hiring manager next week", ...over });

describe("the questions they asked", () => {
  it("are split on new lines, trimmed, without empties or repeats, in order", () => {
    expect(splitAsked("  Why Kestrel?  \n\n  What is your notice period?\r\nwhy   kestrel?\n")).toEqual(["Why Kestrel?", "What is your notice period?"]);
    expect(splitAsked("")).toEqual([]);
    expect(splitAsked(" \n \n")).toEqual([]);
  });

  it("compare as normalised text", () => {
    expect(questionKey("  Why   Kestrel? ")).toBe(questionKey("why kestrel?"));
  });

  it("get a guessed kind, behavioral when nothing says otherwise", () => {
    expect(guessKind("Tell me about yourself")).toBe("about_you");
    expect(guessKind("What is your notice period?")).toBe("factual");
    expect(guessKind("Why do you want to work here?")).toBe("motivation");
    expect(guessKind("Where do you see yourself in five years?")).toBe("future");
    expect(guessKind("Describe a launch that went wrong.")).toBe("behavioral");
  });
});

describe("the note in the browser preview", () => {
  it("saves, marks the stage done and puts the asked questions in the set as asked", () => {
    const b = fresh();
    const stage = b.application.process[0];
    const out = mockSaveInterviewNote(b, input(stage.id), NOW);
    const note = noteFor(out.extras.interviewNotes, stage.id)!;
    expect(note).toMatchObject({ rating: 4, asked: ["Why Heronpay?", "How soon could you start?"], spokeTo: "Priya", nextStep: "Hiring manager next week", heldOn: "2026-10-22" });
    expect(out.application.process[0].done).toBe(true);
    const asked = out.extras.questions.filter((q) => q.source === "asked");
    expect(asked.map((q) => [q.text, q.stageId, q.type, q.editedByUser])).toEqual([["Why Heronpay?", stage.id, "motivation", true], ["How soon could you start?", stage.id, "factual", true]]);
    expect(b.extras.interviewNotes).toBeUndefined();
  });

  it("replaces the note for a stage and does not add a question twice", () => {
    const b = fresh();
    const id = b.application.process[0].id;
    const once = mockSaveInterviewNote(b, input(id), NOW);
    const twice = mockSaveInterviewNote(once, input(id, { worked: "Changed", asked: ["why   heronpay?"] }), NOW);
    expect(twice.extras.interviewNotes).toHaveLength(1);
    expect(twice.extras.interviewNotes![0].worked).toBe("Changed");
    expect(twice.extras.questions).toHaveLength(once.extras.questions.length);
  });

  it("refuses a rating outside 1 to 5 and an unknown stage", () => {
    const b = fresh();
    expect(() => mockSaveInterviewNote(b, input(b.application.process[0].id, { rating: 6 }), NOW)).toThrow(/1 to 5/);
    expect(() => mockSaveInterviewNote(b, input("stg_nope"), NOW)).toThrow();
  });

  it("deletes only the note, and removing an asked question takes it out of the note", () => {
    const b = fresh();
    const [s1, s2] = b.application.process;
    let out = mockSaveInterviewNote(b, input(s1.id), NOW);
    out = mockSaveInterviewNote(out, input(s2.id, { asked: [] }), NOW);
    const gone = out.extras.questions.find((q) => q.text === "Why Heronpay?")!;
    const forgotten = mockDeleteQuestion(mockForgetAsked(out, gone.id), gone.id);
    expect(noteFor(forgotten.extras.interviewNotes, s1.id)!.asked).toEqual(["How soon could you start?"]);
    const deleted = mockDeleteInterviewNote(out, s1.id);
    expect(deleted.extras.interviewNotes!.map((n) => n.stageId)).toEqual([s2.id]);
    expect(deleted.extras.questions.filter((q) => q.source === "asked")).toHaveLength(2);
  });

  it("keeps the switch", () => {
    const b = fresh();
    expect(b.extras.askedFirst).toBeUndefined();
    expect(mockSetAskedFirst(b, false).extras.askedFirst).toBe(false);
  });

  it("says how many they asked in plain words", () => {
    const note = { stageId: "s", heldOn: "", rating: null, asked: ["a", "b", "c", "d"], worked: "", differently: "", spokeTo: "", nextStep: "", created: "", edited: "" };
    expect(askedLine(note, "Recruiter")).toBe("They asked 4 questions at the recruiter stage");
    expect(askedLine({ ...note, asked: ["a"] }, "Panel")).toBe("They asked 1 question at the panel stage");
  });
});

describe("when the sheet is offered", () => {
  const stage = (over: object) => ({ done: false, at: undefined as string | undefined, ...over });
  it("once the stage is done or its date has passed, never before", () => {
    expect(interviewHappened(stage({ done: true }), NOW)).toBe(true);
    expect(interviewHappened(stage({ at: "2026-10-21T10:00" }), NOW)).toBe(true);
    expect(interviewHappened(stage({ at: "2026-10-22T08:00" }), NOW)).toBe(true);
    expect(interviewHappened(stage({ at: "2026-10-22T14:00" }), NOW)).toBe(false);
    expect(interviewHappened(stage({ at: "2026-10-23" }), NOW)).toBe(false);
    expect(interviewHappened(stage({}), NOW)).toBe(false);
  });

  it("a date with no time counts after that day, not during it", () => {
    expect(interviewHappened(stage({ at: "2026-10-22" }), NOW)).toBe(false);
    expect(interviewHappened(stage({ at: "2026-10-21" }), NOW)).toBe(true);
  });

  it("starts at the first stage that has happened and has no note", () => {
    const b = fresh();
    const [s1, s2] = b.application.process;
    const app = { ...b.application, process: [{ ...s1, done: true }, { ...s2, at: "2026-10-21T10:00" }, ...b.application.process.slice(2)] };
    expect(defaultStage(app, undefined, NOW)?.id).toBe(s1.id);
    const note = { stageId: s1.id, heldOn: "", rating: null, asked: [], worked: "", differently: "", spokeTo: "", nextStep: "", created: "", edited: "" };
    expect(defaultStage(app, [note], NOW)?.id).toBe(s2.id);
    expect(defaultStage(b.application, undefined, NOW)?.id).toBe(s1.id);
  });
});

describe("the sheet's fields", () => {
  it("turn into the command's input with the questions split", () => {
    const d = { ...draftOf(undefined), rating: 3, asked: " One? \n\nTwo?\none?" };
    expect(inputOf("stg_2", d)).toMatchObject({ stage_id: "stg_2", rating: 3, asked: ["One?", "Two?"] });
    expect(isBlank(draftOf(undefined))).toBe(true);
    expect(isBlank(d)).toBe(false);
  });
});
