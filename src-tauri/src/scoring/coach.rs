//! The note and the one line to say instead (prompt 03), and what code does to its output before the user sees it:
//! a rewrite may never carry a number that is not in the transcript or the stories, a fix about fillers or the stop
//! never gets a rewrite, and no em dash gets through.

use crate::metrics::numbers;
use crate::metrics::{Check, Metrics};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Rewrite {
    pub text: String,
    /// "open" for a new first sentence, "replace" for one sentence swapped out.
    pub position: String,
    pub replaces_sentence: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Coach {
    pub note: String,
    pub rewrite: Option<Rewrite>,
    pub offer_follow_up: bool,
}

/// Fixes whose line to say instead is always empty: the note says what to do (`prompts/03-coach-note.md`).
const NO_REWRITE: [&str; 2] = ["clean_stop", "fillers"];

fn no_em_dash(s: &str) -> String {
    s.replace(" \u{2014} ", ", ").replace(" \u{2013} ", ", ").replace(['\u{2014}', '\u{2013}'], ", ")
}

/// "seven-day", "three-step" and "24-hour" are compound adjectives that name a metric, not a claim; "twenty-four" is a
/// number. Compounds are left out of the check so a metric's name cannot make a good rewrite look invented.
fn without_compounds(text: &str) -> String {
    text.split_whitespace()
        .filter(|tok| match tok.split_once('-') {
            Some((_, after)) => numbers::extract(after.trim_matches(|c: char| !c.is_alphanumeric())).first().is_some(),
            None => true,
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// True when every number in `rewrite` also appears in the transcript or the stories (same value, any wording).
pub fn rewrite_is_grounded(rewrite: &str, transcript: &str, stories: &str) -> bool {
    let known: Vec<f64> = numbers::extract(transcript).into_iter().chain(numbers::extract(stories)).map(|n| n.value).collect();
    numbers::extract(&without_compounds(rewrite)).iter().all(|n| known.iter().any(|k| numbers::same(*k, n.value)))
}

/// Cleans up the model's reply. `fix` is None in all-pass mode, where there is never a rewrite.
pub fn finalise(mut coach: Coach, fix: Option<&str>, transcript: &str, stories: &str) -> Coach {
    coach.note = no_em_dash(coach.note.trim());
    if let Some(r) = coach.rewrite.take() {
        let text = no_em_dash(r.text.trim());
        let allowed = fix.is_some_and(|f| !NO_REWRITE.contains(&f)) && rewrite_is_grounded(&text, transcript, stories);
        if allowed {
            coach.rewrite = Some(Rewrite { text, ..r });
        }
    }
    coach
}

fn seconds(ms: u64) -> f64 {
    ms as f64 / 1000.0
}

/// The measurements that matter for one fix, in the wording prompt 03 expects.
pub fn measurements(fix: &str, m: &Metrics, tail_ms: Option<u64>, proof_sentence: Option<usize>, time_to_point_ms: Option<u64>) -> String {
    match fix {
        "time_to_point" | "answer_first" => time_to_point_ms.map(|t| format!("time_to_point={:.1}s (target under 10s)", seconds(t))).unwrap_or_default(),
        "length" => format!("length={:.0}s (window {} to {}s)", seconds(m.speaking_ms), m.window.min_s, m.window.max_s),
        "clean_stop" => match (tail_ms, proof_sentence) {
            (Some(t), Some(s)) => format!("tail={:.0}s after sentence {s}", seconds(t)),
            _ => String::new(),
        },
        "fillers" => {
            let mut counts: Vec<(String, usize)> = Vec::new();
            for f in &m.fillers.items {
                match counts.iter_mut().find(|(t, _)| *t == f.text) {
                    Some(c) => c.1 += 1,
                    None => counts.push((f.text.clone(), 1)),
                }
            }
            counts.sort_by_key(|c| std::cmp::Reverse(c.1));
            format!("fillers: {} in {:.1} min", counts.iter().map(|(t, n)| format!("{t} x{n}")).collect::<Vec<_>>().join(", "), m.speaking_ms as f64 / 60_000.0)
        }
        _ => String::new(),
    }
}

/// What the check found, as text for the coach prompt's `evidence`.
pub fn evidence(check: &Check) -> String {
    let sentences = if check.sentences.is_empty() { String::new() } else { format!(" (sentences {})", check.sentences.iter().map(|s| s.to_string()).collect::<Vec<_>>().join(", ")) };
    format!("{}{}{}", check.id, if check.evidence.is_empty() { "" } else { ": " }, check.evidence) + &sentences
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::{compute, Inputs};
    use crate::speech::words::Word;

    fn coach(rewrite: Option<&str>) -> Coach {
        Coach { note: "Your result came 42 seconds in. Say it first.".into(), rewrite: rewrite.map(|t| Rewrite { text: t.into(), position: "open".into(), replaces_sentence: None }), offer_follow_up: true }
    }

    const TRANSCRIPT: &str = "And activation went up to about 44 percent, which was a big deal for us.";
    const STORIES: &str = "proof_points: activation_7d: 31% -> 44%";

    #[test]
    fn a_rewrite_with_numbers_from_the_transcript_or_the_stories_is_kept() {
        let c = finalise(coach(Some("I moved seven-day activation from 31 to 44 percent.")), Some("answer_first"), TRANSCRIPT, STORIES);
        assert_eq!(c.rewrite.unwrap().text, "I moved seven-day activation from 31 to 44 percent.");
    }

    #[test]
    fn a_rewrite_that_invents_a_number_is_dropped_and_the_note_stays() {
        // Empty bank: 31 appears nowhere in the input (prompts/examples/expected/coach.json, invented_number_trap).
        let c = finalise(coach(Some("I moved activation from 31 to 44 percent.")), Some("answer_first"), TRANSCRIPT, "");
        assert!(c.rewrite.is_none());
        assert!(c.note.starts_with("Your result came"));
        let ok = finalise(coach(Some("I moved activation to 44 percent.")), Some("answer_first"), TRANSCRIPT, "");
        assert!(ok.rewrite.is_some(), "44 was said, so it is fine");
    }

    #[test]
    fn a_compound_like_seven_day_is_a_metric_name_not_a_claim() {
        assert!(rewrite_is_grounded("I moved seven-day activation to 44 percent.", TRANSCRIPT, ""));
        assert!(!rewrite_is_grounded("I moved activation to forty-four percent and cut it by twenty-two.", TRANSCRIPT, ""));
    }

    #[test]
    fn spelled_out_numbers_in_the_rewrite_are_matched_by_value() {
        let c = finalise(coach(Some("Activation went to forty four percent.")), Some("answer_first"), TRANSCRIPT, "");
        assert!(c.rewrite.is_some());
    }

    #[test]
    fn fixes_about_the_stop_and_the_fillers_never_get_a_rewrite() {
        for fix in ["clean_stop", "fillers"] {
            assert!(finalise(coach(Some("Stop after the number.")), Some(fix), TRANSCRIPT, STORIES).rewrite.is_none(), "{fix}");
        }
        assert!(finalise(coach(Some("Anything.")), None, TRANSCRIPT, STORIES).rewrite.is_none(), "all-pass mode has no rewrite");
    }

    #[test]
    fn em_dashes_are_replaced_in_the_note_and_the_rewrite() {
        let mut c = coach(Some("I led with the result \u{2014} 44 percent."));
        c.note = "Open with the result \u{2014} not the backstory.".into();
        let c = finalise(c, Some("answer_first"), TRANSCRIPT, "");
        assert!(!c.note.contains('\u{2014}') && !c.rewrite.unwrap().text.contains('\u{2014}'));
    }

    #[test]
    fn measurements_use_the_wording_the_prompt_expects() {
        let words: Vec<Word> = (0..40).map(|i| Word { text: if i == 3 { "um" } else if i == 9 { "um" } else if i == 15 { "like" } else if i == 39 { "end." } else { "w" }.into(), start_ms: i * 3000, end_ms: i * 3000 + 400 }).collect();
        let m = compute(Inputs { words, stage: "recruiter", question_type: "behavioral", bank: vec![], keep_restart: false });
        assert_eq!(measurements("time_to_point", &m, None, None, Some(31_200)), "time_to_point=31.2s (target under 10s)");
        assert!(measurements("length", &m, None, None, None).starts_with("length=117s (window 45 to 60s)"), "{}", measurements("length", &m, None, None, None));
        assert_eq!(measurements("clean_stop", &m, Some(38_000), Some(9), None), "tail=38s after sentence 9");
        assert!(measurements("fillers", &m, None, None, None).starts_with("fillers: um x2, like x1 in "));
        assert_eq!(measurements("conviction", &m, None, None, None), "");
    }

    #[test]
    fn evidence_names_the_check_and_its_sentences() {
        let c = Check { id: "ownership".into(), passed: Some(false), evidence: "\"we changed the trigger\"".into(), sentences: vec![5] };
        assert_eq!(evidence(&c), "ownership: \"we changed the trigger\" (sentences 5)");
    }
}
