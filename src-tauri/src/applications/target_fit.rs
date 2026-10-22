//! How a posting fits each target when no engine can read it (the keyword fallback for prompt 09's `target_fit`), and the
//! draft of a new target from a posting. Nothing here writes a pitch: when a draft needs one it is copied from the closest
//! target and flagged, so the screen can ask for a rewrite.

use crate::storage::applications::AppRecord;
use crate::storage::targets::{role_family_of, target_name, color_for, FitRow, Target, TargetFit};
use crate::storage::{Result as StorageResult, Storage};
use serde::Serialize;

/// What the posting words say the job is.
#[derive(Debug, Clone, PartialEq)]
pub struct Guess {
    pub sells_to: &'static str,
    pub role_family: &'static str,
    pub seniority: &'static str,
}

const B2B_WORDS: [&str; 12] = ["b2b", "saas", "enterprise", "businesses", "account-based", "abm", "pipeline", "mql", "sales team", "sales and marketing", "buyers", "demand gen"];
const B2C_WORDS: [&str; 11] = ["b2c", "consumer", "subscriber", "shopper", "e-commerce", "ecommerce", "retail", "mobile app", "members", "gamers", "patients"];

const LEVELS: [&str; 5] = ["early", "mid", "senior", "lead", "director"];

fn has_word(hay: &str, word: &str) -> bool {
    hay.match_indices(word).any(|(i, _)| {
        let before = hay[..i].chars().next_back();
        before.is_none_or(|c| !c.is_alphanumeric())
    })
}

fn level_of(title: &str) -> &'static str {
    let t = title.to_lowercase();
    let any = |words: &[&str]| words.iter().any(|w| has_word(&t, w));
    if any(&["director", "vp", "vice president", "head of", "chief", "cmo"]) {
        "director"
    } else if any(&["lead", "principal", "staff", "group"]) {
        "lead"
    } else if any(&["senior", "sr", "sr."]) {
        "senior"
    } else if any(&["coordinator", "associate", "junior", "jr", "intern", "assistant", "entry"]) {
        "early"
    } else {
        "mid"
    }
}

fn head(jd: &str, n: usize) -> String {
    jd.chars().take(n).collect()
}

/// What the posting words say the job is: who it sells to (both when it names both or neither), the kind of role (from the
/// title, else the start of the posting) and the level (from the title). A guess from keywords, not a reading.
pub fn guess(role: &str, jd: &str) -> Guess {
    let lower = jd.to_lowercase();
    let b2b = B2B_WORDS.iter().any(|w| has_word(&lower, w));
    let b2c = B2C_WORDS.iter().any(|w| has_word(&lower, w));
    let sells_to = match (b2b, b2c) {
        (true, false) => "b2b",
        (false, true) => "b2c",
        _ => "both",
    };
    let title = if role.trim().is_empty() { head(jd, 100) } else { role.to_string() };
    let family = match role_family_of(role) {
        "other" => role_family_of(&head(jd, 200)),
        known => known,
    };
    Guess { sells_to, role_family: family, seniority: level_of(&title) }
}

fn family_words(family: &str) -> &'static str {
    match family {
        "lifecycle" => "lifecycle",
        "marketing_ops" => "marketing ops",
        "growth" => "growth",
        "product_marketing" => "product marketing",
        _ => "another kind of role",
    }
}

fn customers_words(sells_to: &str) -> &'static str {
    match sells_to {
        "b2b" => "businesses",
        "b2c" => "consumers",
        _ => "businesses and consumers",
    }
}

fn level_index(level: &str) -> i32 {
    LEVELS.iter().position(|l| *l == level).unwrap_or(1) as i32
}

struct Rated {
    score: u32,
    fit: &'static str,
    why: String,
}

fn rate(g: &Guess, t: &Target) -> Rated {
    let (family, family_text) = if g.role_family == t.role_family && g.role_family != "other" {
        (2, "the same kind of role")
    } else if g.role_family == "other" || t.role_family == "other" {
        (1, "a role kind that is not clear")
    } else {
        (0, "a different kind of role")
    };
    let (sells, sells_text) = if g.sells_to == t.sells_to || g.sells_to == "both" || t.sells_to == "both" { (1, "customers that fit") } else { (0, "different customers") };
    let gap = (level_index(g.seniority) - level_index(&t.seniority)).abs();
    let (level, level_text) = match gap {
        0 => (1, "the same level"),
        1 => (1, "a level one step away"),
        _ => (0, "a level far apart"),
    };
    let score = family + sells + level;
    let fit = if family == 0 || score < 3 { "weak" } else if score >= 4 { "strong" } else { "ok" };
    let mut why = format!("{family_text}, {sells_text}, {level_text}.");
    why[..1].make_ascii_uppercase();
    Rated { score, fit, why }
}

/// The posting against every target that is not archived. `None` when there is no such target. `filed` is the target the
/// application is filed under: it wins a tie and gets the notes on where it does not match.
pub fn keyword_fit(rec: &AppRecord, jd: &str, targets: &[Target], filed: Option<&str>) -> Option<TargetFit> {
    let live: Vec<&Target> = targets.iter().filter(|t| !t.archived).collect();
    if live.is_empty() {
        return None;
    }
    let g = guess(&rec.role, jd);
    let rated: Vec<(&Target, Rated)> = live.iter().map(|t| (*t, rate(&g, t))).collect();
    let top = rated.iter().map(|(_, r)| r.score).max().unwrap_or(0);
    let best = rated.iter().filter(|(_, r)| r.score == top && r.fit != "weak").map(|(t, _)| *t).find(|t| Some(t.id.as_str()) == filed).or_else(|| rated.iter().find(|(_, r)| r.score == top && r.fit != "weak").map(|(t, _)| *t));
    let mut notes = vec![];
    if let Some(f) = filed.and_then(|id| live.iter().find(|t| t.id == id)) {
        if g.role_family != "other" && f.role_family != "other" && g.role_family != f.role_family {
            notes.push(format!("The role reads as {}; {} is set up for {}.", family_words(g.role_family), f.name, family_words(&f.role_family)));
        }
        if g.sells_to != "both" && f.sells_to != "both" && g.sells_to != f.sells_to {
            notes.push(format!("The posting sells to {}; {} is set up for {}.", customers_words(g.sells_to), f.name, customers_words(&f.sells_to)));
        }
        if (level_index(g.seniority) - level_index(&f.seniority)).abs() > 1 {
            notes.push(format!("The level reads as {}; {} is set up for {}.", g.seniority, f.name, f.seniority));
        }
    }
    Some(TargetFit {
        sells_to: g.sells_to.into(),
        role_family: g.role_family.into(),
        seniority: g.seniority.into(),
        best_target_id: best.map(|t| t.id.clone()),
        mismatch_notes: notes,
        per_target: rated.into_iter().map(|(t, r)| FitRow { target_id: t.id.clone(), fit: r.fit.into(), why: r.why }).collect(),
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct TargetDraft {
    pub target: Target,
    #[serde(rename = "pitchCopied")]
    pub pitch_copied: bool,
}

fn rank(fit: &TargetFit, id: &str) -> u8 {
    match fit.per_target.iter().find(|p| p.target_id == id).map(|p| p.fit.as_str()) {
        Some("strong") => 3,
        Some("ok") => 2,
        _ => 1,
    }
}

/// A new target filled in from an application's posting, not saved. The role, kind of role, level and customers are what
/// the posting reads as (the fit saved on the application, else a keyword guess); the industry, stage and stages come
/// from the closest existing target, whose pitch is copied and flagged: Ensayo never writes a pitch.
pub fn target_from_posting(storage: &Storage, application_id: &str) -> StorageResult<TargetDraft> {
    let rec = storage.application(application_id)?;
    let jd = storage.application_text(application_id, "jd.txt")?.unwrap_or_default();
    let targets = storage.targets()?;
    let filed = storage.application_target(&rec)?;
    let fit = rec.target_fit.clone().or_else(|| keyword_fit(&rec, &jd, &targets, filed.as_deref()));
    let live: Vec<&Target> = targets.iter().filter(|t| !t.archived).collect();
    let closest: Option<&Target> = match &fit {
        Some(f) => f
            .best_target_id
            .as_deref()
            .and_then(|id| live.iter().find(|t| t.id == id))
            .or_else(|| live.iter().max_by_key(|t| (rank(f, &t.id), std::cmp::Reverse(live.iter().position(|x| x.id == t.id)))))
            .copied(),
        None => filed.as_deref().and_then(|id| live.iter().find(|t| t.id == id)).or(live.first()).copied(),
    };
    let g = guess(&rec.role, &jd);
    let (sells_to, family, seniority) = match &fit {
        Some(f) => (f.sells_to.clone(), f.role_family.clone(), f.seniority.clone()),
        None => (g.sells_to.to_string(), g.role_family.to_string(), g.seniority.to_string()),
    };
    let role = if rec.role.trim().is_empty() { closest.map(|t| t.role.clone()).unwrap_or_default() } else { rec.role.trim().to_string() };
    let base = Target::default();
    let target = Target {
        id: String::new(),
        name: target_name(&role, &sells_to, &family),
        color: color_for(targets.len()).into(),
        role,
        role_family: family,
        seniority,
        sells_to,
        company_stage: if rec.startup { "startup".into() } else { closest.map(|t| t.company_stage.clone()).unwrap_or(base.company_stage) },
        industry: closest.map(|t| t.industry.clone()).unwrap_or_default(),
        pitch: closest.map(|t| t.pitch.clone()).unwrap_or_default(),
        default_process: closest.map(|t| t.default_process.clone()).filter(|p| !p.is_empty()).unwrap_or(base.default_process),
        created_at: crate::storage::applications::stamp(),
        ..Target::default()
    };
    let pitch_copied = !target.pitch.trim().is_empty();
    Ok(TargetDraft { target, pitch_copied })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::applications::NewApplication;
    use crate::storage::targets::DEFAULT_TARGET_PROCESS;
    use chrono::NaiveDate;

    const B2B_OPS: &str = "Senior Marketing Operations Manager at Northpine. You will own our marketing automation platform and lead scoring, keep the pipeline clean for the sales team, and report on MQL to opportunity for our B2B SaaS enterprise accounts.";
    const B2C_LIFECYCLE: &str = "Lifecycle Marketing Manager. Grow retention and activation for millions of consumers on our mobile app, with push, email and in-app messages to subscribers.";

    fn target(id: &str, role: &str, family: &str, sells_to: &str, seniority: &str) -> Target {
        Target { id: id.into(), name: id.into(), role: role.into(), role_family: family.into(), sells_to: sells_to.into(), seniority: seniority.into(), pitch: format!("pitch of {id}"), industry: "Fintech".into(), created_at: "2026-10-01T00:00:00Z".into(), ..Target::default() }
    }

    fn rec(role: &str) -> AppRecord {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("d")).unwrap();
        s.create_application(NewApplication { company: "Northpine".into(), role: role.into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap()
    }

    #[test]
    fn the_posting_words_say_who_the_job_sells_to_what_kind_of_role_it_is_and_the_level() {
        let g = guess("Senior Marketing Operations Manager", B2B_OPS);
        assert_eq!(g, Guess { sells_to: "b2b", role_family: "marketing_ops", seniority: "senior" });
        let g = guess("Lifecycle Marketing Manager", B2C_LIFECYCLE);
        assert_eq!(g, Guess { sells_to: "b2c", role_family: "lifecycle", seniority: "mid" });
    }

    #[test]
    fn a_posting_that_names_both_kinds_of_customer_or_neither_reads_as_both() {
        assert_eq!(guess("Growth Manager", "We sell to consumers and to enterprise buyers on a b2b plan.").sells_to, "both");
        assert_eq!(guess("Growth Manager", "Own acquisition and report weekly.").sells_to, "both");
    }

    #[test]
    fn level_comes_from_the_title() {
        for (role, level) in [("Marketing Coordinator", "early"), ("Associate Lifecycle Manager", "early"), ("Lifecycle Manager", "mid"), ("Senior Lifecycle Manager", "senior"), ("Lead CRM Manager", "lead"), ("Principal Marketing Manager", "lead"), ("Head of Lifecycle", "director"), ("Director of Growth", "director"), ("VP Marketing", "director")] {
            assert_eq!(guess(role, "").seniority, level, "{role}");
        }
    }

    #[test]
    fn the_family_falls_back_to_the_start_of_the_posting_when_the_title_says_nothing() {
        assert_eq!(guess("", "Marketing Operations Manager. You will own the stack.").role_family, "marketing_ops");
        assert_eq!(guess("Marketing Manager", "Plain words.").role_family, "other");
    }

    #[test]
    fn each_target_is_rated_and_the_closest_one_is_the_best() {
        let lifecycle = target("tg_life", "Senior Lifecycle Marketing Manager", "lifecycle", "b2c", "senior");
        let ops = target("tg_ops", "Marketing Operations Manager", "marketing_ops", "b2b", "senior");
        let fit = keyword_fit(&rec("Senior Marketing Operations Manager"), B2B_OPS, &[lifecycle.clone(), ops.clone()], Some("tg_life")).unwrap();
        assert_eq!((fit.sells_to.as_str(), fit.role_family.as_str(), fit.seniority.as_str()), ("b2b", "marketing_ops", "senior"));
        assert_eq!(fit.best_target_id.as_deref(), Some("tg_ops"));
        let by_id = |id: &str| fit.per_target.iter().find(|p| p.target_id == id).unwrap().clone();
        assert_eq!(by_id("tg_ops").fit, "strong");
        assert_eq!(by_id("tg_life").fit, "weak");
        assert!(!by_id("tg_ops").why.is_empty() && !by_id("tg_life").why.is_empty());
        assert_eq!(fit.per_target.len(), 2);
        let again = keyword_fit(&rec("Lifecycle Marketing Manager"), B2C_LIFECYCLE, &[lifecycle, ops], Some("tg_life")).unwrap();
        assert_eq!(again.best_target_id.as_deref(), Some("tg_life"));
    }

    #[test]
    fn a_target_that_sells_to_both_fits_any_kind_of_posting() {
        let both = target("tg_both", "Lifecycle Marketing Manager", "lifecycle", "both", "mid");
        let fit = keyword_fit(&rec("Lifecycle Marketing Manager"), B2B_OPS.replace("Operations", "Lifecycle").as_str(), &[both], None).unwrap();
        assert_ne!(fit.per_target[0].fit, "weak", "{:?}", fit.per_target);
    }

    #[test]
    fn a_level_one_step_away_still_fits_but_two_steps_does_not_make_it_strong() {
        let mid = target("tg_mid", "Lifecycle Manager", "lifecycle", "b2c", "mid");
        let senior_posting = keyword_fit(&rec("Senior Lifecycle Manager"), B2C_LIFECYCLE, &[mid.clone()], None).unwrap();
        assert_eq!(senior_posting.per_target[0].fit, "strong");
        let director_posting = keyword_fit(&rec("Director of Lifecycle"), B2C_LIFECYCLE, &[mid], None).unwrap();
        assert_ne!(director_posting.per_target[0].fit, "strong");
    }

    #[test]
    fn when_nothing_fits_there_is_no_best_target() {
        let growth = target("tg_g", "Head of Growth", "growth", "b2b", "director");
        let fit = keyword_fit(&rec("Lifecycle Marketing Manager"), B2C_LIFECYCLE, &[growth], None).unwrap();
        assert_eq!(fit.best_target_id, None);
        assert_eq!(fit.per_target[0].fit, "weak");
    }

    #[test]
    fn archived_targets_are_left_out_and_with_none_left_there_is_no_fit() {
        let mut archived = target("tg_old", "Lifecycle Manager", "lifecycle", "b2c", "mid");
        archived.archived = true;
        let live = target("tg_live", "Lifecycle Manager", "lifecycle", "b2c", "mid");
        let fit = keyword_fit(&rec("Lifecycle Manager"), B2C_LIFECYCLE, &[archived.clone(), live], None).unwrap();
        assert_eq!(fit.per_target.iter().map(|p| p.target_id.as_str()).collect::<Vec<_>>(), vec!["tg_live"]);
        assert!(keyword_fit(&rec("Lifecycle Manager"), B2C_LIFECYCLE, &[archived], None).is_none());
        assert!(keyword_fit(&rec("Lifecycle Manager"), B2C_LIFECYCLE, &[], None).is_none());
    }

    #[test]
    fn a_tie_goes_to_the_target_the_application_is_filed_under_then_the_first() {
        let a = target("tg_a", "Lifecycle Manager", "lifecycle", "b2c", "mid");
        let b = target("tg_b", "Lifecycle Manager", "lifecycle", "b2c", "mid");
        let r = rec("Lifecycle Manager");
        assert_eq!(keyword_fit(&r, B2C_LIFECYCLE, &[a.clone(), b.clone()], Some("tg_b")).unwrap().best_target_id.as_deref(), Some("tg_b"));
        assert_eq!(keyword_fit(&r, B2C_LIFECYCLE, &[a, b], None).unwrap().best_target_id.as_deref(), Some("tg_a"));
    }

    #[test]
    fn the_notes_say_in_plain_words_where_the_filed_target_does_not_match() {
        let life = target("tg_life", "Lifecycle Manager", "lifecycle", "b2c", "mid");
        let fit = keyword_fit(&rec("Senior Marketing Operations Manager"), B2B_OPS, &[life], Some("tg_life")).unwrap();
        assert!(fit.mismatch_notes.len() >= 2, "{:?}", fit.mismatch_notes);
        assert!(fit.mismatch_notes.iter().any(|n| n.contains("marketing ops") && n.contains("tg_life")), "{:?}", fit.mismatch_notes);
        assert!(fit.mismatch_notes.iter().any(|n| n.contains("businesses")), "{:?}", fit.mismatch_notes);
        assert!(fit.mismatch_notes.iter().all(|n| !n.contains('\u{2014}')));
        let ops = target("tg_ops", "Marketing Operations Manager", "marketing_ops", "b2b", "senior");
        assert!(keyword_fit(&rec("Senior Marketing Operations Manager"), B2B_OPS, &[ops], Some("tg_ops")).unwrap().mismatch_notes.is_empty());
    }

    // ---------- a new target from a posting ----------

    fn setup() -> (tempfile::TempDir, Storage, Target, String) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("d")).unwrap();
        let first = s
            .save_target(&Target { role: "Senior Lifecycle Marketing Manager".into(), role_family: "lifecycle".into(), sells_to: "b2c".into(), industry: "Fintech".into(), pitch: "I find where activation breaks and build the fix.".into(), default_process: vec!["recruiter".into(), "panel".into()], ..Target::default() })
            .unwrap();
        s.save_you(&crate::storage::targets::You { name: "Dana".into(), full_name: "".into(), focus_habits: vec![], active_target_id: Some(first.id.clone()), targets_note_pending: false }).unwrap();
        let app = s.create_application(NewApplication { company: "Northpine".into(), role: "Senior Marketing Operations Manager".into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        s.save_application_text(&app.id, "jd.txt", B2B_OPS).unwrap();
        (dir, s, first, app.id)
    }

    #[test]
    fn a_draft_from_a_posting_is_filled_from_what_the_posting_reads_as_and_is_not_saved() {
        let (_d, s, _first, app) = setup();
        let draft = target_from_posting(&s, &app).unwrap();
        let t = &draft.target;
        assert_eq!(t.id, "", "a draft has no id until it is saved");
        assert_eq!((t.role.as_str(), t.role_family.as_str(), t.sells_to.as_str(), t.seniority.as_str()), ("Senior Marketing Operations Manager", "marketing_ops", "b2b", "senior"));
        assert_eq!(t.name, "B2B marketing ops");
        assert_eq!(t.industry, "Fintech", "from the closest target");
        assert_eq!(t.default_process, vec!["recruiter", "panel"]);
        assert!(t.lead_with.is_empty() && t.pinned_story_ids.is_empty() && t.hidden_story_ids.is_empty() && !t.archived);
        assert_eq!(t.color, "slate", "the next colour in order");
        assert_eq!(s.targets().unwrap().len(), 1, "nothing was saved");
    }

    #[test]
    fn the_pitch_is_the_closest_targets_and_flagged_never_written() {
        let (_d, s, first, app) = setup();
        let draft = target_from_posting(&s, &app).unwrap();
        assert_eq!(draft.target.pitch, first.pitch);
        assert!(draft.pitch_copied);
        let json = serde_json::to_value(&draft).unwrap();
        assert_eq!(json["pitchCopied"], true);
        assert!(json["target"]["roleFamily"].is_string(), "the target is in the shape the screens read");
    }

    #[test]
    fn with_no_target_to_copy_from_the_pitch_is_empty_and_not_flagged() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("d")).unwrap();
        let app = s.create_application(NewApplication { company: "N".into(), role: "Growth Manager".into(), ..Default::default() }, NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()).unwrap();
        let draft = target_from_posting(&s, &app.id).unwrap();
        assert_eq!((draft.target.pitch.as_str(), draft.pitch_copied), ("", false));
        assert_eq!(draft.target.default_process, DEFAULT_TARGET_PROCESS);
        assert_eq!(draft.target.color, color_for(0));
        assert_eq!(draft.target.role_family, "growth");
    }

    #[test]
    fn a_startup_posting_gives_a_startup_draft_and_a_saved_fit_is_used_as_it_is() {
        let (_d, s, first, app) = setup();
        s.change(&app, |a| {
            a.startup = true;
            a.target_fit = Some(TargetFit { sells_to: "b2c".into(), role_family: "lifecycle".into(), seniority: "lead".into(), best_target_id: Some(first.id.clone()), mismatch_notes: vec![], per_target: vec![FitRow { target_id: first.id.clone(), fit: "ok".into(), why: "x".into() }] });
            Ok(())
        })
        .unwrap();
        let t = target_from_posting(&s, &app).unwrap().target;
        assert_eq!(t.company_stage, "startup");
        assert_eq!((t.sells_to.as_str(), t.role_family.as_str(), t.seniority.as_str()), ("b2c", "lifecycle", "lead"), "the fit saved on the application wins over a fresh guess");
        let _ = role_family_of("x");
        let _ = target_name("", "both", "other");
    }
}
