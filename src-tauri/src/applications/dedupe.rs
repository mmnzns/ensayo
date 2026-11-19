//! Is one practice question the same question as another, asked in other words? The posting read returns interview
//! questions and gap questions separately and they overlap; this is the one rule that tells. The same rule is in
//! `src/practice/questions.ts` (`nearDuplicate`) for the session list, so keep the two in step.
//!
//! The rule, in order:
//! 1. Both ask about the right to work (entitled, authorized, visa, sponsorship...): same question.
//! 2. Both ask for the career history (walk through your background, map your roles and years): same question.
//! 3. Otherwise compare the content words (lowercase, no punctuation, no stop words, cut to five letters so
//!    "reports" and "reporting" meet). Words a question capitalises mid-sentence (a tool or product: Aurora, CRM) are
//!    its topic.
//!    - Sharing a topic word: the rest of the words must also agree, with at least two in common and at least half of
//!      the shorter question's remaining words. Two questions about one tool but about different things stay apart.
//!    - No shared topic word: at least 0.6 of the shorter question's words are shared. Below that, two questions
//!      commonly share a word or two ("process", "customer") without asking the same thing; at 0.6 and above, nearly
//!      every sample paraphrase of one question was caught, with none of the distinct pairs tried.

use std::collections::HashSet;

const STOP: &[&str] = &[
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "by", "can", "could", "did", "do", "does", "for", "from", "give", "has", "have", "how", "i", "if", "in", "into", "is", "it", "its", "me", "my", "of", "on", "or", "our", "please",
    "so", "tell", "that", "the", "their", "them", "there", "they", "this", "through", "to", "us", "walk", "was", "we", "were", "what", "when", "where", "which", "who", "why", "will", "with", "would", "you", "your", "about", "describe",
    "example", "experience", "time", "work", "team", "any", "all", "not", "but", "than", "then", "also", "most", "more", "some", "other", "just", "ever", "talk", "share", "explain", "like", "used", "using", "role", "job",
];

const WORK_RIGHT: &[&str] = &["entitled to work", "authorized to work", "authorised to work", "eligible to work", "legally able to work", "right to work", "work authorization", "work authorisation", "work permit", "visa", "sponsorship", "citizen", "permanent resident"];

const HISTORY: &[&str] = &[
    "career history", "career path", "career journey", "work history", "employment history", "your background", "your resume", "your cv", "your roles", "your timeline", "roles and years", "roles and dates", "through your career", "through your background", "through your resume",
    "through your cv", "through your work history", "through your experience",
];

fn mentions(text: &str, phrases: &[&str]) -> bool {
    let t = text.to_lowercase();
    phrases.iter().any(|p| if *p == "visa" { t.split(|c: char| !c.is_alphanumeric()).any(|w| w == "visa") } else { t.contains(p) })
}

fn stem(w: &str) -> String {
    w.chars().take(5).collect()
}

/// (content words, topic words), both stemmed.
fn words(text: &str) -> (HashSet<String>, HashSet<String>) {
    let mut all = HashSet::new();
    let mut topic = HashSet::new();
    let mut sentence_start = true;
    for raw in text.split_whitespace() {
        let ends = raw.ends_with(['.', '?', '!']);
        let w: String = raw.trim_matches(|c: char| !c.is_alphanumeric()).to_string();
        let capitalised = w.chars().next().is_some_and(|c| c.is_uppercase());
        // "Customer.io" and "Power BI" split on punctuation into several words; each one counts.
        for part in w.split(|c: char| !c.is_alphanumeric()).filter(|p| !p.is_empty()) {
            let lower = part.to_lowercase();
            if lower.chars().count() < 3 || STOP.contains(&lower.as_str()) {
                continue;
            }
            let s = stem(&lower);
            if capitalised && !sentence_start && part != "I" {
                topic.insert(s.clone());
            }
            all.insert(s);
        }
        sentence_start = ends;
    }
    (all, topic)
}

/// True when `a` and `b` ask for the same thing.
pub fn near_duplicate(a: &str, b: &str) -> bool {
    if mentions(a, WORK_RIGHT) && mentions(b, WORK_RIGHT) {
        return true;
    }
    if mentions(a, HISTORY) && mentions(b, HISTORY) {
        return true;
    }
    let ((wa, ta), (wb, tb)) = (words(a), words(b));
    if wa.is_empty() || wb.is_empty() {
        return false;
    }
    let topics: HashSet<&String> = ta.iter().chain(tb.iter()).filter(|t| wa.contains(*t) && wb.contains(*t)).collect();
    if !topics.is_empty() {
        let ra: HashSet<&String> = wa.iter().filter(|w| !topics.contains(w)).collect();
        let rb: HashSet<&String> = wb.iter().filter(|w| !topics.contains(w)).collect();
        let shared = ra.intersection(&rb).count();
        return shared >= 2 && shared as f64 / ra.len().min(rb.len()) as f64 >= 0.5;
    }
    wa.intersection(&wb).count() as f64 / wa.len().min(wb.len()) as f64 >= 0.6
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_right_to_work_asked_twice_in_other_words_is_one_question() {
        assert!(near_duplicate("Are you legally entitled to work in Canada, and when could you start?", "Do you need a visa or sponsorship to take this role?"));
        assert!(near_duplicate("Are you authorized to work in the country without sponsorship?", "Are you entitled to work here?"));
        assert!(!near_duplicate("When could you start if we made an offer?", "Are you entitled to work here?"));
    }

    #[test]
    fn the_career_history_asked_twice_is_one_question() {
        assert!(near_duplicate("Walk me through your background and how you got here.", "Map your roles and years so I can see the timeline."));
        assert!(!near_duplicate("Walk me through your background.", "How many years of SQL experience do you have?"));
    }

    #[test]
    fn the_same_tool_and_the_same_subject_is_one_question() {
        assert!(near_duplicate("How have you built reports and dashboards in Aurora CRM for a revenue team?", "Tell me about your experience creating reports and dashboards in Aurora CRM."));
        assert!(near_duplicate("How do you set up reports in Aurora CRM?", "Have you set up reporting in Aurora CRM?"), "reports and reporting meet");
    }

    #[test]
    fn two_questions_about_one_tool_but_different_things_stay_apart() {
        assert!(!near_duplicate("How do you build reports in Aurora CRM?", "How do you keep data clean and avoid duplicate records in Aurora CRM?"));
    }

    #[test]
    fn the_boundary_without_a_shared_topic_is_six_tenths_of_the_shorter_question() {
        // shorter question has five content words: forecast, pipeline, coverage, quarterly, planning
        let base = "Describe forecast pipeline coverage quarterly planning";
        assert!(near_duplicate(base, "forecast pipeline coverage drives budget decisions"), "three of five is kept as the same question");
        assert!(!near_duplicate(base, "forecast pipeline hygiene drives budget decisions"), "two of five is not");
    }

    #[test]
    fn nothing_to_compare_is_not_a_duplicate() {
        assert!(!near_duplicate("", "Why this company?"));
    }
}
