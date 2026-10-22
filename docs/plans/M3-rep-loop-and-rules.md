# M3 Rep Loop and Rules Metrics Implementation Plan

**Goal:** In the app, a rep runs end to end: question, record, transcribe with word times, rules metrics, a result with one fix and Again with a delta, Listen, "that note was wrong" written to `eval/`. Every rule has tests.

**Architecture:** A pure `metrics` module in Rust (sentences, numbers, fillers, pace, pauses, length window, tail, time to point, restart, hallucination strip) turns a word list into `Metrics`. A `reps` storage module saves sessions and reps in the data folder and labels. Commands record, transcribe and measure. On the frontend a `repLoop` module holds the current question, attempts and the result, with a mock fallback in the browser, and the practice screens read it. No AI in M3: the one fix is picked by code from the rules that can fail without a model (`proof`, `clean_stop`, `length`, `fillers`), in the order in `prompts/README.md`.

**Tech Stack:** Rust (serde, chrono), Tauri commands, React.

**Source of truth:** Build Plan "Scoring", "The rep loop", "Scenarios and edge cases: Audio and transcription", "Stages", M3.

## Decisions made while planning

1. **Rules-only fix.** Criteria 1, 5, 6, 8, 10, 11 and Method first need the AI (M4). Until then the fix comes from `proof`, `clean_stop`, `length`, `fillers`. Time to point needs the sentence that answers the question (AI), so M3 reports the time of sentence 1 as "first sentence ends at" only on Details and never fails it.
2. **Windows (seconds)** by stage: recruiter 45 to 60, hiring manager 60 to 90, leadership 30 to 60, panel 60 to 90, technical up to 180; factual 20, tell me about yourself capped at 90. Placeholders per the Build Plan.
3. **Fillers:** `um, uh, er, erm, ah, hmm, like, you know, basically, i mean, how do i say`. "like" is skipped after comparing words (`would, feel, look, looks, sound, sounds, something, much, more, anything, just`) and before "to". The list lives in one constant so M5 can tune it.
4. **Tail (clean stop):** time from the end of the last sentence that contains a number from the matched story (or, with no bank, the last number said) to the end of the answer. Pass under 15 s (placeholder).
5. **Numbers** are normalised from digits and words ("twenty-four percent", "2.5 million", "40k"). Approximations ("about a quarter") are left to the AI.
6. **Audio** is machine-local: `<app local>/audio/<session>/<rep>.wav`. Transcript and metrics go to the data folder: `sessions/<session>/session.json` and `sessions/<session>/reps/<n>/{transcript,metrics}.json`. "That note was wrong" writes `eval/<session>-<n>.json` (a copy of the rep with the label).
7. **Hard cap 4 minutes**, under 3 seconds of speech is "didn't catch that" and is not scored, a restart phrase offers to discard.

## Tasks

1. Rust `metrics`: sentences, numbers, fillers, pace and pauses, window, tail, restart and hallucination strip, `compute()` (tests first, one commit per rule group).
2. Rust `storage/reps.rs`: session and rep files, eval label, delete rep, retention sweep (tests first).
3. Commands: record and stop with cap and discard, `measure_rep`, `save_rep`, `label_rep_wrong`, `rep_audio`, `sweep_audio`; register.
4. Frontend `repLoop`: question picker from `questions/`, attempts and delta (pure, tests first), rules-only fix and note text (pure, tests first).
5. Wire the practice screens (ask, record, think, result, again) with the mock fallback; Listen; "that note was wrong".
6. Verify: cargo and npm tests, build, launch with a scratch folder; record a Build Log entry; push.
