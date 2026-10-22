//! The text blocks the prompts take, in the formats `prompts/02-score-answer.md` shows ("Input formats code must
//! produce"). Everything here is user content, so callers wrap it in `<data>` tags through `escape_data`.

use crate::metrics::Metrics;
use crate::storage::model::Story;

/// One sentence per line: `[3] (12.4s to 17.9s) The result was...`. Times run from the first word, so the model sees
/// the clock the user sees. The model refers to sentences by number only; code turns numbers into times.
pub fn transcript_text(m: &Metrics) -> String {
    let t0 = m.words.first().map(|w| w.start_ms).unwrap_or(0);
    let secs = |ms: u64| format!("{:.1}s", ms.saturating_sub(t0) as f64 / 1000.0);
    m.sentences.iter().map(|s| format!("[{}] ({} to {}) {}", s.index, secs(s.start_ms), secs(s.end_ms), s.text)).collect::<Vec<_>>().join("\n")
}

/// The first answer as the follow-up scorer reads it: sentences numbered `[A n]` so they cannot be confused with the
/// follow-up answer's own `[n]`.
pub fn transcript_text_first(m: &Metrics) -> String {
    transcript_text(m).lines().map(|l| l.replacen('[', "[A ", 1)).collect::<Vec<_>>().join("\n")
}

/// Up to three stories, most relevant first (the caller has already picked them).
pub fn stories_text(stories: &[Story]) -> String {
    stories
        .iter()
        .map(|s| {
            let points = s
                .proof_points
                .iter()
                .map(|p| {
                    let unit = p.unit.trim();
                    let value = if p.before.trim().is_empty() { format!("{}{}", p.after, if unit == "%" { "%" } else { "" }) } else { format!("{}{} -> {}{}", p.before, if unit == "%" { "%" } else { "" }, p.after, if unit == "%" { "%" } else { "" }) };
                    let unit_word = if unit.is_empty() || unit == "%" { String::new() } else { format!(" {unit}") };
                    format!("{}: {}{}", p.label, value, unit_word)
                })
                .collect::<Vec<_>>()
                .join("; ");
            format!(
                "id: {}\ntitle: {}\ncontext: {}\napproach: {}\naction: {}\nresult: {}\nproof_points: {}",
                s.id,
                s.title,
                s.context.trim(),
                s.approach.trim(),
                s.action.trim(),
                s.result.trim(),
                if points.is_empty() { "none" } else { &points }
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::{compute, Inputs};
    use crate::speech::words::Word;
    use crate::storage::model::{ProofPoint, Usage};

    fn story() -> Story {
        Story {
            id: "st_onboarding".into(),
            title: "Onboarding drop-off".into(),
            employer: "Fernhill".into(),
            best_for: vec![],
            direct_answer: "".into(),
            context: "Activation was flat.".into(),
            approach: "I traced the funnel.".into(),
            action: "I rebuilt the trigger.".into(),
            ownership: "".into(),
            result: "31 to 44.".into(),
            proof_points: vec![
                ProofPoint { label: "activation_7d".into(), metric: "".into(), before: "31".into(), after: "44".into(), unit: "%".into(), approximate: false, verified: true },
                ProofPoint { label: "bank_link_steps".into(), metric: "".into(), before: "3".into(), after: "1".into(), unit: "steps".into(), approximate: false, verified: true },
                ProofPoint { label: "users".into(), metric: "".into(), before: "".into(), after: "40".into(), unit: "k".into(), approximate: false, verified: false },
            ],
            scale: "".into(),
            competencies: vec![],
            great_eight: vec![],
            branches: vec![],
            verified: true,
            headline: "".into(),
            usage: Usage::default(),
            year: None,
            angles: vec![],
        }
    }

    #[test]
    fn the_transcript_is_one_numbered_sentence_per_line_on_the_users_clock() {
        let words: Vec<Word> = "I moved it. Then it grew."
            .split(' ')
            .enumerate()
            .map(|(i, t)| Word { text: t.into(), start_ms: 5_000 + i as u64 * 1_000, end_ms: 5_000 + i as u64 * 1_000 + 800 })
            .collect();
        let m = compute(Inputs { words, stage: "recruiter", question_type: "behavioral", bank: vec![], keep_restart: false });
        assert_eq!(transcript_text(&m), "[1] (0.0s to 2.8s) I moved it.\n[2] (3.0s to 5.8s) Then it grew.");
    }

    #[test]
    fn a_story_is_written_in_the_prompt_format_with_its_proof_points() {
        let t = stories_text(&[story()]);
        assert!(t.starts_with("id: st_onboarding\ntitle: Onboarding drop-off\ncontext: Activation was flat."));
        assert!(t.contains("proof_points: activation_7d: 31% -> 44%; bank_link_steps: 3 -> 1 steps; users: 40 k"), "{t}");
    }

    #[test]
    fn no_stories_is_an_empty_block_and_a_story_without_numbers_says_none() {
        assert_eq!(stories_text(&[]), "");
        let mut s = story();
        s.proof_points.clear();
        assert!(stories_text(&[s]).ends_with("proof_points: none"));
    }
}
