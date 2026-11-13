# Ensayo question bank (v1)

Private bank for Ensayo. Drafted by Opus and reviewed by Miguel. Copied into the repo at handoff; never shipped as a readable file to users.

## Files

| File | What it is |
| --- | --- |
| `general.json` | 121 questions that work for any professional role in any field. |
| `pack-lifecycle-marketing-ops.json` | 73 questions for lifecycle marketing, CRM, marketing ops, martech and marketing automation roles. Loaded on top of the general set. |
| `pack-growth.json` | 70 questions for growth marketing: acquisition, demand gen, experimentation, paid and organic channels, funnel and unit economics, product-led growth. Loaded on top of the general set. Approved 2026-11-13. |
| `pack-product-marketing.json` | 70 questions for product marketing: positioning and messaging, launches, competitive intelligence, sales enablement, pricing and packaging input, customer and market research, go to market. Loaded on top of the general set. Approved 2026-11-13. |
| `pack-gtm-revops.json` | 70 questions for GTM engineering, revenue operations and sales operations roles: lead routing, CRM data, pipeline and forecasting, attribution, systems integration, outbound tooling and automation. Loaded on top of the general set (set id `gtm-revops`). Added 2026-11-13. |
| `schema.json` | JSON Schema (2020-12) for one question file. Validate every bank file against it in CI. |

Each file is one object: `bank_version`, `set_id`, `set_name`, `description`, `questions`. Further role packs follow the same shape as `pack-<role>.json` with their own three-letter id prefix.

## Fields (one question)

| Field | Required | Values |
| --- | --- | --- |
| `id` | yes | Stable id, `gen-001` (general), `lmo-001` (lifecycle pack), `gro-001` (growth pack), `pmm-001` (product marketing pack) or `gtm-001` (GTM and revenue ops pack). Never reuse or renumber; retire by removing. |
| `text` | yes | Interviewer wording, spoken and short. No em dashes, no framework names. |
| `type` | yes | Prompt 01 enum: `behavioral`, `tell_me_about_yourself`, `technical`, `factual`, `future_looking`, `gap`, `motivation`, `self_assessment`. Pre-tagged, so prompt 01 is skipped for bank questions. |
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

A target only ever gets the general set plus one pack, so totals are given for general plus each pack, not for all files.

| Stage | General (121) | Lifecycle pack (73) | Growth pack (70) | Product marketing pack (70) | GTM pack (70) |
| --- | --- | --- | --- | --- | --- |
| `recruiter` | 34 (28%) | 16 (22%) | 12 (17%) | 11 (16%) | 15 (21%) |
| `hiring_manager` | 83 (69%) | 30 (41%) | 28 (40%) | 31 (44%) | 31 (44%) |
| `technical` | 15 (12%) | 52 (71%) | 48 (69%) | 47 (67%) | 48 (69%) |
| `panel` | 39 (32%) | 8 (11%) | 9 (13%) | 10 (14%) | 6 (9%) |
| `leadership` | 61 (50%) | 12 (16%) | 13 (19%) | 15 (21%) | 15 (21%) |

| Type | General (121) | Lifecycle pack (73) | Growth pack (70) | Product marketing pack (70) | GTM pack (70) |
| --- | --- | --- | --- | --- | --- |
| `behavioral` | 46 (38%) | 10 (14%) | 10 (14%) | 10 (14%) | 10 (14%) |
| `tell_me_about_yourself` | 4 (3%) | 1 (1%) | 1 (1%) | 1 (1%) | 1 (1%) |
| `self_assessment` | 10 (8%) | 1 (1%) | 1 (1%) | 1 (1%) | 1 (1%) |
| `technical` | 13 (11%) | 38 (52%) | 38 (54%) | 38 (54%) | 38 (54%) |
| `factual` | 11 (9%) | 3 (4%) | 3 (4%) | 3 (4%) | 3 (4%) |
| `future_looking` | 8 (7%) | 5 (7%) | 5 (7%) | 5 (7%) | 5 (7%) |
| `gap` | 7 (6%) | 13 (18%) | 10 (14%) | 10 (14%) | 10 (14%) |
| `motivation` | 22 (18%) | 2 (3%) | 2 (3%) | 2 (3%) | 2 (3%) |

| Behavioral situation | General (121) | Lifecycle pack (73) | Growth pack (70) | Product marketing pack (70) | GTM pack (70) |
| --- | --- | --- | --- | --- | --- |
| `problem_solving` | 11 (9%) | 4 (5%) | 4 (6%) | 4 (6%) | 4 (6%) |
| `disagreement` | 6 (5%) | 1 (1%) | 1 (1%) | 1 (1%) | 1 (1%) |
| `influence` | 5 (4%) | 1 (1%) | 1 (1%) | 1 (1%) | 1 (1%) |
| `serving_customers` | 5 (4%) | 1 (1%) | 1 (1%) | 1 (1%) | 1 (1%) |
| `leading_team` | 6 (5%) | 1 (1%) | 1 (1%) | 1 (1%) | 1 (1%) |
| `motivation` | 5 (4%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) |
| `other` | 8 (7%) | 2 (3%) | 2 (3%) | 2 (3%) | 2 (3%) |

| Flag | General | Lifecycle pack | Growth pack | Product marketing pack | GTM pack |
| --- | --- | --- | --- | --- | --- |
| `commitment_check` | 7 | 0 | 0 | 0 | 0 |
| `builder_operator_check` | 5 | 2 | 2 | 2 | 2 |
| `founder_variant` | 10 | 1 | 1 | 1 | 1 |
| `moment: opener` | 1 | 0 | 0 | 0 | 0 |
| `moment: candidate_questions` | 3 | 1 | 1 | 1 | 1 |
| `difficulty: hard` | 30 | 16 | 16 | 16 | 16 |
| `mock only` | 1 | 0 | 0 | 0 | 0 |

Checks the general set meets: every non-technical stage at 15% or more; behavioral 38% (29% across the general set plus any one pack); every behavioral situation at least 5 times. The growth, product marketing and GTM packs copy the lifecycle pack's mix of types, situations and flags one for one (the lifecycle pack has three extra gap questions, `lmo-071` to `lmo-073`).

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
- Other role packs. Testers outside lifecycle, marketing ops, growth, product marketing and GTM and revenue ops get the general set only until packs exist.

## Decisions (2026-11-13)

Miguel's verdicts on the nine open calls from the first draft:

1. Candidate's-own-questions prompts stay typed `motivation`, routed by the `moment` field: keep.
2. The optional `founder_variant` and `moment` fields: keep.
3. Builder vs operator questions are now typed `self_assessment` (was `tell_me_about_yourself`).
4. "Greatest weakness" and "biggest strength" are now typed `self_assessment` (was `tell_me_about_yourself`). The new type is added to the prompt 01 enum and judged by its own `type_fit` rule in rubric version 2.
5. Method questions ("how do you decide what to work on first") stay typed `technical`: keep.
6. Founder follow-ups stay as written: keep.
7. The tool gap list stays. A gap question answered "yes with proof" (yes first, then how long, then one result) scores as a pass under rubric version 2.
8. "You've moved around a fair bit" keeps `commitment_check: true` in a recruiter stage: keep.
9. Difficulty stays as drafted until real sessions show what to retune.

The growth and product marketing packs are approved. A GTM and revenue ops pack (`pack-gtm-revops.json`) was added, so a GTM target no longer shares the lifecycle pack. Twelve general questions (`gen-110` to `gen-121`, two of them `self_assessment`) and three lifecycle gap questions (`lmo-071` to `lmo-073`) were added at the same time.
