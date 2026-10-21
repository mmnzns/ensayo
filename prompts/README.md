# Ensayo prompts (rubric v1)

Drafted by Opus before the build starts. Sonnet implements these as written and does not
redesign them. Any change to a prompt, the rubric or a threshold goes to Miguel (and Opus) first.

Source of the rubric: the Build Plan in Notion ("Interview Practice App v0 Build Plan"),
which draws on Miguel's Interview Guidelines and Interview Failure Learnings. The prompts are
written for any user in any field: nothing personal to Miguel is inside them.

## Files

| File | Task | Model tier | Called |
| --- | --- | --- | --- |
| `rubric-v1.md` | Criteria definitions shared by every scoring prompt | n/a | Inserted into prompts 02 and 05 as `{{rubric}}` |
| `01-classify-question.md` | Question type, behavioral situation, founder-style flags | fast | When a question has no stored type |
| `02-score-answer.md` | Judge every AI criterion with quoted evidence | fast | After every answer |
| `03-coach-note.md` | Write the one note and the rewritten first sentence | strong | After scoring, once code has picked the top fix |
| `04-generate-follow-up.md` | The interviewer's next question | fast | After scoring, when a follow-up is due |
| `05-score-follow-up.md` | F1 to F5 | fast | After a follow-up answer |
| `06-answer-clarification.md` | Interviewer replies to a clarifying question | fast | When prompt 02 flags a clarifying question |
| `07-extract-claims.md` | Claims log entries and cross-stage conflicts (C1) | fast | After every scored answer inside an application |
| `08-parse-story.md` | Raw story text to CAAR fields | fast | Story Bank paste and parse |
| `09-analyse-jd.md` | JD to priorities, beliefs, question set, story map | strong | JD import |
| `10-question-quality.md` | The candidate's own questions (question_quality) and which must-say items were said out loud | fast | End of a Mock; Drill on demand |
| `11-read-resume.md` | Submitted resume to stage-zero claims, bank check, must-say list, story suggestions | strong | Once when a resume is attached to an application |
| `schemas/*.schema.json` | JSON Schema (2020-12) for each output | n/a | Validate every response |
| `examples/` | Fictional candidate, one question, three answers, expected outputs | n/a | Tests and the M4 consistency check |

## Conventions (apply to every prompt)

1. **Template syntax.** `{{name}}` is replaced by code before sending. `{{#if name}} ... {{/if}}`
   blocks are dropped when the value is empty. No other logic in templates.
2. **System and user parts.** Each file has a `## System` and a `## User` section. Send them as
   the system prompt and the first user message. Providers without a system role get them joined
   with a blank line.
3. **Data is never instructions.** Everything the user typed or pasted (JDs, stories, transcripts,
   profile fields) is wrapped as `<data name="...">...</data>`. Every system prompt says so. Code
   must escape any `</data>` inside the content before wrapping.
4. **Transcripts are sentence-indexed.** Code splits the transcript into sentences and sends:
   `[3] (12.4s to 17.9s) The result was...`. The model refers to sentences by index only and never
   computes times. Code turns indices into timestamps.
5. **JSON only.** Every response is one JSON object matching its schema. Ask the provider for JSON
   mode or structured output where it exists. Strip code fences and `<think>` blocks before parsing
   (Talaan lesson). Invalid JSON: retry once with the validation error appended; then fall back to
   rules-only for that rep with a visible notice.
6. **Pass or fail with evidence, never a score out of 10.** Consistency comes from this, not from
   temperature. Use temperature 0 only where the model accepts it (per-model settings from the
   model list).
7. **Rules do what rules can.** Duration, words per minute, filler rate, time to first point and
   tail length are computed in code from the sentence indices the model returns. The model is never
   asked to count or time.
8. **Wording the user sees** (notes, rewrites, follow-up questions, interviewer replies): plain
   spoken English, short sentences, no em dashes, no consultant phrasing, no framework acronyms
   (STAR, PREP, CAAR are never named to the user), no praise padding.
9. **Versioning.** Each prompt has `version` in its front matter. Every stored score records
   `rubric_version` and the prompt versions used. Changing a prompt bumps its version; changing a
   criterion bumps the rubric version.

## What code does between prompts (not a prompt)

- **Top fix selection.** Code picks the failed criterion with the highest priority, in this order:
  `answer_first` > `no_complaining` > `c1_consistent` > `f1_answer_push` > `proof` >
  `f3_consistent` > `method_first` > `approach_before_action` > `context_short` > `clean_stop` >
  `time_to_point` / `length` > `conviction` > `ownership` > `fillers` > everything else.
  Founder variant (leadership stage, startup): `no_complaining` > `commitment` > `builder_operator`
  > `answer_first` > the rest in the order above.
  `type_fit` sits right after `proof`.
  Then calls prompt 03 with that criterion. If nothing failed, prompt 03 runs in `all_pass` mode.
- **Rules override the model where both judge.** For `clean_stop`, `time_to_point`, `length` and
  `fillers`, code's measurement decides the result. The model's verdict for `clean_stop` is kept
  in the log only.
- **Restart.** When prompt 02 returns `restart_at_sentence`, offer "Start this rep again?" (discard
  and re-record). If the user keeps it, compute `time_to_point`, `length`, `fillers` and tail from
  the restart sentence's start time.
- **`rubric_version`.** Prompts 02 and 05 are told to output it; code overwrites it with the
  current value after parsing anyway.
- **Story selection.** Up to three stories per question, by matching competencies, situation and
  `best_for`; no AI ranking call in v0.
- **`c1_consistent`.** Built from prompt 07's `conflicts`: fail if any, evidence = the conflict's
  sentence and both values.
- **Session flags.** Same story used for a third question in a session; third clarifying question
  in a session. Shown once at the end of the session, not after each rep.
- **Rewrite check.** Every number in `rewrite.text` must appear in the transcript or the
  bank stories sent. Otherwise drop the rewrite and show the note only.
- **Number check.** Code normalises numbers ("twenty-four percent" to 24 %) and compares them with
  the bank. The model's `numbers_said` is the fallback for paraphrases ("about a quarter").
