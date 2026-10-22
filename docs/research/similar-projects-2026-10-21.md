# Similar projects (research, 2026-10-21)

Done after planning, to check for prior art. Purpose: ideas and positioning only. **No code from any of these may be copied** (Ensayo is original work built on Talaan only). Facts (stars, last push, license) were checked against GitHub on 2026-10-21.

## Bottom line

The space is crowded with small web mock-interview demos, but nothing does Ensayo's core: a local-first desktop rehearsal loop with one fix, a rewritten first line, and a measured retry. Every close match has 0 to 61 stars.

## Closest projects

| Project | Stars / last push | License | What it is |
|---|---|---|---|
| Interview Chameleon (github.com/Donnexulon/interview-chameleon) | 0 / Sep 2026 | Proprietary | Windows desktop, Ollama, optional offline Whisper; scores must cite transcript evidence |
| interview-practice (github.com/dguywhoknows/interview-practice) | 0 / Oct 2026 | MIT | Web, browser speech, BYOK Groq/OpenRouter, story bank, follow-ups |
| Rhetor (github.com/bell-kevin/rhetor) | 1 / Oct 2026 | AGPL-3.0 | Offline browser app, in-browser Whisper, rule-based delivery notes |
| Lemonade Interviewer (github.com/lemonade-sdk/interviewer) | 11 / Oct 2026 | MIT | Electron, fully local (llama.cpp, Whisper, Kokoro voice) |
| DeepInterview (github.com/ngoanpv/DeepInterview) | 61 / Oct 2026 | Apache-2.0 | Web + Python voice agent, BYOK or local; early |
| PanelPrep (github.com/tanisha-naruka/Panelprep) | 0 / Oct 2026 | None | Local Node + Ollama; browser speech (cloud) |
| Pitch (github.com/apoorvjdeshmukh/pitch) | 0 / Aug 2026 | PolyForm Noncommercial | Text-only, stages, story bank |
| InterviewThread (github.com/weiyu1029/Interview_Thread_AI) | 3 / Sep 2026 | MIT | "No source, no claim" resume vs posting check |
| Interview Coach (github.com/J3rry320/interview-coach) | 6 / Jul 2026 | MIT | CLI + local dashboard, BYOK incl. Ollama |
| StarDrill (github.com/iLanis-agent/stardrill) | 0 / Sep 2026 | None | Timed story segments, coverage map |

Older or larger but inactive: Liftoff (1.5k stars, MIT, cloud, inactive since 2023), IliaLarchenko/Interviewer (126 stars, technical mocks, inactive since Mar 2025).

Live-interview "copilots" (help during real interviews; a different category Ensayo is not in): Natively (3k stars, personal-use license), MeetingCopilot, Open-Cluely, realtime-interview-copilot, NexQ, pikabaka (AGPL).

## What only Ensayo does

- The tight retry loop: one note, a rewritten first sentence, the same question again, and a measured delta ("41s → 6s").
- Time to first point and the tail after the point.
- Cross-stage consistency checks (notice period, pay range, numbers across stages of one application).
- Spoken claims checked against verified story numbers and the resume that was sent.
- Habit graduation (8 of the last 10).
- A native Mac and Windows app with local speech (whisper.cpp, Parakeet), a local interviewer voice, local or BYOK models across many providers, no account.
- Stage-specific spoken questions including leadership and the founder variant.

## Ideas worth considering (ideas only, write our own version)

- **Detect fillers from the audio**, since Whisper drops "um" (Rhetor). Directly relevant to M3's filler check.
- Separate deliberate pauses from mid-thought pauses; flag hedging language; pitch variety (Rhetor).
- An I/we ownership ratio, and the best-matching stories shown beside the question (interview-practice).
- A test suite for the AI judge: strong, weak, contradictory and prompt-injection answers, with repeated-run spread (Interview Chameleon). Overlaps with Ensayo's M4/M5 plan.
- Let the user correct the transcript before it is judged; say plainly that there are no face or emotion judgments (FairScreen).
- Interviewer notes from a pasted bio; "questions to ask" on the cue sheet (Pitch).
- An NDA flag that keeps confidential details out of a story (career).
- An editable filler-word list (PanelPrep).
- Community question-bank packs (DeepInterview).

## Paid products

Yoodli (cloud speech coach, freemium), Big Interview (video curriculum), Final Round AI (mocks plus a live copilot, subscription), Orai (mobile speaking coach, about $10 a month), Huru (video mocks from a job posting, about $25 a month), Exponent/Pramp and interviewing.io (practice with people, tech roles). Poised says it is shutting down on 10/8/2026. Google Interview Warmup reportedly shut down in April 2026 (secondary sources only, not confirmed).

## Licensing

- Copyleft, never copy: Rhetor (AGPL-3.0), pikabaka (AGPL), offerPilot (AGPL), XUZIAa/Multi-Agent-Mock-Interview (GPL-3.0), dkirichev/interviewSimulator (GPL-3.0), dits (CPAL-1.0).
- Not commercial: Pitch (noncommercial), Natively (personal use), Interview Chameleon (proprietary).
- No license (all rights reserved): PanelPrep, StarDrill, FairScreen, Greenroom, adalyn, Open-Cluely.
- MIT/Apache: interview-practice, Lemonade Interviewer, DeepInterview, InterviewThread, Interview Coach, Liftoff, NexQ. Still: ideas only.
