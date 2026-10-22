//! Reading a pasted job posting (prompt 09), keeping the user's edits, and the keyword reading used when no engine can
//! do it. The model's reply is checked before it is trusted: a story id that is not in the bank becomes "no story", a
//! phrase that is not in the posting is dropped, and the startup flag can only ever be turned on.

use super::inputs::{bank_index, found_in, norm, plain, process_text, profile_text};
use super::question_bank::{banks_for, pick, story_fit};
use crate::rep_commands::AiCtx;
use crate::scoring::prompts::{get, PromptId};
use crate::scoring::run::{call_json, CallError};
use crate::scoring::template::{escape_data, Vars};
use crate::storage::application_files::{AnalysisFile, Belief, DerivedAnalysis, Priority, QuestionRec, QuestionsFile};
use crate::storage::applications::{stamp, AppRecord};
use crate::storage::model::Story;
use crate::storage::targets::TargetFit;
use crate::storage::{Result as StorageResult, Storage, StorageError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

// ---------- what prompt 09 returns ----------

#[derive(Debug, Deserialize)]
struct RawPriority {
    priority: String,
    why: String,
}

#[derive(Debug, Deserialize)]
struct RawBelief {
    belief: String,
    best_story_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawQuestion {
    stage: String,
    text: String,
    #[serde(rename = "type")]
    kind: String,
    behavioral_situation: Option<String>,
    commitment_check: bool,
    builder_operator_check: bool,
    best_story_id: Option<String>,
    why: String,
}

#[derive(Debug, Deserialize)]
struct RawGap {
    stage: String,
    text: String,
    requirement: String,
}

#[derive(Debug, Deserialize)]
struct RawNoMatch {
    priority_or_belief: String,
    story_needed: String,
}

#[derive(Debug, Deserialize)]
struct Raw {
    company_stage: String,
    stage_evidence: String,
    startup: bool,
    great_eight: Vec<RawPriority>,
    must_believe: Vec<RawBelief>,
    unsaid: Vec<String>,
    mirror_language: Vec<String>,
    summary: String,
    questions: Vec<RawQuestion>,
    gap_questions: Vec<RawGap>,
    no_match: Vec<RawNoMatch>,
}

/// What reading the posting produced, before it is merged with earlier edits.
struct Reading {
    derived: DerivedAnalysis,
    /// Without ids: they are given when the set is merged.
    questions: Vec<QuestionRec>,
    startup: bool,
    raw: Option<Value>,
    prompt: String,
    engine: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct JdResult {
    /// `ai`, `keywords`, or `unchanged` (the reading failed and an earlier one by the engine was kept).
    pub source: String,
    /// Plain words for the screen when the engine did not do the reading.
    pub notice: Option<String>,
    /// What reading again changed, in plain words.
    pub changed: Vec<String>,
    /// What the user edited that reading again left alone (`analysis.summary`, `question q_3`).
    pub kept: Vec<String>,
    pub startup_turned_on: bool,
    pub question_count: usize,
    /// How the posting reads against the targets, as saved on the application (the command returns it as `targetFit`).
    #[serde(skip)]
    pub target_fit: Option<TargetFit>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PostingSaved {
    pub changed: bool,
    /// There is already a reading of the posting: the screen asks "Read it again?".
    pub has_analysis: bool,
}

const NO_ENGINE: &str = "No AI engine is set up, so the posting was read by keywords only: the tools it names and the phrases it repeats. The questions come from the general set. Choose an engine in Settings › AI and read it again for a fuller reading.";

fn failure_notice(e: &CallError) -> String {
    let reason = match e {
        CallError::Unavailable(m) | CallError::Failed(m) => m.clone(),
        CallError::Invalid(_) => "The AI's reply couldn't be read.".to_string(),
        CallError::CapReached => "This session reached its spending limit.".to_string(),
    };
    format!("{reason} The posting was read by keywords only, and the questions come from the general set.")
}

/// The plain name of a Great Eight priority, for the Overview.
pub fn priority_title(id: &str) -> &'static str {
    match id {
        "generate_revenue" => "Grow revenue",
        "reduce_costs" => "Spend less",
        "market_share" => "Win market share",
        "attract_customers" => "Win customers",
        "retain_customers" => "Keep customers",
        "productivity" => "Do more with less",
        "develop_people" => "Grow the team",
        "compliance" => "Stay compliant",
        _ => "Priority",
    }
}

/// "7-day activation 31% → 44%": the card line of a story, from what is saved on it.
pub fn story_headline(s: &Story) -> String {
    if !s.headline.trim().is_empty() {
        return s.headline.trim().to_string();
    }
    match s.proof_points.first() {
        Some(p) => {
            let u = if p.unit == "%" { "%" } else { "" };
            let name = if p.metric.is_empty() { &p.label } else { &p.metric };
            if p.before.is_empty() {
                format!("{name} {}{u}", p.after)
            } else {
                format!("{name} {}{u} → {}{u}", p.before, p.after)
            }
        }
        None => String::new(),
    }
}

fn story_line(s: &Story) -> String {
    let h = story_headline(s);
    if h.is_empty() {
        s.title.clone()
    } else {
        format!("{} · {h}", s.title)
    }
}

fn words_over(s: &str, n: usize) -> HashSet<String> {
    norm(s).split(' ').filter(|w| w.len() > n).map(String::from).collect()
}

/// The same thing said in other words, near enough to tell which belief a "no story" note is about.
fn similar(a: &str, b: &str) -> bool {
    let (x, y) = (words_over(a, 3), words_over(b, 3));
    if x.is_empty() || y.is_empty() {
        return false;
    }
    let shared = x.intersection(&y).count() as f64;
    shared / x.len().min(y.len()) as f64 >= 0.6
}

// ---------- the reading by the engine ----------

fn derive(raw: &Raw, stories: &[Story], jd: &str) -> DerivedAnalysis {
    let priorities = raw.great_eight.iter().map(|g| Priority { title: priority_title(&g.priority).to_string(), detail: plain(&g.why) }).collect();
    let mut used_no_match = vec![false; raw.no_match.len()];
    let beliefs = raw
        .must_believe
        .iter()
        .map(|b| {
            let story = b.best_story_id.as_deref().and_then(|id| stories.iter().find(|s| s.id == id));
            let text = plain(&b.belief);
            match story {
                Some(s) => Belief { text, story_id: Some(s.id.clone()), story: story_line(s), covered: true, why: None },
                None => {
                    let note = raw.no_match.iter().enumerate().find(|(_, n)| similar(&n.priority_or_belief, &b.belief));
                    if let Some((i, _)) = note {
                        used_no_match[i] = true;
                    }
                    let why = note.map(|(_, n)| plain(&n.story_needed)).filter(|w| !w.is_empty()).unwrap_or_else(|| "None of your stories shows this yet.".to_string());
                    Belief { text, story_id: None, story: String::new(), covered: false, why: Some(why) }
                }
            }
        })
        .collect();
    let mut gaps: Vec<String> = Vec::new();
    for g in &raw.gap_questions {
        let r = plain(&g.requirement);
        if !r.is_empty() && !gaps.contains(&r) {
            gaps.push(r);
        }
    }
    for (i, n) in raw.no_match.iter().enumerate() {
        if !used_no_match[i] {
            gaps.push(format!("{}: no story yet. {}", plain(&n.priority_or_belief), plain(&n.story_needed)));
        }
    }
    let jd_norm = norm(jd);
    let echo = raw.mirror_language.iter().filter(|p| found_in(&jd_norm, p)).map(|p| format!("\"{}\"", p.trim())).collect();
    DerivedAnalysis {
        summary: plain(&raw.summary),
        priorities,
        beliefs,
        gaps,
        echo,
        company_stage: raw.company_stage.clone(),
        stage_evidence: plain(&raw.stage_evidence),
        unsaid: raw.unsaid.iter().map(|u| plain(u)).collect(),
    }
}

/// The stage a question for this stage type goes to: the first of its type, else the hiring manager, else the first.
fn stage_for_type<'a>(rec: &'a AppRecord, stage_type: &str) -> Option<&'a crate::storage::applications::StageRec> {
    rec.process.iter().find(|p| p.stage == stage_type).or_else(|| rec.process.iter().find(|p| p.stage == "hiring_manager")).or_else(|| rec.process.first())
}

fn question_for(rec: &AppRecord, stories: &[Story], stage_type: &str, q: RawQuestion, source: &str) -> Option<QuestionRec> {
    let stage = stage_for_type(rec, stage_type)?;
    let story = q.best_story_id.filter(|id| stories.iter().any(|s| &s.id == id));
    Some(QuestionRec {
        id: String::new(),
        stage_id: stage.id.clone(),
        stage: stage.stage.clone(),
        text: plain(&q.text),
        kind: q.kind,
        behavioral_situation: q.behavioral_situation.filter(|s| s != "other"),
        commitment_check: q.commitment_check,
        builder_operator_check: q.builder_operator_check,
        best_story_id: story,
        why: plain(&q.why),
        requirement: None,
        source: source.to_string(),
        edited_by_user: false,
    })
}

fn ai_read(ctx: &mut AiCtx, rec: &AppRecord, jd: &str, stories: &[Story], profile: &str) -> Result<Reading, CallError> {
    let vars = Vars::new()
        .set("company", escape_data(&rec.company))
        .set("role", escape_data(&rec.role))
        .set("process", process_text(rec))
        .set("startup_flag", if rec.startup { "true" } else { "" })
        .set("jd_text", escape_data(jd))
        .set("profile", escape_data(profile))
        .set("bank_index", escape_data(&bank_index(stories)));
    let called = call_json(ctx.llm, get(PromptId::AnalyseJd), &vars, 4000, ctx.budget)?;
    let raw: Raw = serde_json::from_value(called.value.clone()).map_err(|e| CallError::Invalid(e.to_string()))?;
    let derived = derive(&raw, stories, jd);
    let mut questions: Vec<QuestionRec> = Vec::new();
    let gaps: Vec<RawGap> = raw.gap_questions.iter().map(|g| RawGap { stage: g.stage.clone(), text: g.text.clone(), requirement: g.requirement.clone() }).collect();
    let startup = raw.startup;
    for q in raw.questions {
        let stage = q.stage.clone();
        questions.extend(question_for(rec, stories, &stage, q, "jd"));
    }
    for g in gaps {
        let q = RawQuestion { stage: g.stage.clone(), text: g.text, kind: "gap".into(), behavioral_situation: None, commitment_check: false, builder_operator_check: false, best_story_id: None, why: String::new() };
        if let Some(mut rq) = question_for(rec, stories, &g.stage, q, "gap") {
            rq.requirement = Some(plain(&g.requirement));
            questions.push(rq);
        }
    }
    Ok(Reading { derived, questions, startup, raw: Some(called.value), prompt: format!("analyse-jd v{}", get(PromptId::AnalyseJd).version), engine: "ai" })
}

// ---------- the keyword reading ----------

const TOOLS: [&str; 41] = [
    "Braze", "Iterable", "Klaviyo", "HubSpot", "Salesforce", "Marketo", "Mailchimp", "Customer.io", "Segment", "Amplitude", "Mixpanel", "Looker", "Tableau", "Power BI", "SQL", "Python", "Excel", "Google Analytics", "GA4", "Figma", "Jira",
    "Asana", "Notion", "Snowflake", "BigQuery", "dbt", "Zapier", "Shopify", "WordPress", "Photoshop", "Salesloft", "Outreach", "Zendesk", "Intercom", "Twilio", "OneSignal", "Optimizely", "Attentive", "SendGrid", "Heap", "Fivetran",
];

const PRIORITY_WORDS: [(&str, &[&str]); 8] = [
    ("generate_revenue", &["revenue", "upsell", "cross-sell", "monetiz", "conversion", "pricing"]),
    ("reduce_costs", &["cost", "budget", "efficien", "margin"]),
    ("market_share", &["market share", "competitor", "competitive", "category"]),
    ("attract_customers", &["acquisition", "acquire", "sign up", "signup", "lead generation", "funnel", "demand gen"]),
    ("retain_customers", &["retention", "churn", "loyalty", "activation", "onboarding", "win-back", "re-engage"]),
    ("productivity", &["automation", "automate", "workflow", "end to end", "no ops"]),
    ("develop_people", &["mentor", "coach", "direct reports", "manage a team", "grow the team"]),
    ("compliance", &["compliance", "regulat", "gdpr", "casl", "privacy", "audit", "pci"]),
];

const STARTUP_WORDS: [&str; 8] = ["founder-led", "founder led", "early-stage", "early stage", "pre-seed", "seed-stage", "seed stage", "series a"];

const STOP: [&str; 44] = [
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "in", "is", "it", "of", "on", "or", "our", "that", "the", "their", "this", "to", "we", "will", "with", "you", "your", "who", "what", "about", "can", "ll", "re", "s",
    "not", "but", "so", "if", "all", "any", "into", "per",
];

/// What the keywords found. Nothing here is judged: it is the posting's own words, counted.
#[derive(Debug, Clone, PartialEq)]
pub struct KeywordRead {
    /// Tools the posting names, in the order it names them.
    pub tools: Vec<String>,
    /// Up to five phrases the posting repeats, as they are written in it.
    pub phrases: Vec<String>,
    /// Great Eight ids with the words that matched, strongest first (at most three).
    pub priorities: Vec<(String, Vec<String>, usize)>,
    pub startup: bool,
    pub summary: String,
}

fn count(hay: &str, needle: &str) -> usize {
    hay.matches(needle).count()
}

fn is_word_at(hay: &str, start: usize, len: usize) -> bool {
    let before = hay[..start].chars().next_back().is_none_or(|c| !c.is_alphanumeric());
    let after = hay[start + len..].chars().next().is_none_or(|c| !c.is_alphanumeric());
    before && after
}

fn find_word(hay_lower: &str, word_lower: &str) -> Option<usize> {
    let mut from = 0;
    while let Some(i) = hay_lower[from..].find(word_lower) {
        let at = from + i;
        if is_word_at(hay_lower, at, word_lower.len()) {
            return Some(at);
        }
        from = at + word_lower.len();
    }
    None
}

fn repeated_phrases(jd: &str) -> Vec<String> {
    let lower = jd.to_ascii_lowercase();
    let mut toks: Vec<(String, usize, usize)> = Vec::new();
    let mut start: Option<usize> = None;
    for (i, c) in lower.char_indices().chain(std::iter::once((lower.len(), ' '))) {
        if c.is_alphanumeric() || c == '\'' {
            start.get_or_insert(i);
        } else if let Some(s) = start.take() {
            toks.push((lower[s..i].to_string(), s, i));
        }
    }
    let joined = |a: usize, b: usize| (a..=b).map(|i| toks[i].0.as_str()).collect::<Vec<_>>().join(" ");
    let gap_ok = |i: usize| lower[toks[i].2..toks[i + 1].1].chars().all(|c| c == ' ' || c == '-');
    let mut seen: Vec<(String, usize, usize, usize, usize)> = Vec::new(); // phrase, count, tokens, first start, first end
    for n in 2..=5usize {
        for a in 0..toks.len().saturating_sub(n - 1) {
            let b = a + n - 1;
            if !(a..b).all(gap_ok) {
                continue;
            }
            let (first, last) = (toks[a].0.as_str(), toks[b].0.as_str());
            if STOP.contains(&first) || STOP.contains(&last) || first.chars().all(|c| c.is_ascii_digit()) || last.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            if !(a..=b).any(|i| toks[i].0.len() >= 4) {
                continue;
            }
            let key = joined(a, b);
            match seen.iter_mut().find(|s| s.0 == key) {
                Some(s) => s.1 += 1,
                None => seen.push((key, 1, n, toks[a].1, toks[b].2)),
            }
        }
    }
    seen.retain(|s| s.1 >= 2);
    seen.sort_by(|x, y| y.1.cmp(&x.1).then(y.2.cmp(&x.2)).then(x.3.cmp(&y.3)));
    let mut chosen: Vec<(String, usize, usize, usize, usize)> = Vec::new();
    for s in seen {
        let inside = chosen.iter().any(|c| format!(" {} ", c.0).contains(&format!(" {} ", s.0)));
        if !inside {
            chosen.push(s);
        }
        if chosen.len() == 5 {
            break;
        }
    }
    chosen.into_iter().map(|c| jd[c.3..c.4].to_string()).collect()
}

fn first_sentences(jd: &str) -> String {
    let line = jd.lines().map(str::trim).find(|l| l.len() >= 80).unwrap_or_else(|| jd.trim());
    let mut out = String::new();
    let mut sentences = 0;
    for part in line.split_inclusive(". ") {
        out.push_str(part);
        sentences += 1;
        if sentences == 2 {
            break;
        }
    }
    let mut out = out.trim().to_string();
    if out.len() > 300 {
        let cut = out.char_indices().take_while(|(i, _)| *i <= 300).map(|(i, _)| i).last().unwrap_or(300);
        out = out[..cut].trim_end().to_string();
        if let Some(i) = out.rfind(' ') {
            out.truncate(i);
        }
        out.push_str("...");
    }
    out
}

pub fn keyword_read(jd: &str, _stories: &[Story]) -> KeywordRead {
    let lower = jd.to_ascii_lowercase();
    let mut tools: Vec<(usize, String)> = TOOLS.iter().filter_map(|t| find_word(&lower, &t.to_ascii_lowercase()).map(|i| (i, t.to_string()))).collect();
    tools.sort();
    let mut priorities: Vec<(String, Vec<String>, usize)> = PRIORITY_WORDS
        .iter()
        .filter_map(|(id, words)| {
            let hits: Vec<(&str, usize)> = words.iter().map(|w| (*w, count(&lower, w))).filter(|(_, n)| *n > 0).collect();
            let total: usize = hits.iter().map(|(_, n)| n).sum();
            (total > 0).then(|| (id.to_string(), hits.iter().map(|(w, _)| w.to_string()).collect(), total))
        })
        .collect();
    priorities.sort_by(|a, b| b.2.cmp(&a.2));
    priorities.truncate(3);
    KeywordRead { tools: tools.into_iter().map(|t| t.1).collect(), phrases: repeated_phrases(jd), priorities, startup: STARTUP_WORDS.iter().any(|w| lower.contains(w)), summary: first_sentences(jd) }
}

fn story_text(stories: &[Story]) -> String {
    stories
        .iter()
        .flat_map(|s| {
            let mut parts = vec![s.title.clone(), s.direct_answer.clone(), s.context.clone(), s.approach.clone(), s.action.clone(), s.ownership.clone(), s.result.clone(), s.scale.clone()];
            parts.extend(s.competencies.clone());
            parts.extend(s.proof_points.iter().flat_map(|p| [p.label.clone(), p.metric.clone()]));
            parts
        })
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn times(n: usize) -> String {
    if n == 1 { "once".to_string() } else { format!("{n} times") }
}

fn keyword_reading(rec: &AppRecord, jd: &str, stories: &[Story], target_role: &str) -> Reading {
    let k = keyword_read(jd, stories);
    let have = story_text(stories);
    let gaps = k.tools.iter().filter(|t| find_word(&have, &t.to_lowercase()).is_none()).map(|t| format!("{t}: the posting names it and none of your stories mention it")).collect();
    let priorities: Vec<Priority> = k
        .priorities
        .iter()
        .map(|(id, words, n)| Priority { title: priority_title(id).to_string(), detail: format!("The posting touches this {}: {}.", times(*n), words.iter().map(|w| format!("\"{w}\"")).collect::<Vec<_>>().join(", ")) })
        .collect();
    let mut evidence = if k.tools.is_empty() { "Read by keywords only. The posting names no tools I know.".to_string() } else { format!("Read by keywords only. Tools the posting names: {}.", k.tools.join(", ")) };
    if k.startup {
        evidence.push_str(" It reads like an early-stage, founder-led company.");
    }
    let derived = DerivedAnalysis {
        summary: k.summary.clone(),
        priorities,
        beliefs: vec![],
        gaps,
        echo: k.phrases.iter().map(|p| format!("\"{p}\"")).collect(),
        company_stage: if k.startup { "early_startup".into() } else { "unknown".into() },
        stage_evidence: evidence,
        unsaid: vec![],
    };
    let startup = rec.startup || k.startup;
    let ids: Vec<String> = k.priorities.iter().map(|p| p.0.clone()).collect();
    let bank = banks_for(target_role);
    let per_stage = (12 / rec.process.len().max(1)).clamp(2, 4);
    let mut used = HashSet::new();
    let mut questions = Vec::new();
    for stage in &rec.process {
        for q in pick(&bank, &stage.stage, &ids, startup, per_stage, &mut used) {
            let story = stories.iter().map(|s| (story_fit(q, s), s)).filter(|(f, _)| *f >= 3).max_by_key(|(f, _)| *f).map(|(_, s)| s.id.clone());
            let touches: Vec<&str> = q.great_eight.iter().filter(|g| ids.contains(g)).map(|g| priority_title(g)).collect();
            questions.push(QuestionRec {
                id: String::new(),
                stage_id: stage.id.clone(),
                stage: stage.stage.clone(),
                text: q.text.clone(),
                kind: q.kind.clone(),
                behavioral_situation: q.behavioral_situation.clone().filter(|s| s != "other"),
                commitment_check: q.commitment_check,
                builder_operator_check: q.builder_operator_check,
                best_story_id: story,
                why: if touches.is_empty() { "A common question at this stage.".into() } else { format!("Touches what the posting stresses: {}.", touches.join(", ")) },
                requirement: None,
                source: "bank".into(),
                edited_by_user: false,
            });
        }
    }
    Reading { derived, questions, startup: k.startup, raw: None, prompt: "keywords".into(), engine: "keywords" }
}

// ---------- merging with what the user edited ----------

fn place<T: Clone>(list: &mut Vec<T>, i: usize, item: &T) {
    if i < list.len() {
        list[i] = item.clone();
    } else {
        list.push(item.clone());
    }
}

/// The new reading with the user's edits laid back over it. Returns what was kept, as `analysis.*` paths.
fn merge_derived(old: Option<&AnalysisFile>, mut new: DerivedAnalysis) -> (DerivedAnalysis, Vec<String>) {
    let Some(old) = old else { return (new, vec![]) };
    let mut kept = Vec::new();
    for path in &old.edited_by_user {
        let o = &old.derived;
        let parts: Vec<&str> = path.split('.').collect();
        let done = match parts.as_slice() {
            ["summary"] => {
                new.summary = o.summary.clone();
                true
            }
            ["priorities"] => {
                new.priorities = o.priorities.clone();
                true
            }
            ["beliefs"] => {
                new.beliefs = o.beliefs.clone();
                true
            }
            ["gaps"] => {
                new.gaps = o.gaps.clone();
                true
            }
            ["echo"] => {
                new.echo = o.echo.clone();
                true
            }
            ["priorities", i] => i.parse::<usize>().ok().and_then(|i| o.priorities.get(i).map(|x| place(&mut new.priorities, i, x))).is_some(),
            ["beliefs", i] => i.parse::<usize>().ok().and_then(|i| o.beliefs.get(i).map(|x| place(&mut new.beliefs, i, x))).is_some(),
            ["gaps", i] => i.parse::<usize>().ok().and_then(|i| o.gaps.get(i).map(|x| place(&mut new.gaps, i, x))).is_some(),
            ["echo", i] => i.parse::<usize>().ok().and_then(|i| o.echo.get(i).map(|x| place(&mut new.echo, i, x))).is_some(),
            _ => false,
        };
        if done {
            kept.push(format!("analysis.{path}"));
        }
    }
    (new, kept)
}

fn changes(old: Option<&DerivedAnalysis>, new: &DerivedAnalysis) -> Vec<String> {
    let Some(o) = old else { return vec!["Read the posting.".to_string()] };
    let mut out = Vec::new();
    if o.summary != new.summary {
        out.push("The summary changed.".to_string());
    }
    if o.priorities != new.priorities {
        out.push("What they likely need changed.".to_string());
    }
    if o.beliefs != new.beliefs {
        out.push("The three things they need to believe changed.".to_string());
    }
    if o.gaps != new.gaps {
        out.push("What they ask for and your stories don't mention changed.".to_string());
    }
    if o.echo != new.echo {
        out.push("Their words worth echoing changed.".to_string());
    }
    out
}

/// Where the two lists differ, as paths the user can be said to have edited.
fn diff_paths(old: &DerivedAnalysis, new: &DerivedAnalysis) -> Vec<String> {
    fn list<T: PartialEq>(name: &str, o: &[T], n: &[T], out: &mut Vec<String>) {
        if n.len() < o.len() {
            out.push(name.to_string());
            return;
        }
        for (i, item) in n.iter().enumerate() {
            if o.get(i) != Some(item) {
                out.push(format!("{name}.{i}"));
            }
        }
    }
    let mut out = Vec::new();
    if old.summary != new.summary {
        out.push("summary".to_string());
    }
    list("priorities", &old.priorities, &new.priorities, &mut out);
    list("beliefs", &old.beliefs, &new.beliefs, &mut out);
    list("gaps", &old.gaps, &new.gaps, &mut out);
    list("echo", &old.echo, &new.echo, &mut out);
    out
}

/// The user's edit of what was read from the posting (summary, a priority, a belief, a gap, a phrase). What differs
/// from the current reading is listed as edited, so reading the posting again keeps it.
pub fn save_analysis(storage: &Storage, id: &str, mut input: DerivedAnalysis) -> StorageResult<DerivedAnalysis> {
    let existing = storage.load_application_part::<AnalysisFile>(id, "analysis.json")?;
    let mut file = existing.unwrap_or_else(|| AnalysisFile { prompt: "user".into(), engine: "user".into(), read_on: stamp(), raw: None, derived: DerivedAnalysis::default(), edited_by_user: vec![] });
    if input.company_stage.is_empty() {
        input.company_stage = file.derived.company_stage.clone();
    }
    if input.stage_evidence.is_empty() {
        input.stage_evidence = file.derived.stage_evidence.clone();
    }
    if input.unsaid.is_empty() {
        input.unsaid = file.derived.unsaid.clone();
    }
    for p in diff_paths(&file.derived, &input) {
        if !file.edited_by_user.contains(&p) {
            file.edited_by_user.push(p);
        }
    }
    file.derived = input;
    storage.save_application_part(id, "analysis.json", &file)?;
    Ok(file.derived)
}

/// The new set of questions: the ones the user wrote or changed stay, the rest are replaced by the new reading's.
fn merge_questions(rec: &AppRecord, old: Option<QuestionsFile>, fresh: Vec<QuestionRec>, prompt: &str, engine: &str) -> (QuestionsFile, Vec<String>) {
    let mut file = QuestionsFile { prompt: prompt.into(), engine: engine.into(), questions: vec![], next_n: old.as_ref().map(|o| o.next_n).unwrap_or(0) };
    let kept: Vec<QuestionRec> = old.map(|o| o.questions.into_iter().filter(|q| q.edited_by_user).collect()).unwrap_or_default();
    let kept_ids: Vec<String> = kept.iter().map(|q| format!("question {}", q.id)).collect();
    file.questions = kept;
    for mut q in fresh {
        q.id = file.new_id();
        file.questions.push(q);
    }
    let order = |q: &QuestionRec| rec.process.iter().position(|p| p.id == q.stage_id).unwrap_or(usize::MAX);
    file.questions.sort_by_key(order);
    (file, kept_ids)
}

// ---------- the commands' logic ----------

/// Saves the pasted posting. A changed posting that already has a reading is the cue to ask "Read it again?".
pub fn save_posting(storage: &Storage, id: &str, text: &str) -> StorageResult<PostingSaved> {
    let old = storage.application_text(id, "jd.txt")?;
    let has_old = old.as_deref().is_some_and(|o| !o.trim().is_empty());
    let changed = match &old {
        Some(o) => o.trim() != text.trim(),
        None => !text.trim().is_empty(),
    };
    if changed {
        if text.trim().is_empty() {
            storage.application(id)?;
            storage.remove_application_file(id, "jd.txt")?;
        } else {
            storage.save_application_text(id, "jd.txt", text)?;
        }
        if has_old {
            storage.change(id, |a| {
                a.mark_edited("posting", None);
                Ok(())
            })?;
        }
    } else {
        storage.application(id)?;
    }
    let has_analysis = storage.load_application_part::<AnalysisFile>(id, "analysis.json")?.is_some();
    Ok(PostingSaved { changed, has_analysis })
}

/// Reads the saved posting: with the engine when there is one and it works, by keywords when not. Edits the user made
/// to the reading and to the questions are kept; the result says what changed and what was kept.
pub fn analyse(storage: &Storage, ai: Option<AiCtx>, id: &str) -> StorageResult<JdResult> {
    let rec = storage.application(id)?;
    let jd = storage.application_text(id, "jd.txt")?.filter(|t| !t.trim().is_empty()).ok_or_else(|| StorageError::Invalid("Paste the job posting first, then Ensayo can read it.".into()))?;
    let stories = storage.load_stories()?.items;
    let profile = storage.profile_for(storage.application_target(&rec)?.as_deref())?;
    let old = storage.load_application_part::<AnalysisFile>(id, "analysis.json")?;
    let attempt: Result<Reading, String> = match ai {
        Some(mut ctx) => ai_read(&mut ctx, &rec, &jd, &stories, &profile_text(profile.as_ref())).map_err(|e| failure_notice(&e)),
        None => Err(NO_ENGINE.to_string()),
    };
    let (reading, notice) = match attempt {
        Ok(r) => (r, None),
        Err(reason) => {
            if old.as_ref().is_some_and(|o| o.engine == "ai") {
                let questions = storage.load_application_part::<QuestionsFile>(id, "questions.json")?.map(|q| q.questions.len()).unwrap_or(0);
                return Ok(JdResult { source: "unchanged".into(), notice: Some(format!("{reason} What was read before is unchanged.")), changed: vec![], kept: vec![], startup_turned_on: false, question_count: questions, target_fit: rec.target_fit.clone() });
            }
            (keyword_reading(&rec, &jd, &stories, profile.as_ref().map(|p| p.target_role.as_str()).unwrap_or("")), Some(reason))
        }
    };
    let (derived, mut kept) = merge_derived(old.as_ref(), reading.derived);
    let mut changed = changes(old.as_ref().map(|o| &o.derived), &derived);
    let old_questions = storage.load_application_part::<QuestionsFile>(id, "questions.json")?;
    let had_questions = old_questions.as_ref().is_some_and(|q| !q.questions.is_empty());
    let (qfile, kept_questions) = merge_questions(&rec, old_questions, reading.questions, &reading.prompt, reading.engine);
    if had_questions {
        changed.push("The prepared questions were replaced.".to_string());
    }
    kept.extend(kept_questions);
    let edited_paths: Vec<String> = old.as_ref().map(|o| o.edited_by_user.clone()).unwrap_or_default();
    let file = AnalysisFile { prompt: reading.prompt, engine: reading.engine.to_string(), read_on: stamp(), raw: reading.raw, derived, edited_by_user: edited_paths };
    let turn_on = reading.startup && !rec.startup && !rec.is_edited("startup");
    if turn_on {
        storage.change(id, |a| {
            a.startup = true;
            Ok(())
        })?;
        changed.push("Marked this application as a startup, because the posting reads like one.".to_string());
    }
    storage.save_application_part(id, "analysis.json", &file)?;
    storage.save_application_part(id, "questions.json", &qfile)?;
    let target_fit = fit_of(storage, &rec, &jd)?;
    storage.change(id, |a| {
        a.target_fit = target_fit.clone();
        Ok(())
    })?;
    Ok(JdResult { source: reading.engine.to_string(), notice, changed, kept, startup_turned_on: turn_on, question_count: qfile.questions.len(), target_fit })
}

/// How the posting fits the targets: by keywords for now (the engine's own reading of the fit is added where the reply of
/// prompt 09 is read). `None` when there is no target to compare with.
fn fit_of(storage: &Storage, rec: &AppRecord, jd: &str) -> StorageResult<Option<TargetFit>> {
    let targets = storage.targets()?;
    let filed = storage.application_target(rec)?;
    Ok(super::target_fit::keyword_fit(rec, jd, &targets, filed.as_deref()))
}

/// Makes the prepared questions again after the application moved to another target, the way reading the posting again
/// does: the questions the user wrote or changed stay, the rest are replaced. With the engine the posting is read again
/// (the new target's role is what it is told); without one the general questions for the new target's role come back and
/// the reading of the posting is left alone. `None` when there is no posting to work from; else how many questions there are.
pub fn rebuild_questions(storage: &Storage, ai: Option<AiCtx>, id: &str) -> StorageResult<Option<usize>> {
    let rec = storage.application(id)?;
    let Some(jd) = storage.application_text(id, "jd.txt")?.filter(|t| !t.trim().is_empty()) else { return Ok(None) };
    if ai.is_some() {
        let out = analyse(storage, ai, id)?;
        if out.source != "unchanged" {
            return Ok(Some(out.question_count));
        }
    }
    let stories = storage.load_stories()?.items;
    let profile = storage.profile_for(storage.application_target(&rec)?.as_deref())?;
    let reading = keyword_reading(&rec, &jd, &stories, profile.as_ref().map(|p| p.target_role.as_str()).unwrap_or(""));
    let old = storage.load_application_part::<QuestionsFile>(id, "questions.json")?;
    let (qfile, _kept) = merge_questions(&rec, old, reading.questions, &reading.prompt, reading.engine);
    storage.save_application_part(id, "questions.json", &qfile)?;
    let target_fit = fit_of(storage, &rec, &jd)?;
    storage.change(id, |a| {
        a.target_fit = target_fit;
        Ok(())
    })?;
    Ok(Some(qfile.questions.len()))
}

// ---------- the user's own questions ----------

#[derive(Debug, Clone, Deserialize)]
pub struct QuestionInput {
    /// None adds a question; an id changes that question.
    #[serde(default)]
    pub id: Option<String>,
    pub stage_id: String,
    pub text: String,
    /// The classifier's type, or the screen's own name for it (`about_you`, `future`).
    pub kind: String,
}

fn question_kind(kind: &str) -> StorageResult<String> {
    Ok(match kind {
        "about_you" => "tell_me_about_yourself",
        "future" => "future_looking",
        "behavioral" | "tell_me_about_yourself" | "technical" | "factual" | "future_looking" | "gap" | "motivation" => kind,
        other => return Err(StorageError::Invalid(format!("\"{other}\" is not a kind of question."))),
    }
    .to_string())
}

pub fn save_question(storage: &Storage, id: &str, input: QuestionInput) -> StorageResult<QuestionRec> {
    let rec = storage.application(id)?;
    let text = input.text.trim().to_string();
    if text.is_empty() {
        return Err(StorageError::Invalid("Write the question first.".into()));
    }
    let stage = rec.process.iter().find(|p| p.id == input.stage_id).ok_or_else(|| StorageError::NotFound(format!("stage {}", input.stage_id)))?;
    let kind = question_kind(&input.kind)?;
    let mut file = storage.load_application_part::<QuestionsFile>(id, "questions.json")?.unwrap_or_default();
    let saved = match &input.id {
        Some(qid) => {
            let q = file.questions.iter_mut().find(|q| &q.id == qid).ok_or_else(|| StorageError::NotFound(format!("question {qid}")))?;
            q.text = text;
            q.kind = kind;
            q.stage_id = stage.id.clone();
            q.stage = stage.stage.clone();
            q.edited_by_user = true;
            q.clone()
        }
        None => {
            let q = QuestionRec {
                id: file.new_id(),
                stage_id: stage.id.clone(),
                stage: stage.stage.clone(),
                text,
                kind,
                behavioral_situation: None,
                commitment_check: false,
                builder_operator_check: false,
                best_story_id: None,
                why: String::new(),
                requirement: None,
                source: "user".into(),
                edited_by_user: true,
            };
            file.questions.push(q.clone());
            q
        }
    };
    let order = |q: &QuestionRec| rec.process.iter().position(|p| p.id == q.stage_id).unwrap_or(usize::MAX);
    file.questions.sort_by_key(order);
    storage.save_application_part(id, "questions.json", &file)?;
    Ok(saved)
}

pub fn delete_question(storage: &Storage, id: &str, question_id: &str) -> StorageResult<()> {
    let mut file = storage.load_application_part::<QuestionsFile>(id, "questions.json")?.ok_or_else(|| StorageError::NotFound(format!("question {question_id}")))?;
    let before = file.questions.len();
    file.questions.retain(|q| q.id != question_id);
    if file.questions.len() == before {
        return Err(StorageError::NotFound(format!("question {question_id}")));
    }
    storage.save_application_part(id, "questions.json", &file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::providers::{AiError, Provider};
    use crate::scoring::run::testing::Scripted;
    use crate::scoring::run::Budget;
    use crate::storage::applications::{AppPatch, NewApplication, StageInput};
    use crate::storage::model::{Profile, ProofPoint, Usage};
    use chrono::NaiveDate;
    use serde_json::{json, Value};

    const KESTREL: &str = include_str!("../../tests/fixtures/jd/kestrel-pay.txt");
    const REPLY: &str = include_str!("../../tests/fixtures/jd/kestrel-pay.reply.json");
    const INJECTION: &str = include_str!("../../tests/fixtures/jd/injection.txt");

    fn story(id: &str, title: &str, headline: &str) -> Story {
        Story {
            id: id.into(),
            title: title.into(),
            employer: "Fernhill".into(),
            best_for: vec!["improving a metric".into()],
            direct_answer: "A story body that must not be sent with the index.".into(),
            context: "".into(),
            approach: "".into(),
            action: "".into(),
            ownership: "".into(),
            result: "".into(),
            proof_points: vec![ProofPoint { label: "activation_7d".into(), metric: "7-day activation".into(), before: "31".into(), after: "44".into(), unit: "%".into(), approximate: false, verified: true }],
            scale: "".into(),
            competencies: vec!["lifecycle strategy".into()],
            great_eight: vec!["retain_customers".into()],
            branches: vec![],
            verified: true,
            headline: headline.into(),
            usage: Usage::default(),
            year: None,
            angles: vec![],
        }
    }

    fn setup() -> (tempfile::TempDir, Storage, String) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        s.save_story(&story("st_onboarding", "Onboarding drop-off", "7-day activation 31% → 44%")).unwrap();
        s.save_story(&story("st_reactivation", "Reactivation program", "Reactivation 2.1% → 4.8%")).unwrap();
        s.save_profile(&Profile { name: "Dana".into(), full_name: "Dana Ortiz".into(), target_role: "Senior Lifecycle Marketing Manager".into(), seniority: "senior".into(), industry: "Fintech".into(), sells_to: "b2c".into(), identity_statement: "I find where activation breaks and build the fix.".into(), focus_habits: vec![] }).unwrap();
        let app = s.create_application(NewApplication { company: "Kestrel Pay".into(), role: "Senior Lifecycle Marketing Manager".into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        s.save_application_text(&app.id, "jd.txt", KESTREL).unwrap();
        (dir, s, app.id)
    }

    fn run(s: &Storage, id: &str, llm: &Scripted) -> JdResult {
        let mut budget = Budget::new(Provider::Claude, 0.0);
        analyse(s, Some(AiCtx { llm, budget: &mut budget }), id).unwrap()
    }

    fn reply(edit: impl FnOnce(&mut Value)) -> String {
        let mut v: Value = serde_json::from_str(REPLY).unwrap();
        edit(&mut v);
        v.to_string()
    }

    fn derived(s: &Storage, id: &str) -> DerivedAnalysis {
        s.load_application_part::<AnalysisFile>(id, "analysis.json").unwrap().unwrap().derived
    }

    fn questions(s: &Storage, id: &str) -> Vec<QuestionRec> {
        s.load_application_part::<QuestionsFile>(id, "questions.json").unwrap().unwrap().questions
    }

    // ---------- reading the posting with the engine ----------

    #[test]
    fn reading_the_posting_saves_the_analysis_and_the_questions_and_derives_what_the_overview_shows() {
        let (_d, s, id) = setup();
        let llm = Scripted::new(vec![Ok(REPLY)]);
        let out = run(&s, &id, &llm);
        assert_eq!((out.source.as_str(), out.notice.clone()), ("ai", None));
        let file = s.load_application_part::<AnalysisFile>(&id, "analysis.json").unwrap().unwrap();
        assert_eq!((file.prompt.as_str(), file.engine.as_str()), ("analyse-jd v2", "ai"));
        assert_eq!(file.raw.as_ref().unwrap()["summary"], serde_json::from_str::<Value>(REPLY).unwrap()["summary"], "the reply is kept as it was returned");
        let d = file.derived;
        assert_eq!(d.priorities.iter().map(|p| p.title.as_str()).collect::<Vec<_>>(), vec!["Keep customers", "Do more with less", "Win customers"]);
        assert_eq!(d.priorities[1].detail, "No ops team behind you: one person builds and runs lifecycle.");
        assert_eq!(d.beliefs.len(), 3);
        assert_eq!((d.beliefs[0].story_id.as_deref(), d.beliefs[0].covered), (None, false));
        assert_eq!(d.beliefs[0].why.as_deref(), Some("A story where you did the data, the build and the reporting yourself."), "no story fits, and it says what would");
        assert_eq!((d.beliefs[1].story_id.as_deref(), d.beliefs[1].covered), (Some("st_onboarding"), true));
        assert_eq!(d.beliefs[1].story, "Onboarding drop-off · 7-day activation 31% → 44%");
        assert_eq!(d.gaps, vec!["Push notifications at scale", "Hands-on SQL for cohort analysis"]);
        assert_eq!(d.echo[0], "\"first signup to the tenth payment\"");
        assert_eq!(d.echo.len(), 4);
        assert!(d.summary.starts_with("A founder-led payments startup needs one person"));
        assert_eq!(d.company_stage, "early_startup");
        let q = questions(&s, &id);
        assert_eq!(q.len(), 12, "ten questions and two gap questions");
        assert_eq!(out.question_count, 12);
        assert!(q.iter().all(|x| !x.id.is_empty() && !x.edited_by_user));
        assert_eq!(q.iter().filter(|x| x.kind == "gap").count(), 2);
        assert_eq!(q[0].stage_id, "stg_1");
        let leadership: Vec<&QuestionRec> = q.iter().filter(|x| x.stage_id == "stg_4").collect();
        assert_eq!(leadership.len(), 3);
        assert!(leadership.iter().any(|x| x.commitment_check) && leadership.iter().any(|x| x.builder_operator_check));
        assert_eq!(q.iter().find(|x| x.text.starts_with("Tell me about a time you found out")).unwrap().best_story_id.as_deref(), Some("st_onboarding"));
    }

    #[test]
    fn the_request_carries_the_profile_the_process_the_story_index_and_the_posting_as_data() {
        let (_d, s, id) = setup();
        let llm = Scripted::new(vec![Ok(REPLY)]);
        run(&s, &id, &llm);
        let seen = llm.seen.lock().unwrap();
        let user = &seen[0].user;
        assert!(user.contains("Process (stage order): recruiter, hiring_manager, panel, leadership"), "{user}");
        assert!(user.contains("<data name=\"job_description\">"));
        assert!(user.contains("founder-led payments startup"));
        assert!(user.contains("st_onboarding | Onboarding drop-off | improving a metric | lifecycle strategy | retain_customers | activation_7d"), "{user}");
        assert!(user.contains("target role: Senior Lifecycle Marketing Manager"));
        assert!(!user.contains("A story body that must not be sent"), "only the index goes, never the stories");
        assert!(!user.contains("marked this application as a startup"), "the flag is off");
        assert_eq!(seen[0].tier, crate::ai::llm::Tier::Strong, "reading a posting uses the stronger model");
    }

    #[test]
    fn the_startup_flag_tells_the_prompt() {
        let (_d, s, id) = setup();
        s.update_application(&id, AppPatch { startup: Some(true), ..Default::default() }).unwrap();
        let llm = Scripted::new(vec![Ok(REPLY)]);
        run(&s, &id, &llm);
        assert!(llm.seen.lock().unwrap()[0].user.contains("The candidate marked this application as a startup."));
    }

    #[test]
    fn a_story_the_model_made_up_is_not_trusted_and_a_phrase_that_is_not_in_the_posting_is_dropped() {
        let (_d, s, id) = setup();
        let r = reply(|v| {
            v["must_believe"][1]["best_story_id"] = json!("st_invented");
            v["questions"][3]["best_story_id"] = json!("st_invented");
            v["mirror_language"] = json!(["no ops team behind you", "synergy driven rockstar", "run the experiments"]);
        });
        run(&s, &id, &Scripted::new(vec![Ok(&r)]));
        let d = derived(&s, &id);
        assert_eq!((d.beliefs[1].story_id.as_deref(), d.beliefs[1].covered), (None, false));
        assert!(d.beliefs[1].why.is_some(), "an uncovered belief always says why");
        assert_eq!(d.echo, vec!["\"no ops team behind you\"", "\"run the experiments\""]);
        assert!(questions(&s, &id).iter().all(|q| q.best_story_id.as_deref() != Some("st_invented")));
    }

    #[test]
    fn the_model_can_turn_the_startup_flag_on_but_never_off_and_never_over_the_users_edit() {
        // Off, not edited: the model turns it on, and that is not an edit by the user.
        let (_d, s, id) = setup();
        let out = run(&s, &id, &Scripted::new(vec![Ok(REPLY)]));
        let a = s.application(&id).unwrap();
        assert!(a.startup && out.startup_turned_on);
        assert!(!a.is_edited("startup"));
        assert!(out.changed.iter().any(|c| c.contains("startup")), "{:?}", out.changed);
        // On, set by the user: a model that says "not a startup" cannot turn it off.
        let (_d2, s2, id2) = setup();
        s2.update_application(&id2, AppPatch { startup: Some(true), ..Default::default() }).unwrap();
        run(&s2, &id2, &Scripted::new(vec![Ok(&reply(|v| v["startup"] = json!(false)))]));
        assert!(s2.application(&id2).unwrap().startup);
        // On, then the user turned it off themselves: the model's yes does not overwrite that.
        let (_d3, s3, id3) = setup();
        s3.update_application(&id3, AppPatch { startup: Some(true), ..Default::default() }).unwrap();
        s3.update_application(&id3, AppPatch { startup: Some(false), ..Default::default() }).unwrap();
        let out = run(&s3, &id3, &Scripted::new(vec![Ok(REPLY)]));
        assert!(!s3.application(&id3).unwrap().startup && !out.startup_turned_on, "the edit wins");
    }

    // ---------- reading again keeps the user's edits ----------

    #[test]
    fn reading_again_keeps_what_the_user_edited_in_the_analysis_and_the_questions_and_says_what_changed() {
        let (_d, s, id) = setup();
        run(&s, &id, &Scripted::new(vec![Ok(REPLY)]));
        // The user rewrites the summary and the first priority, and one question; adds one of their own.
        let mut d = derived(&s, &id);
        d.summary = "My own summary.".into();
        d.priorities[0].title = "Keep new customers".into();
        save_analysis(&s, &id, d).unwrap();
        let file = s.load_application_part::<AnalysisFile>(&id, "analysis.json").unwrap().unwrap();
        assert_eq!(file.edited_by_user, vec!["summary", "priorities.0"]);
        let q1 = questions(&s, &id)[0].clone();
        save_question(&s, &id, QuestionInput { id: Some(q1.id.clone()), stage_id: q1.stage_id.clone(), text: "Give me two minutes on you.".into(), kind: q1.kind.clone() }).unwrap();
        let mine = save_question(&s, &id, QuestionInput { id: None, stage_id: "stg_3".into(), text: "What would you ask the design lead?".into(), kind: "behavioral".into() }).unwrap();
        assert!(mine.edited_by_user && mine.source == "user");
        // The posting is read again and the model sees it differently.
        let r2 = reply(|v| {
            v["summary"] = json!("A different reading of the role.");
            v["great_eight"][0]["why"] = json!("A different reason.");
            v["great_eight"][1]["why"] = json!("Another new reason.");
        });
        let out = run(&s, &id, &Scripted::new(vec![Ok(&r2)]));
        let d2 = derived(&s, &id);
        assert_eq!(d2.summary, "My own summary.", "the user's edit wins");
        assert_eq!(d2.priorities[0].title, "Keep new customers");
        assert_eq!(d2.priorities[0].detail, "Activation and early retention are reported to the founders every week.", "the edited item is kept whole");
        assert_eq!(d2.priorities[1].detail, "Another new reason.", "an item the user did not touch is filled from the new reading");
        assert!(out.kept.contains(&"analysis.summary".to_string()) && out.kept.contains(&"analysis.priorities.0".to_string()), "{:?}", out.kept);
        assert!(out.changed.iter().any(|c| c.to_lowercase().contains("what they likely need")), "{:?}", out.changed);
        let q = questions(&s, &id);
        assert_eq!(q.len(), 12 + 2, "the 12 new ones, the one the user rewrote and the one the user added");
        assert!(q.iter().any(|x| x.text == "Give me two minutes on you." && x.edited_by_user));
        assert!(q.iter().any(|x| x.id == mine.id));
        assert!(out.kept.iter().any(|k| k.contains("question")), "{:?}", out.kept);
    }

    #[test]
    fn a_question_can_be_removed_and_the_set_stays_in_stage_order() {
        let (_d, s, id) = setup();
        run(&s, &id, &Scripted::new(vec![Ok(REPLY)]));
        let before = questions(&s, &id);
        delete_question(&s, &id, &before[2].id).unwrap();
        assert_eq!(questions(&s, &id).len(), before.len() - 1);
        assert!(delete_question(&s, &id, "q_999").is_err());
        assert!(save_question(&s, &id, QuestionInput { id: None, stage_id: "stg_99".into(), text: "x".into(), kind: "behavioral".into() }).is_err(), "the stage has to exist");
        assert!(save_question(&s, &id, QuestionInput { id: None, stage_id: "stg_1".into(), text: "  ".into(), kind: "behavioral".into() }).is_err());
    }

    #[test]
    fn questions_land_on_a_stage_the_process_has_even_when_the_model_names_one_it_does_not() {
        let (_d, s, id) = setup();
        let stages = vec![
            StageInput { id: Some("stg_1".into()), stage: "recruiter".into(), label: "Recruiter".into(), at: None },
            StageInput { id: Some("stg_3".into()), stage: "panel".into(), label: "Panel".into(), at: None },
            StageInput { id: None, stage: "panel".into(), label: "Second panel".into(), at: None },
        ];
        s.save_process(&id, stages, true).unwrap();
        run(&s, &id, &Scripted::new(vec![Ok(REPLY)]));
        let q = questions(&s, &id);
        let on = |starts: &str| q.iter().find(|x| x.text.starts_with(starts)).unwrap().stage_id.clone();
        assert_eq!(on("Tell me about a time you disagreed"), "stg_3", "a panel question goes to the first panel");
        assert_eq!(on("Tell me about a time you found out"), "stg_1", "no hiring manager stage: the first stage");
        assert_eq!(on("Why a 40-person startup"), "stg_1", "no leadership stage: the first stage");
        let process: Vec<String> = s.application(&id).unwrap().process.iter().map(|p| p.id.clone()).collect();
        assert!(q.iter().all(|x| process.contains(&x.stage_id)));
    }

    // ---------- how the posting fits the targets ----------

    fn second_target(s: &Storage) -> crate::storage::targets::Target {
        s.save_target(&crate::storage::targets::Target { role: "Marketing Operations Manager".into(), role_family: "marketing_ops".into(), sells_to: "b2b".into(), ..Default::default() }).unwrap()
    }

    #[test]
    fn reading_the_posting_saves_how_it_fits_each_target_on_the_application_and_returns_it() {
        let (_d, s, id) = setup();
        let ops = second_target(&s);
        let first = s.targets().unwrap().remove(0);
        let out = analyse(&s, None, &id).unwrap();
        let fit = out.target_fit.clone().expect("a fit");
        assert_eq!(fit.per_target.len(), 2);
        assert_eq!(fit.role_family, "lifecycle");
        assert_eq!(fit.best_target_id.as_deref(), Some(first.id.as_str()), "a lifecycle title fits the lifecycle target better than {}", ops.id);
        assert_eq!(s.application(&id).unwrap().target_fit, Some(fit), "saved on the application as target_fit");
    }

    #[test]
    fn the_fit_is_also_saved_when_the_engine_read_the_posting_and_when_there_are_no_targets_there_is_none() {
        let (_d, s, id) = setup();
        let llm = Scripted::new(vec![Ok(REPLY)]);
        let out = run(&s, &id, &llm);
        assert!(out.target_fit.is_some());
        let dir = tempfile::tempdir().unwrap();
        let bare = Storage::init(dir.path().join("data")).unwrap();
        let app = bare.create_application(NewApplication { company: "K".into(), role: "Growth Manager".into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        bare.save_application_text(&app.id, "jd.txt", KESTREL).unwrap();
        let out = analyse(&bare, None, &app.id).unwrap();
        assert_eq!(out.target_fit, None);
        assert_eq!(bare.application(&app.id).unwrap().target_fit, None);
    }

    #[test]
    fn a_reading_that_failed_after_an_engine_reading_keeps_the_saved_fit() {
        let (_d, s, id) = setup();
        let ok = Scripted::new(vec![Ok(REPLY)]);
        let first = run(&s, &id, &ok).target_fit;
        let down = Scripted::new(vec![Err(AiError::Unavailable("down".into()))]);
        let out = run(&s, &id, &down);
        assert_eq!(out.source, "unchanged");
        assert_eq!(out.target_fit, first);
    }

    #[test]
    fn the_reading_uses_the_role_of_the_applications_target_not_the_active_one() {
        let (_d, s, id) = setup();
        let ops = second_target(&s);
        s.set_active_target(&ops.id).unwrap();
        // The application is filed under the lifecycle target (target one) while the active one is marketing ops.
        let llm = Scripted::new(vec![Ok(REPLY)]);
        run(&s, &id, &llm);
        let seen = llm.seen.lock().unwrap();
        assert!(seen[0].user.contains("Senior Lifecycle Marketing Manager") && !seen[0].user.contains("Marketing Operations Manager"), "{}", seen[0].user);
    }

    // ---------- another target, other questions ----------

    #[test]
    fn making_the_questions_again_for_another_target_keeps_the_ones_the_user_wrote_or_changed() {
        let (_d, s, id) = setup();
        analyse(&s, None, &id).unwrap();
        let mine = save_question(&s, &id, QuestionInput { id: None, stage_id: "stg_1".into(), kind: "behavioral".into(), text: "My own question about Kestrel?".into() }).unwrap();
        let ops = second_target(&s);
        s.update_application(&id, AppPatch { target_id: Some(ops.id.clone()), ..Default::default() }).unwrap();
        let analysis_before = s.load_application_part::<AnalysisFile>(&id, "analysis.json").unwrap().unwrap();
        let n = rebuild_questions(&s, None, &id).unwrap().unwrap();
        let q = questions(&s, &id);
        assert_eq!(n, q.len());
        assert!(q.iter().any(|x| x.id == mine.id && x.edited_by_user && x.text == "My own question about Kestrel?"), "the user's question stays");
        assert!(q.iter().filter(|x| !x.edited_by_user).all(|x| x.source == "bank"));
        assert_eq!(s.load_application_part::<AnalysisFile>(&id, "analysis.json").unwrap().unwrap(), analysis_before, "the reading of the posting is not touched without an engine");
    }

    #[test]
    fn making_the_questions_again_with_the_engine_reads_the_posting_again_for_the_new_target() {
        let (_d, s, id) = setup();
        let ops = second_target(&s);
        s.update_application(&id, AppPatch { target_id: Some(ops.id.clone()), ..Default::default() }).unwrap();
        let llm = Scripted::new(vec![Ok(REPLY)]);
        let mut budget = Budget::new(Provider::Claude, 0.0);
        let n = rebuild_questions(&s, Some(AiCtx { llm: &llm, budget: &mut budget }), &id).unwrap().unwrap();
        assert_eq!(n, 12);
        assert!(llm.seen.lock().unwrap()[0].user.contains("Marketing Operations Manager"), "the new target's role is what the reading is told");
        assert!(questions(&s, &id).iter().all(|q| q.source != "bank"));
    }

    #[test]
    fn with_no_posting_there_is_nothing_to_make_questions_from() {
        let (_d, s, id) = setup();
        s.remove_application_file(&id, "jd.txt").unwrap();
        assert_eq!(rebuild_questions(&s, None, &id).unwrap(), None);
        assert!(s.load_application_part::<QuestionsFile>(&id, "questions.json").unwrap().is_none());
    }

    // ---------- no engine, or an engine that fails ----------

    #[test]
    fn without_an_engine_the_posting_is_read_by_keywords_with_generic_questions_and_it_says_so() {
        let (_d, s, id) = setup();
        let out = analyse(&s, None, &id).unwrap();
        assert_eq!(out.source, "keywords");
        let notice = out.notice.clone().unwrap();
        assert!(notice.contains("keywords") && notice.contains("general set"), "{notice}");
        let file = s.load_application_part::<AnalysisFile>(&id, "analysis.json").unwrap().unwrap();
        assert_eq!((file.engine.as_str(), file.prompt.as_str()), ("keywords", "keywords"));
        assert!(file.raw.is_none());
        let d = file.derived;
        assert!(d.summary.starts_with("Kestrel Pay is a 40-person, founder-led payments startup."), "{}", d.summary);
        assert!(d.stage_evidence.contains("Braze, Segment, SQL"), "{}", d.stage_evidence);
        assert_eq!(d.priorities[0].title, "Keep customers");
        assert!(d.priorities.len() <= 3);
        assert!(d.echo.iter().any(|e| e.to_lowercase().contains("early retention")), "{:?}", d.echo);
        assert!(d.gaps.iter().any(|g| g.starts_with("Braze")) && d.gaps.iter().any(|g| g.starts_with("SQL")), "tools no story mentions: {:?}", d.gaps);
        assert!(d.beliefs.is_empty(), "the three beliefs need the engine");
        let q = questions(&s, &id);
        assert_eq!(q.len(), 12);
        assert!(q.iter().all(|x| x.source == "bank"));
        assert!(q.iter().filter(|x| x.stage_id == "stg_1").any(|x| x.kind == "factual"), "the recruiter stage asks about logistics");
        let ids: std::collections::HashSet<&str> = q.iter().map(|x| x.text.as_str()).collect();
        assert_eq!(ids.len(), q.len(), "no question twice");
        assert!(s.application(&id).unwrap().startup, "the posting says founder-led, which turns the founder variant on");
        let leadership: Vec<&QuestionRec> = q.iter().filter(|x| x.stage_id == "stg_4").collect();
        assert!(leadership.iter().any(|x| x.commitment_check) && leadership.iter().any(|x| x.builder_operator_check), "founder questions on a startup's leadership stage");
    }

    #[test]
    fn a_posting_that_is_not_a_startup_gets_no_founder_questions_without_an_engine() {
        let (_d, s, id) = setup();
        s.save_application_text(&id, "jd.txt", "Lifecycle Marketing Manager at a large retail bank. You will own onboarding emails and report monthly to the head of growth. SQL is useful.").unwrap();
        analyse(&s, None, &id).unwrap();
        assert!(!s.application(&id).unwrap().startup);
        let bank = crate::applications::question_bank::banks_for("Lifecycle");
        let founder: Vec<&str> = bank.iter().filter(|b| b.founder_variant == Some(true)).map(|b| b.text.as_str()).collect();
        assert!(questions(&s, &id).iter().all(|q| !founder.contains(&q.text.as_str())));
    }

    #[test]
    fn when_the_engine_cannot_be_reached_the_keyword_reading_is_used_and_the_reason_is_in_the_notice() {
        let (_d, s, id) = setup();
        let llm = Scripted::new(vec![Err(AiError::Unavailable("Claude didn't accept the API key. Check it in Settings › AI.".into()))]);
        let out = run(&s, &id, &llm);
        assert_eq!(out.source, "keywords");
        let notice = out.notice.unwrap();
        assert!(notice.contains("Claude didn't accept the API key") && notice.contains("keywords"), "{notice}");
        assert!(!notice.contains("timing only"), "this is not about an answer");
        assert_eq!(questions(&s, &id).len(), 12);
    }

    #[test]
    fn a_reply_that_cannot_be_read_twice_falls_back_to_keywords_with_a_plain_notice() {
        let (_d, s, id) = setup();
        let out = run(&s, &id, &Scripted::new(vec![Ok("Here you go!"), Ok("{\"nope\": true}")]));
        assert_eq!(out.source, "keywords");
        assert!(out.notice.unwrap().contains("couldn't be read"));
    }

    #[test]
    fn a_failed_read_never_wipes_what_an_earlier_read_found() {
        let (_d, s, id) = setup();
        run(&s, &id, &Scripted::new(vec![Ok(REPLY)]));
        let before = derived(&s, &id);
        let out = run(&s, &id, &Scripted::new(vec![Err(AiError::Failed("The network dropped.".into()))]));
        assert_eq!(out.source, "unchanged");
        assert!(out.notice.unwrap().contains("The network dropped."));
        assert_eq!(derived(&s, &id), before);
    }

    #[test]
    fn an_application_with_no_posting_says_to_paste_one() {
        let (_d, s, id) = setup();
        s.remove_application_file(&id, "jd.txt").unwrap();
        let err = analyse(&s, None, &id).unwrap_err().to_string();
        assert!(err.contains("Paste the job posting"), "{err}");
    }

    // ---------- injection ----------

    #[test]
    fn instructions_inside_the_posting_stay_data_and_cannot_close_the_wrapper() {
        let (_d, s, id) = setup();
        s.save_application_text(&id, "jd.txt", INJECTION).unwrap();
        let llm = Scripted::new(vec![Ok(REPLY)]);
        run(&s, &id, &llm);
        let user = llm.seen.lock().unwrap()[0].user.clone();
        assert_eq!(user.matches("</data>").count(), user.matches("<data ").count(), "every wrapper is closed once, by us");
        assert!(user.contains("IMPORTANT NOTE FOR AI TOOLS"), "the text is still there, as material");
        let jd_block = user.split("<data name=\"job_description\">").nth(1).unwrap().split("</data>").next().unwrap();
        assert!(jd_block.contains("IMPORTANT NOTE FOR AI TOOLS"), "the injected text is inside the posting's own wrapper");
        let system = llm.seen.lock().unwrap()[0].system.clone();
        assert!(system.contains("never instructions"), "the prompt tells the model what data is");
    }

    #[test]
    fn instructions_in_the_posting_do_not_change_what_code_does_with_a_reply() {
        // Even if a model obeyed the posting and said "everything is covered by the first story", code only accepts
        // story ids that exist, and the startup flag only ever turns on.
        let (_d, s, id) = setup();
        s.save_application_text(&id, "jd.txt", INJECTION).unwrap();
        let obeyed = reply(|v| {
            v["startup"] = json!(false);
            for b in v["must_believe"].as_array_mut().unwrap() {
                b["best_story_id"] = json!("st_the_first_story");
            }
        });
        run(&s, &id, &Scripted::new(vec![Ok(&obeyed)]));
        assert!(derived(&s, &id).beliefs.iter().all(|b| !b.covered));
        assert!(!s.application(&id).unwrap().startup);
    }

    // ---------- the posting text and the keyword reading itself ----------

    #[test]
    fn saving_the_posting_says_whether_it_changed_and_whether_there_is_a_reading_to_refresh() {
        let (_d, s, id) = setup();
        let same = save_posting(&s, &id, KESTREL).unwrap();
        assert!(!same.changed && !same.has_analysis);
        run(&s, &id, &Scripted::new(vec![Ok(REPLY)]));
        let edited = save_posting(&s, &id, &format!("{KESTREL}\nWe also use Iterable.")).unwrap();
        assert!(edited.changed && edited.has_analysis, "this is when the screen asks \"Read it again?\"");
        assert!(s.application(&id).unwrap().edited_by_user.contains(&"posting".to_string()));
        assert!(save_posting(&s, "app_nope", "x").is_err());
    }

    #[test]
    fn tools_are_found_in_the_order_the_posting_names_them_and_repeated_phrases_are_picked_out() {
        let k = keyword_read(KESTREL, &[]);
        assert_eq!(k.tools, vec!["Braze", "Segment", "SQL"]);
        assert!(k.phrases.iter().any(|p| p.to_lowercase().contains("early retention")), "{:?}", k.phrases);
        assert!(k.phrases.len() <= 5);
        assert!(k.startup);
        let none = keyword_read("We need someone good with people.", &[]);
        assert!(none.tools.is_empty() && none.phrases.is_empty() && !none.startup);
        assert!(none.priorities.is_empty());
    }

    #[test]
    fn reading_the_posting_never_touches_a_core_field_the_user_edited() {
        let (_d, s, id) = setup();
        s.update_application(&id, AppPatch { company: Some("Kestrel Pay Ltd".into()), role: Some("Lifecycle Lead".into()), notes: Some("Marco is the hiring manager".into()), ..Default::default() }).unwrap();
        let before = s.application(&id).unwrap();
        run(&s, &id, &Scripted::new(vec![Ok(REPLY)]));
        run(&s, &id, &Scripted::new(vec![Ok(&reply(|v| v["summary"] = json!("Again.")))]));
        let after = s.application(&id).unwrap();
        assert_eq!((after.company.as_str(), after.role.as_str(), after.notes.as_str()), ("Kestrel Pay Ltd", "Lifecycle Lead", "Marco is the hiring manager"));
        assert_eq!(after.edited_by_user, before.edited_by_user, "reading adds nothing to what the user edited");
        assert_eq!(after.process, before.process);
    }
}
