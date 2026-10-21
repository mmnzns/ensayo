# Ensayo question bank (v1 draft)

Private bank for Ensayo. Drafted by Opus for Miguel's review. Copied into the repo at handoff; never shipped as a readable file to users.

## Files

| File | What it is |
| --- | --- |
| `general.json` | 109 questions that work for any professional role in any field. |
| `pack-lifecycle-marketing-ops.json` | 70 questions for lifecycle marketing, CRM, marketing ops, martech and marketing automation roles. Loaded on top of the general set. |
| `schema.json` | JSON Schema (2020-12) for one question file. Validate every bank file against it in CI. |

Each file is one object: `bank_version`, `set_id`, `set_name`, `description`, `questions`. Further role packs follow the same shape as `pack-<role>.json` with their own three-letter id prefix.

## Fields (one question)

| Field | Required | Values |
| --- | --- | --- |
| `id` | yes | Stable id, `gen-001` (general) or `lmo-001` (lifecycle pack). Never reuse or renumber; retire by removing. |
| `text` | yes | Interviewer wording, spoken and short. No em dashes, no framework names. |
| `type` | yes | Prompt 01 enum: `behavioral`, `tell_me_about_yourself`, `technical`, `factual`, `future_looking`, `gap`, `motivation`. Pre-tagged, so prompt 01 is skipped for bank questions. |
| `behavioral_situation` | yes | Prompt 01 enum when `type` is `behavioral`, else `null`. |
| `stages` | yes | Where the question is realistic: `recruiter`, `hiring_manager`, `technical`, `panel`, `leadership`. |
| `modes` | yes | `["drill","mock"]` or one of them. |
| `competencies` | yes | 1 to 3 short tags (prompt 01 style). Used for story matching. |
| `great_eight` | yes | 0 or more of the eight priorities. Used to bias question picks after JD import. |
| `commitment_check` | yes | Prompt 01 flag. |
| `builder_operator_check` | yes | Prompt 01 flag. |
| `difficulty` | yes | `standard` or `hard` (skeptical, high-stakes or easy to ramble on). |
| `follow_up_angles` | yes | 1 to 3 places a real interviewer pushes next. Hints for prompt 04, not scripts; prompt 04 still aims at the weakest part of the actual answer. |
| `founder_variant` | no | `true` = only ask in the leadership stage when the startup flag is on. Omitted = false. |
| `moment` | no | `opener` = ask first in the stage. `candidate_questions` = hands the floor to the candidate; the reply is scored by `question_quality` (prompt 10), not the normal rubric. |
| `notes` | no | For Miguel and Sonnet. Never shown to users. |

## Counts

Percentages are share of questions in that file that list the stage (a question can list several stages).

| Stage | General (109) | Lifecycle pack (70) | Total |
| --- | --- | --- | --- |
| `recruiter` | 29 (27%) | 13 (19%) | 42 |
| `hiring_manager` | 71 (65%) | 30 (43%) | 101 |
| `technical` | 13 (12%) | 49 (70%) | 62 |
| `panel` | 36 (33%) | 8 (11%) | 44 |
| `leadership` | 56 (51%) | 12 (17%) | 68 |

| Type | General (109) | Lifecycle pack (70) | Total |
| --- | --- | --- | --- |
| `behavioral` | 44 (40%) | 10 (14%) | 54 |
| `tell_me_about_yourself` | 12 (11%) | 2 (3%) | 14 |
| `technical` | 11 (10%) | 38 (54%) | 49 |
| `factual` | 11 (10%) | 3 (4%) | 14 |
| `future_looking` | 8 (7%) | 5 (7%) | 13 |
| `gap` | 5 (5%) | 10 (14%) | 15 |
| `motivation` | 18 (17%) | 2 (3%) | 20 |

| Behavioral situation | General (109) | Lifecycle pack (70) | Total |
| --- | --- | --- | --- |
| `problem_solving` | 10 (9%) | 4 (6%) | 14 |
| `disagreement` | 6 (6%) | 1 (1%) | 7 |
| `influence` | 5 (5%) | 1 (1%) | 6 |
| `serving_customers` | 5 (5%) | 1 (1%) | 6 |
| `leading_team` | 6 (6%) | 1 (1%) | 7 |
| `motivation` | 5 (5%) | 0 (0%) | 5 |
| `other` | 7 (6%) | 2 (3%) | 9 |

| Flag | General | Lifecycle pack |
| --- | --- | --- |
| `commitment_check` | 6 | 0 |
| `builder_operator_check` | 5 | 2 |
| `founder_variant` | 10 | 1 |
| `moment: opener` | 1 | 0 |
| `moment: candidate_questions` | 3 | 1 |
| `difficulty: hard` | 26 | 16 |
| `mock only` | 1 | 0 |

Checks the general set meets: every non-technical stage at 15% or more; behavioral 40% (30% across both files); every behavioral situation at least 5 times.

## How code should use it

- **Practising without an application:** filter by the chosen stage, then mix types roughly as a real stage would (recruiter heavy on `factual` and `motivation`; technical heavy on `technical`).
- **Founder variant:** leadership stage with the startup flag opens with the `moment: opener` commitment question, then includes at least one `builder_operator_check` question. `founder_variant` questions are skipped otherwise.
- **End of a Mock:** pick one `moment: candidate_questions` prompt for the stage.
- **Trap regression:** `lmo-001` to `lmo-003` use "behavioral" in the lifecycle sense and are typed `technical`. Use them as fixtures for the prompt 01 trap test.

## Intentionally missing

- Anything about Miguel: no employers, numbers or stories. His specifics belong in the Story Bank, not the bank.
- Copied lists. Coverage follows the principles in his Interview Guidelines and Failure Learnings, worded fresh.
- Model answers, scripts and method wording. The app scores against the user's own stories.
- Illegal or discriminatory screening questions (age, family, health, religion). Work authorization is included only as the plain yes/no recruiters ask.
- Case-interview prompts, take-home briefs and presentation prompts (Guidelines Section 13). Different format; later pack.
- Compensation negotiation beyond the range question (Section 15 says never by email; it needs its own drill design).
- Other role packs. Testers in other fields get the general set only until packs exist.

## For Miguel to review

1. **Candidate's-own-questions prompts are typed `motivation`.** No enum type fits. I added the optional `moment` field so code routes them to `question_quality`. Alternative: add a `candidate_questions` type to prompt 01 (a prompt change, so your call).
2. **Two optional fields added:** `founder_variant` and `moment`. Not in the brief's field list, but code needs both to run the founder opener and the closing moment. Drop them if you'd rather derive this from tags.
3. **Builder vs operator questions are typed `tell_me_about_yourself`.** They ask for self-description, then the rubric wants an operator example. `behavioral` would also be defensible.
4. **"Greatest weakness" and "biggest strength" are typed `tell_me_about_yourself`.** No self-assessment type exists.
5. **"How do you decide what to work on first" and similar method questions are typed `technical`,** following prompt 01 ("how the candidate works"). They are not past-example questions, so method-first scoring does not apply.
6. **Founder follow-ups lean skeptical** ("and if I still said no"). Check they feel like a real founder, not a hostile one.
7. **Tool gap list:** Marketo, Salesforce Marketing Cloud, Braze, Iterable, HubSpot, Segment, SQL, SMS and push, B2B lifecycle, platform migration. Braze is phrased as a gap question for testers; for you it is not a gap. Prompt 11 and your profile should keep it from being scored as one.
8. **"You've moved around a fair bit"** carries `commitment_check: true` in a recruiter stage. Keep it or move it to leadership only.
9. **Difficulty is my read,** not tested. Expect to retune after your first sessions.
