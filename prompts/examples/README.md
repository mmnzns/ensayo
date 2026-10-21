# Example fixtures

A fictional candidate (Dana Ortiz, lifecycle manager at Fernhill, a made-up neobank) answers one
question three ways. These ship in the repo as test data only. They are not Miguel's stories and
contain nothing personal.

Use them for:
- M4 tests: schema validity, `answer_first` strictness, all-pass handling, rewrite-never-invents.
- The run-to-run consistency test: score each answer twice per provider; every criterion result
  must match.
- A smoke test for each new provider or model added to the list.

Files:
- `question.json`: the question and its stored classification.
- `story-bank.json`: one bank story and the method for `problem_solving`.
- `answers/*.json`: indexed transcripts (sentence, start, end, text).
- `expected/*.score.json`: the criterion results prompt 02 must return. Only the fields listed are
  asserted; `quote` and `reason` are free text and not compared.
- `expected/coach.json`: assertions for prompt 03 output (wording is not compared exactly).

How the expected results were set: by hand, from the rubric. If a model disagrees, check the
rubric wording first; a fixture changes only with Miguel's OK.

Three things the fixtures deliberately test:
1. `typical` tells the story in time order and lands the result at sentence 6: `answer_first`
   must fail even though the content is good. This is the most common real failure.
2. `typical` is all "we": `ownership` must fail, but `no_complaining` must pass ("leadership was
   worried about it" is neutral).
3. `bad` ends with "if that makes sense" and opens with an apology: `conviction` fails; it also
   criticises leadership: `no_complaining` fails. The top fix is still `answer_first` because it
   ranks first.

## Added 2026-10-21

- `resume/`: prompt 11 (read resume). `resume.txt` is Dana's fictional resume, including one number that
  differs from her verified story (5 steps vs 3), numbers not in the bank, and a hidden instruction aimed
  at AI tools that must be ignored. `input.json` holds the other inputs; `expected.json` the assertions.
- `questions/`: prompt 10 (question quality and must-say). Three versions of the candidate's questions
  (good, generic, none) against the same Mock; `expected.json` lists what each must return, and the
  must-say result that holds for all three.
