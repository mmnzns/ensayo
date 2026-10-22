//! The question bank (`questions/*.json`, embedded like the prompts) as the backend uses it: generic questions per
//! stage when no engine read the posting. The frontend loads the same files for its own picking (`src/practice/questions.ts`).

use crate::storage::model::Story;
use serde::Deserialize;
use std::collections::HashSet;
use std::sync::OnceLock;

#[derive(Debug, Clone, Deserialize)]
pub struct BankQuestion {
    pub id: String,
    pub text: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub behavioral_situation: Option<String>,
    pub stages: Vec<String>,
    #[serde(default)]
    pub modes: Vec<String>,
    #[serde(default)]
    pub competencies: Vec<String>,
    #[serde(default)]
    pub great_eight: Vec<String>,
    #[serde(default)]
    pub commitment_check: bool,
    #[serde(default)]
    pub builder_operator_check: bool,
    #[serde(default)]
    pub difficulty: String,
    #[serde(default)]
    pub founder_variant: Option<bool>,
    /// `opener` or `candidate_questions`: asked at a particular moment, never part of a stage's question list.
    #[serde(default)]
    pub moment: Option<String>,
}

#[derive(Deserialize)]
struct File {
    questions: Vec<BankQuestion>,
}

fn load(text: &str) -> Vec<BankQuestion> {
    serde_json::from_str::<File>(text).unwrap_or_else(|e| panic!("question bank: {e}")).questions
}

fn general() -> &'static Vec<BankQuestion> {
    static G: OnceLock<Vec<BankQuestion>> = OnceLock::new();
    G.get_or_init(|| load(include_str!("../../../questions/general.json")))
}

fn lifecycle_pack() -> &'static Vec<BankQuestion> {
    static P: OnceLock<Vec<BankQuestion>> = OnceLock::new();
    P.get_or_init(|| load(include_str!("../../../questions/pack-lifecycle-marketing-ops.json")))
}

/// The general set, plus the role pack that fits the target role (the same rule as `banksFor` in the frontend).
pub fn banks_for(target_role: &str) -> Vec<&'static BankQuestion> {
    let role = target_role.to_lowercase();
    let pack = ["lifecycle", "crm", "marketing", "martech", "automation", "growth"].iter().any(|k| role.contains(k));
    general().iter().chain(if pack { lifecycle_pack().iter() } else { [].iter() }).collect()
}

fn words(s: &str) -> Vec<String> {
    s.to_lowercase().split(|c: char| !c.is_ascii_alphanumeric()).filter(|w| w.len() > 3).map(String::from).collect()
}

/// How well a story fits a question by shared competencies and theme words (the same rule as `storyFit` in the frontend).
pub fn story_fit(q: &BankQuestion, s: &Story) -> u32 {
    let comp: Vec<String> = s.competencies.iter().map(|c| c.to_lowercase()).collect();
    let shared = q.competencies.iter().filter(|c| comp.contains(&c.to_lowercase())).count() as u32;
    let themes: HashSet<String> = s.best_for.iter().flat_map(|b| words(b)).collect();
    let mut wanted: Vec<String> = words(&q.text);
    wanted.extend(q.competencies.iter().flat_map(|c| words(c)));
    wanted.sort();
    wanted.dedup();
    let overlap = wanted.iter().filter(|w| themes.contains(*w)).count() as u32;
    shared * 3 + overlap
}

fn eligible(q: &BankQuestion, stage: &str, startup: bool) -> bool {
    q.moment.is_none() && q.stages.iter().any(|s| s == stage) && (q.founder_variant != Some(true) || (startup && stage == "leadership"))
}

/// Up to `take` questions for one stage, best first, none already in `used` (which is updated). Fixed rules, no
/// randomness: a recruiter stage starts with a logistics question; a leadership stage at a startup starts with a
/// commitment question and a builder or operator question; the rest go by how many of the posting's priorities a
/// question touches, preferring a kind not picked yet.
pub fn pick<'a>(bank: &[&'a BankQuestion], stage: &str, priorities: &[String], startup: bool, take: usize, used: &mut HashSet<String>) -> Vec<&'a BankQuestion> {
    let score = |q: &BankQuestion| q.great_eight.iter().filter(|g| priorities.contains(g)).count();
    let mut pool: Vec<&BankQuestion> = bank.iter().copied().filter(|q| eligible(q, stage, startup) && !used.contains(&q.id)).collect();
    pool.sort_by(|a, b| score(b).cmp(&score(a)).then_with(|| a.id.cmp(&b.id)));
    let mut out: Vec<&BankQuestion> = Vec::new();
    let take_first = |out: &mut Vec<&'a BankQuestion>, pred: &dyn Fn(&BankQuestion) -> bool, pool: &mut Vec<&'a BankQuestion>| {
        if out.len() < take {
            if let Some(i) = pool.iter().position(|q| pred(q)) {
                out.push(pool.remove(i));
            }
        }
    };
    if stage == "recruiter" {
        take_first(&mut out, &|q| q.kind == "factual", &mut pool);
        take_first(&mut out, &|q| q.kind == "tell_me_about_yourself", &mut pool);
        take_first(&mut out, &|q| q.kind == "motivation", &mut pool);
    }
    if stage == "leadership" && startup {
        take_first(&mut out, &|q| q.commitment_check, &mut pool);
        take_first(&mut out, &|q| q.builder_operator_check, &mut pool);
    }
    while out.len() < take && !pool.is_empty() {
        // Prefer a kind of question not picked yet for this stage.
        let i = pool.iter().position(|q| !out.iter().any(|o| o.kind == q.kind)).unwrap_or(0);
        out.push(pool.remove(i));
    }
    for q in &out {
        used.insert(q.id.clone());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn pool(role: &str) -> Vec<&'static BankQuestion> {
        banks_for(role)
    }

    #[test]
    fn the_general_set_always_loads_and_the_lifecycle_pack_comes_with_a_lifecycle_role() {
        let general = pool("Product designer");
        let lifecycle = pool("Senior Lifecycle Marketing Manager");
        assert!(general.len() > 100, "{}", general.len());
        assert!(lifecycle.len() > general.len());
        assert!(general.iter().all(|q| !q.id.starts_with("lmo-")));
        assert!(lifecycle.iter().any(|q| q.id.starts_with("lmo-")));
    }

    #[test]
    fn a_recruiter_stage_gets_a_logistics_question_and_never_a_founder_question() {
        let mut used = HashSet::new();
        let picked = pick(&pool("Designer"), "recruiter", &[], false, 3, &mut used);
        assert_eq!(picked.len(), 3);
        assert!(picked.iter().any(|q| q.kind == "factual"), "{:?}", picked.iter().map(|q| &q.kind).collect::<Vec<_>>());
        assert!(picked.iter().all(|q| q.stages.iter().any(|s| s == "recruiter")));
        assert!(picked.iter().all(|q| q.founder_variant != Some(true) && q.moment.is_none()));
    }

    #[test]
    fn a_startup_leadership_stage_gets_a_commitment_and_a_builder_or_operator_question() {
        let mut used = HashSet::new();
        let picked = pick(&pool("Designer"), "leadership", &[], true, 3, &mut used);
        assert!(picked.iter().any(|q| q.commitment_check), "{:?}", picked.iter().map(|q| &q.text).collect::<Vec<_>>());
        assert!(picked.iter().any(|q| q.builder_operator_check));
        let mut used = HashSet::new();
        let plain = pick(&pool("Designer"), "leadership", &[], false, 3, &mut used);
        assert!(plain.iter().all(|q| q.founder_variant != Some(true)), "a company that is not a startup gets no founder questions");
    }

    #[test]
    fn priorities_steer_the_pick_and_a_question_is_never_used_twice() {
        let mut used = HashSet::new();
        let first = pick(&pool("Designer"), "hiring_manager", &["retain_customers".to_string()], false, 4, &mut used);
        let second = pick(&pool("Designer"), "hiring_manager", &["retain_customers".to_string()], false, 4, &mut used);
        let ids: Vec<&str> = first.iter().chain(second.iter()).map(|q| q.id.as_str()).collect();
        let unique: HashSet<&&str> = ids.iter().collect();
        assert_eq!(ids.len(), unique.len(), "the second hiring manager stage gets different questions");
        assert!(first.iter().any(|q| q.great_eight.iter().any(|g| g == "retain_customers")));
    }

    #[test]
    fn the_pick_is_the_same_every_time() {
        let a: Vec<&str> = pick(&pool("Designer"), "panel", &[], false, 3, &mut HashSet::new()).iter().map(|q| q.id.as_str()).collect();
        let b: Vec<&str> = pick(&pool("Designer"), "panel", &[], false, 3, &mut HashSet::new()).iter().map(|q| q.id.as_str()).collect();
        assert_eq!(a, b);
    }

    #[test]
    fn a_story_fits_a_question_by_shared_competencies_and_theme_words() {
        use crate::storage::model::Usage;
        let q = BankQuestion { id: "x".into(), text: "Tell me about a time you improved a metric.".into(), kind: "behavioral".into(), behavioral_situation: None, stages: vec![], modes: vec![], competencies: vec!["data analysis".into()], great_eight: vec![], commitment_check: false, builder_operator_check: false, difficulty: "standard".into(), founder_variant: None, moment: None };
        let mut s = crate::storage::model::Story { id: "s".into(), title: "T".into(), employer: "".into(), best_for: vec!["improving a metric".into()], direct_answer: "".into(), context: "".into(), approach: "".into(), action: "".into(), ownership: "".into(), result: "".into(), proof_points: vec![], scale: "".into(), competencies: vec!["Data analysis".into()], great_eight: vec![], branches: vec![], verified: false, headline: "".into(), usage: Usage::default(), year: None };
        assert!(story_fit(&q, &s) >= 3);
        s.competencies.clear();
        s.best_for.clear();
        assert_eq!(story_fit(&q, &s), 0);
    }
}
