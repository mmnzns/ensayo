import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { nightDraftOf, nightEdited } from "../screens/applications/forms";
import { hasUnsavedText, draftOf } from "../screens/applications/afterInterview";
import { LeaveDialogView } from "../ui/LeaveDialog";
import Link from "../ui/Link";
import { LEAVE_BODY, LEAVE_GO, LEAVE_STAY, LEAVE_TITLE, addGuardForTest, askBefore, confirmLeave, differs, hashChangeDecision, isAsking, isBlocked, isPlainClick, resetDirtyGuards, stayHere } from "../ui/dirtyGuard";
import { go } from "../ui/router";

afterEach(() => {
  resetDirtyGuards();
  delete (globalThis as { window?: unknown }).window;
});

const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };

describe("the leave question", () => {
  it("passes straight through when nothing is unsaved", () => {
    let ran = 0;
    expect(askBefore(() => ran++)).toBe(true);
    expect(ran).toBe(1);
    addGuardForTest({ dirty: false });
    expect(isBlocked()).toBe(false);
  });

  it("holds the move while something is unsaved, and runs it on Leave", () => {
    addGuardForTest({ dirty: true });
    let ran = 0;
    expect(isBlocked()).toBe(true);
    expect(askBefore(() => ran++)).toBe(false);
    expect(ran).toBe(0);
    expect(isAsking()).toBe(true);
    confirmLeave();
    expect(ran).toBe(1);
    expect(isAsking()).toBe(false);
    // Leaving gives the edits up, so the next move is not asked about.
    expect(isBlocked()).toBe(false);
  });

  it("drops the move on Keep editing and keeps asking later", () => {
    addGuardForTest({ dirty: true });
    let ran = 0;
    askBefore(() => ran++);
    stayHere();
    expect(ran).toBe(0);
    expect(isAsking()).toBe(false);
    expect(isBlocked()).toBe(true);
  });

  it("wraps go(): the hash only changes after Leave", () => {
    const win = { location: { hash: "#/5-1-stories" } };
    (globalThis as { window?: unknown }).window = win;
    addGuardForTest({ dirty: true });
    go("2-1-home");
    expect(win.location.hash).toBe("#/5-1-stories");
    confirmLeave();
    expect(win.location.hash).toBe("#/2-1-home");
  });

  it("wraps link clicks: a plain click is held, a modified click or a clean screen is not", () => {
    const win = { location: { hash: "#/5-1-stories" } };
    (globalThis as { window?: unknown }).window = win;
    const el = Link({ to: "6-1-applications", children: "Applications" }) as { props: { onClick: (e: object) => void } };
    const event = (over: object = {}) => ({ ...click, preventDefault() { this.defaultPrevented = true; }, ...over });
    // Nothing unsaved: the browser follows the link itself.
    const clean = event();
    el.props.onClick(clean);
    expect(clean.defaultPrevented).toBe(false);
    addGuardForTest({ dirty: true });
    const modified = event({ metaKey: true });
    el.props.onClick(modified);
    expect(modified.defaultPrevented).toBe(false);
    const plain = event();
    el.props.onClick(plain);
    expect(plain.defaultPrevented).toBe(true);
    expect(isAsking()).toBe(true);
    confirmLeave();
    expect(win.location.hash).toBe("#/6-1-applications");
  });

  it("reverts a hash change that slips through while unsaved", () => {
    expect(hashChangeDecision(true)).toBe("revert");
    expect(hashChangeDecision(false)).toBe("accept");
  });

  it("only treats an ordinary left click as leaving", () => {
    expect(isPlainClick(click)).toBe(true);
    expect(isPlainClick({ ...click, button: 1 })).toBe(false);
    expect(isPlainClick({ ...click, ctrlKey: true })).toBe(false);
    expect(isPlainClick({ ...click, shiftKey: true })).toBe(false);
    expect(isPlainClick({ ...click, defaultPrevented: true })).toBe(false);
  });

  it("asks in the agreed words", () => {
    expect(LEAVE_TITLE).toBe("Leave without saving?");
    expect(LEAVE_BODY).toBe("Your changes here haven't been saved.");
    const html = renderToString(<LeaveDialogView asking={true} onStay={() => {}} onLeave={() => {}} />);
    expect(html).toContain(LEAVE_STAY);
    expect(html).toContain(LEAVE_GO);
    expect(html).not.toContain("—");
    expect(renderToString(<LeaveDialogView asking={false} onStay={() => {}} onLeave={() => {}} />)).toBe("");
  });
});

describe("what counts as unsaved on each screen", () => {
  it("compares fields ignoring spaces at the ends", () => {
    expect(differs({ a: "x ", n: [{ v: "1" }] }, { a: "x", n: [{ v: "1" }] })).toBe(false);
    expect(differs({ a: "x" }, { a: "y" })).toBe(true);
    expect(differs({ n: [{ v: "1", checked: false }] }, { n: [{ v: "1", checked: true }] })).toBe(true);
  });

  it("story review and story edit: any edited field, a ticked number or a theme", () => {
    const opened = { title: "Pricing", headline: "Cut churn", numbers: [{ id: "a", label: "Churn", value: "31%", checked: false }], goodFor: ["Ownership"] };
    expect(differs(opened, structuredClone(opened))).toBe(false);
    expect(differs({ ...opened, headline: "Cut churn 31 to 24" }, opened)).toBe(true);
    expect(differs({ ...opened, numbers: [{ ...opened.numbers[0], checked: true }] }, opened)).toBe(true);
    expect(differs({ ...opened, goodFor: [] }, opened)).toBe(true);
    // A save moves the baseline, so the saved values are clean again.
    const saved = { ...opened, headline: "Cut churn 31 to 24" };
    expect(differs(saved, saved)).toBe(false);
  });

  it("new application and edit details: typed text, a changed status or an added stage", () => {
    const opened = { company: "", role: "", status: "applied", posting: "", startup: false, choice: "attach", fileName: "", stages: [{ stage: "recruiter", date: "", time: "" }] };
    expect(differs(opened, { ...opened })).toBe(false);
    expect(differs({ ...opened, company: "Acme" }, opened)).toBe(true);
    expect(differs({ ...opened, company: "   " }, opened)).toBe(false);
    expect(differs({ ...opened, fileName: "cv.pdf" }, opened)).toBe(true);
    expect(differs({ ...opened, stages: [...opened.stages, { stage: "panel", date: "", time: "" }] }, opened)).toBe(true);
  });

  it("feedback: a message, an email or a choice", () => {
    const opened = { topic: "Something broke", message: "", pay: null, fair: null, email: "" };
    expect(differs(opened, { ...opened })).toBe(false);
    expect(differs({ ...opened, message: "It froze" }, opened)).toBe(true);
    expect(differs({ ...opened, pay: "Maybe" }, opened)).toBe(true);
  });

  it("after the interview: text the saved note does not hold", () => {
    expect(hasUnsavedText(draftOf(undefined), undefined)).toBe(false);
    expect(hasUnsavedText({ ...draftOf(undefined), worked: "The opener landed" }, undefined)).toBe(true);
  });

  it("night before: a lock changed, or anything chosen with no lock yet", () => {
    const lock = { opener: "Three beats", powerStoryId: "s1", questions: ["What does success look like?"] };
    expect(nightEdited(nightDraftOf(lock), lock)).toBe(false);
    expect(nightEdited({ ...nightDraftOf(lock), opener: "Four beats" }, lock)).toBe(true);
    expect(nightEdited({ ...nightDraftOf(lock), questions: ["", "Who decides?"] }, lock)).toBe(true);
    expect(nightEdited(nightDraftOf(undefined), undefined)).toBe(false);
    expect(nightEdited({ ...nightDraftOf(undefined), opener: "  " }, undefined)).toBe(false);
    expect(nightEdited({ ...nightDraftOf(undefined), powerId: "s2" }, undefined)).toBe(true);
    // Editing one stage leaves another stage's entry alone: each stage compares against its own lock.
    const other = { opener: "Other", powerStoryId: "s9", questions: [] };
    expect(nightEdited(nightDraftOf(other), other)).toBe(false);
  });
});
