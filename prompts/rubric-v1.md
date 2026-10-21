---
rubric_version: 1
---

# Rubric v1

Each criterion returns `pass`, `fail` or `na`, with the sentence indices and a short quote as
evidence. "AI" criteria are judged by prompt 02 (or 05 for follow-ups). "Rules" criteria are
computed in code. "Rules + AI" means the model returns sentence indices and code does the maths.

Thresholds marked (placeholder) are tuned in M5 from labelled reps. Thresholds marked
(Guidelines) come from Miguel's Interview Guidelines and are not tuned.

## Core criteria (every answer)

### answer_first (AI) - critical
The first sentence answers the literal question that was asked.
- Return `first_answer_sentence`: the index of the first sentence that directly answers the
  question. Pass only if it is sentence 1. (Code joins a leading acknowledgement of five words or
  fewer, such as "Good question." or "Sure.", onto the next sentence when it splits the
  transcript, so a short acknowledgement never causes a fail on its own.)
- "Directly answers" means a listener who heard only that sentence would know the answer: the
  result, the position, the yes or no, the headline. Setting the scene ("So at my last company we
  had a problem with...") does not answer anything.
- Behavioral questions: a one-sentence method or headline result counts as answering.
- Yes/no questions: the sentence must contain the yes or no (or "both", "it depends on X" with X
  named).
- Fail examples: starting with background, the company, the team, "So basically...", a story
  told in time order with the result at the end.

### time_to_point (Rules)
Seconds from the start of the answer to the end of `first_answer_sentence`.
Pass under 10 seconds (placeholder). `na` when `first_answer_sentence` is null (answer_first fails).

### length (Rules)
Total speaking time within the window for the stage and question type.
- Factual questions: about 20 seconds (Guidelines), pass up to 30.
- Major story answers: stage window (Guidelines for 60 to 90 seconds; others placeholders):
  recruiter 45 to 60, hiring manager 60 to 90, panel 60 to 90, leadership 30 to 60,
  technical up to 180.
- Fail when over the window. Under the window fails only if the answer also fails `proof`.

### proof (Rules + AI)
A concrete number or outcome appears.
- With a bank: the number or outcome comes from the story that fits the question. A number that
  conflicts with the bank (says 40 % when the bank says 38 %) fails with the bank value named.
  This protects against numbers drifting upward over time. A number that is not in the bank at
  all does not count as proof: mark it `not_in_bank` so the app can say "not in your bank, check
  it". If the only numbers said are not in the bank, `proof` fails.
- Empty bank: any concrete number or measurable outcome passes.
- Return `proof_landed_sentence`: the index of the LAST sentence that states the proof. If the
  answer opens with the result and states it again at the end, that is the end sentence.
- `na` for factual questions and for clarifying questions.

### story_fit (AI)
The story told fits what was asked. The story's context (the problem it starts from) matches the
question's subject. Fail when the story answers a different question (asked about disagreement,
told a story about a launch with no disagreement in it). `na` when no story was told.

### context_short (AI)
Context before the approach or action is two to three sentences at most. Count the sentences
between the start of the story and the first sentence that says what the speaker decided or did.
Fail at four or more. `na` when no story was told.

### clean_stop (Rules + AI)
The answer stops once the proof has landed. Code measures the speaking time after
`proof_landed_sentence`. Pass under 15 seconds of tail (placeholder). A one-sentence bridge back
to the role ("That's the kind of problem I'd want to work on here") or an offer of a deeper
branch ("Happy to go into how I set up the tracking") does not count as tail.
Return `tail_exempt_sentences` for those. `na` when `proof_landed_sentence` is null.

### ownership (AI)
The speaker's own decisions and actions are clear. Pass when at least one decision or action is
first person ("I decided", "I chose", "I built", "I noticed", "I pushed for"). "We" is correct for
genuinely shared work and is never a fail on its own. Fail when every decision is "we" or "the
team", or the answer opens with "we" and never says what the speaker did.

### fillers (Rules)
Filled pauses per minute: um, uh, er, like (as filler), you know, "how do I say" (the Build Plan
list), plus "I mean" and "basically" (confirmed by Miguel 2026-10-21). Pass under 4 per minute (placeholder). Silent pauses are
never penalised: a clean pause to find a word reads as deliberate.

### type_fit (AI)
The answer does what this question type needs:
- `tell_me_about_yourself`: the identity statement from the profile (or its meaning) lands in the
  first 30 seconds. Code checks the timing from the returned sentence index.
- `technical`: names a concrete approach or mechanism, not just principles.
- `future_looking`: provisional language ("my first hypothesis would be", "I'd want to validate")
  plus a concrete first step. Fails on a confident diagnosis of a company from the outside.
- `gap` (and any "I don't know" or "I haven't used that"): the gap is acknowledged once, in one
  clause, then the answer redirects to what transfers, and it ends on capability or approach,
  never on the gap. "I don't know" is an answer, never `not_an_answer`.
- `motivation`: positive, specific to this company or role, forward-looking.
- `behavioral` and `factual`: `na` (covered by other criteria).

### conviction (Rules + AI)
No apology prefixes ("Sorry, this might be a dumb point"), no conviction killers ("but that's
just my opinion", "does that make sense?", "if that makes sense"), no hedged method language about
the speaker's own approach ("I generally try to", "I tend to", "I usually kind of"). Also fail the
opposite: "bulletproof", "foolproof", "never fails", "I'm the best at". Hedges about a genuinely
uncertain fact ("I think it was around March") are fine, and so is provisional language about a
company or a future the speaker cannot know yet ("my first hypothesis would be"). Return the
offending sentences.

### no_complaining (AI)
No criticism of a current or past employer, manager, leadership, colleagues, clients or a past
hiring process. Describing a disagreement as how a decision got made passes ("Leadership wanted
to keep the old flow, so I ran a two-week test"). Blaming, contempt or "they didn't care" fails.

## Context criteria (only when active)

### method_first (AI) - behavioral questions only
Before the story, the speaker states in one or two sentences how they handle this kind of
situation every time ("Whenever something underperforms, the first thing I do is trace it
upstream"). If the user's method library has a method for this situation, the stated method should
match its idea (not its wording). `na` for non-behavioral questions.

### approach_before_action (AI)
The strategy (what was noticed, what was decided, which metric was chosen) is said before the
execution (what was built or done). Active by default when the profile's seniority is senior or
above, and for hiring manager and leadership stages; inactive when the classifier set
`is_major_story` to false.
Judge from the start of the story: skip an opening headline sentence and an opening method
sentence, even if they mention what was done. Return `approach_sentence` and `action_sentence`
(first index of each inside the story, null if absent). Fail when the first action sentence
comes before any approach sentence, or there is no approach.

### jd_fit (AI) - only with a JD loaded
The answer uses the posting's language or names the problem the posting describes. Pass if at
least one phrase or problem from the JD summary appears in meaning.

### stage_fit (AI)
The answer suits what this stage is scoring:
- recruiter: easy to tick off; logistics answered plainly the first time.
- hiring manager: how the work was done and what changed.
- panel: how the speaker worked with other people and functions.
- leadership: judgment and trade-offs; for the founder variant, commitment and operator proof.
- technical: architecture, failure, guardrails, scale; concrete mechanisms.

### founder variant checks (AI) - leadership stage with startup flag
- `commitment`: for "gig, your own thing, or both?" style questions, the full-time goal comes in
  the first sentence. Side work may follow briefly.
- `builder_operator`: for builder versus operator questions, the first sentence answers literally
  ("Both. I build it and I run it.") and an example of personally iterating until a number moved
  follows.

### c1_consistent (prompt 07) - inside an application
Claims (reason for leaving, why this company, compensation range, notice or availability, role
and title, tenure, proof numbers) match what was said in earlier stages of the same application,
in meaning. Same meaning in different words passes. A proof number with a different value is
always a conflict. Code builds the `c1_consistent` verdict from prompt 07's `conflicts`: fail if
any, with the conflict's sentence and both values as evidence.

### question_quality (prompt 10) - the candidate's own questions
Scored at the end of a Mock (and in a Drill when practicing questions). Each question passes when it
is specific to this company, role or stage; front-loaded with an assumption framed as a guess; not
already answered by the interviewer; and one question, not a stack. Asking no question at all
fails. Salary or perks early is flagged, not failed. Source: Interview Guidelines, Section 5.
Feeds the debrief and habit tracking; it never changes the top fix of an earlier answer.

### must_say_said (prompt 10) - inside an application with a resume
Not pass or fail. For each item on the must-say list (prompt 11), whether it was said out loud
anywhere in the Mock, with the first place and a quote. Implied is not said. Shown in the Mock
debrief as "From your resume, said out loud".

## Follow-up criteria (prompt 05)

- `f1_answer_push`: the first sentence answers the follow-up directly.
- `f2_new_specific`: adds a new detail, decision, trade-off or number, not a retelling.
- `f3_consistent`: numbers, role and timeline match the first answer and the bank.
- `f4_short`: under half the first answer's speaking time (Rules).
- `f5_held_position`: under a skeptic push, no backtracking or hedge added, unless the follow-up
  revealed something new that justifies changing the answer.
