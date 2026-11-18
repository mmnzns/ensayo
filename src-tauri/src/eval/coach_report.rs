//! `ensayo-eval --coach-report`: the pieces that are not the model call. Picking the saved answers to coach, writing
//! the Markdown report, and keeping it out of the repository. The report holds the owner's transcripts by design, so
//! nothing here prints them: callers print counts and progress only.

use crate::scoring::smart_coach::{CoachRun, Direction, Fix};
use crate::storage::applications::stage_label;
use crate::storage::reps::{FullRep, Session};
use crate::storage::Storage;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default)]
pub struct Filters {
    /// Session ids to take (empty: every session).
    pub sessions: Vec<String>,
    /// Case-insensitive text in the company of the session's application.
    pub company: Option<String>,
    /// Case-insensitive text in the question.
    pub question: Option<String>,
    /// Keep only the most recent N answers.
    pub limit: Option<usize>,
}

/// One saved answer to coach, with what the prompt needs around it.
#[derive(Debug, Clone)]
pub struct Item {
    pub session: Session,
    pub company: Option<String>,
    pub rep: FullRep,
    /// Earlier tries at the same question in the same session, oldest first.
    pub earlier: Vec<FullRep>,
}

#[derive(Debug, Default)]
pub struct Selection {
    /// Oldest first.
    pub items: Vec<Item>,
    pub skipped_no_transcript: usize,
    pub skipped_follow_up: usize,
    /// Files that could not be read (the storage layer's own words, never answer text).
    pub problems: Vec<String>,
}

fn has(text: &str, needle: &str) -> bool {
    text.to_lowercase().contains(&needle.trim().to_lowercase())
}

/// Every matching saved answer, labelled or not, that has words to coach.
pub fn select(storage: &Storage, f: &Filters) -> Result<Selection, String> {
    let mut out = Selection::default();
    let loaded = storage.sessions().map_err(|e| e.to_string())?;
    out.problems.extend(loaded.problems);
    let mut sessions = loaded.items;
    sessions.sort_by(|a, b| a.started.cmp(&b.started));
    for session in sessions {
        if !f.sessions.is_empty() && !f.sessions.contains(&session.id) {
            continue;
        }
        let company = session.application_id.as_deref().and_then(|id| storage.application(id).ok()).map(|a| a.company);
        if let Some(want) = &f.company {
            if !company.as_deref().is_some_and(|c| has(c, want)) {
                continue;
            }
        }
        let reps = storage.reps(&session.id).map_err(|e| e.to_string())?;
        out.problems.extend(reps.problems);
        for rep in &reps.items {
            if f.question.as_deref().is_some_and(|q| !has(&rep.rep.question_text, q)) {
                continue;
            }
            if rep.rep.follow_up.is_some() || rep.rep.question_type == "candidate_questions" {
                out.skipped_follow_up += 1;
                continue;
            }
            if !crate::scoring::smart_coach::can_coach(rep) {
                out.skipped_no_transcript += 1;
                continue;
            }
            let earlier = reps
                .items
                .iter()
                .filter(|e| e.rep.question_id == rep.rep.question_id && e.rep.n < rep.rep.n && e.rep.attempt < rep.rep.attempt && crate::scoring::smart_coach::can_coach(e))
                .cloned()
                .collect();
            out.items.push(Item { session: session.clone(), company: company.clone(), rep: rep.clone(), earlier });
        }
    }
    if let Some(n) = f.limit {
        let drop = out.items.len().saturating_sub(n);
        out.items.drain(..drop);
    }
    Ok(out)
}

/// The report path, checked: its folder exists and is not inside any of `repo_dirs` (the report holds real answers).
/// Returns the path with its folder resolved, so a link into the repository is caught too.
pub fn checked_out_path(out: &Path, repo_dirs: &[PathBuf]) -> Result<PathBuf, String> {
    let name = out.file_name().ok_or("The report path has no file name.")?;
    let folder = match out.parent() {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => PathBuf::from("."),
    };
    let folder = folder.canonicalize().map_err(|_| "The report's folder doesn't exist. Make it first.".to_string())?;
    for repo in repo_dirs {
        if let Ok(repo) = repo.canonicalize() {
            if folder.starts_with(&repo) {
                return Err("The report holds your real answers, so it can't go inside the Ensayo repository. Choose a path outside it.".into());
            }
        }
    }
    Ok(folder.join(name))
}

/// Where the answers wait while a run is going, so a run that is stopped keeps what it paid for.
pub fn partial_path(out: &Path) -> PathBuf {
    let mut name = out.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(".partial");
    out.with_file_name(name)
}

pub fn append(path: &Path, text: &str) -> Result<(), String> {
    let mut f = fs::OpenOptions::new().create(true).append(true).open(path).map_err(|e| format!("Couldn't write {}: {}", path.display(), e.kind()))?;
    f.write_all(text.as_bytes()).map_err(|e| format!("Couldn't write {}: {}", path.display(), e.kind()))
}

pub struct RunHeader {
    pub model: String,
    pub provider: String,
    pub prompt: String,
    pub date: String,
    pub reps: usize,
    pub failed: usize,
    pub cost_usd: f64,
    pub approx: bool,
    /// Runs on this computer: no cost to show.
    pub free: bool,
    pub seconds: f64,
}

/// The top of one run's section.
pub fn header(h: &RunHeader) -> String {
    let cost = if h.free { "free (runs on this computer)".to_string() } else { format!("${:.3}{}", h.cost_usd, if h.approx { " (estimate)" } else { "" }) };
    format!(
        "## Run: {model}\n\n- Model: {model}\n- Provider: {provider}\n- Prompt: {prompt}\n- Date: {date}\n- Answers coached: {reps}{failed}\n- Total cost: {cost}\n- Total time: {secs:.0} s\n\n",
        model = h.model,
        provider = h.provider,
        prompt = h.prompt,
        date = h.date,
        reps = h.reps,
        failed = if h.failed > 0 { format!(" ({} failed)", h.failed) } else { String::new() },
        cost = cost,
        secs = h.seconds,
    )
}

fn quoted(text: &str) -> String {
    text.lines().map(|l| format!("> {l}")).collect::<Vec<_>>().join("\n")
}

fn quote_line(q: &str) -> String {
    if q.trim().is_empty() {
        String::new()
    } else {
        format!("\"{}\"", q.trim())
    }
}

fn fix_block(f: &Fix) -> String {
    let mut s = format!("**Fix** ({}): {}\n\n- Why: {}\n", f.kind, f.what, f.why);
    if !f.quote.trim().is_empty() {
        s.push_str(&format!("- Where: {}\n", quote_line(&f.quote)));
    }
    s.push_str(&format!("- Do instead: {}\n", f.do_instead));
    match &f.say_instead {
        Some(line) => s.push_str(&format!("- Say instead: \"{line}\"\n")),
        None => s.push_str("- Say instead: none\n"),
    }
    s
}

/// One answer: what was asked, what was said, what Ensayo said before, and what the coach says now (or why it
/// could not). `n` is the answer's place in the report.
pub fn rep_section(n: usize, item: &Item, transcript: &str, result: &Result<CoachRun, String>) -> String {
    let r = &item.rep.rep;
    let mut s = format!("### {n}. {}\n\n", r.question_text.trim());
    let company = item.company.as_deref().map(|c| format!(", company: {c}")).unwrap_or_default();
    s.push_str(&format!("Session {}, answer {} (try {} at this question), stage: {}{}\n\n", item.session.id, r.n, r.attempt, stage_label(&item.session.stage).to_lowercase(), company));
    s.push_str(&format!("**Transcript**\n\n{}\n\n", quoted(transcript)));
    s.push_str("**What Ensayo said before**\n\n");
    match r.note.as_deref().map(str::trim).filter(|n| !n.is_empty()) {
        Some(note) => {
            s.push_str(&format!("- Top fix: {}\n- Note: {}\n", r.fix.as_deref().unwrap_or("none"), note));
            if let Some(w) = &r.rewrite {
                s.push_str(&format!("- Line to say instead: \"{}\"\n", w.text.trim()));
            }
        }
        None => s.push_str(&format!("- No coach note was saved (measured checks only). Top fix: {}\n", r.fix.as_deref().unwrap_or("none"))),
    }
    s.push_str("\n**What the coach says now**\n\n");
    match result {
        Err(e) => s.push_str(&format!("This answer could not be coached: {e}\n\n")),
        Ok(run) => {
            let c = &run.reply;
            s.push_str(&format!("Verdict: **{}**. {}\n\n", c.verdict.words(), c.verdict_line));
            if c.worked.is_empty() {
                s.push_str("**Worked**: nothing the coach could quote.\n\n");
            } else {
                s.push_str("**Worked**\n\n");
                for w in &c.worked {
                    s.push_str(&format!("- {}: {}\n", quote_line(&w.quote), w.why));
                }
                s.push('\n');
            }
            match &c.fix {
                Some(f) => s.push_str(&format!("{}\n", fix_block(f))),
                None => s.push_str("**Fix**: none.\n\n"),
            }
            if !c.more.is_empty() {
                s.push_str("**Smaller things**\n\n");
                for m in &c.more {
                    let q = if m.quote.trim().is_empty() { String::new() } else { format!(" {}", quote_line(&m.quote)) };
                    s.push_str(&format!("- ({}) {}{}\n", m.kind, m.what, q));
                }
                s.push('\n');
            }
            if let Some(sl) = &c.since_last {
                let direction = match sl.direction {
                    Direction::Better => "better",
                    Direction::Same => "same",
                    Direction::Worse => "worse",
                };
                s.push_str(&format!("**Since the last try**: {direction}\n\n"));
                for x in &sl.fixed {
                    s.push_str(&format!("- Got better: {x}\n"));
                }
                for x in &sl.still {
                    s.push_str(&format!("- Still there: {x}\n"));
                }
                s.push('\n');
            }
            s.push_str(&format!("Offer a follow-up question: {}\n\n", if c.offer_follow_up { "yes" } else { "no" }));
            let problems = if run.problems.is_empty() { "none".to_string() } else { run.problems.join("; ") };
            s.push_str(&format!(
                "Checks: quotes dropped {}; say instead removed {}; retries {}; problems left: {}; {:.1} s; ${:.4}\n\n",
                run.quotes_dropped, run.say_instead_nulled, run.retries, problems, run.seconds, run.cost_usd
            ));
        }
    }
    s.push_str("---\n\n");
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::providers::Provider;
    use crate::metrics::{compute, numbers, Inputs};
    use crate::scoring::fixtures::{story, words_of, TYPICAL};
    use crate::scoring::run::Budget;
    use crate::scoring::run::testing::Scripted;
    use crate::scoring::smart_coach::{build_input, coach};
    use crate::storage::reps::Rep;

    fn full(session: &str, n: u32, attempt: u32, qid: &str, text: &str, with_words: bool) -> FullRep {
        let m = compute(Inputs { words: if with_words { words_of(TYPICAL) } else { vec![] }, stage: "hiring_manager", question_type: "behavioral", bank: numbers::extract("31% 44%"), keep_restart: false });
        FullRep {
            session_id: session.into(),
            transcript: m.words.clone(),
            metrics: m,
            rep: Rep {
                n,
                question_id: qid.into(),
                question_text: text.into(),
                question_type: "behavioral".into(),
                behavioral_situation: None,
                commitment_check: false,
                builder_operator_check: false,
                is_major_story: true,
                founder_variant: false,
                attempt,
                recorded_at: "2026-11-01T10:00:00Z".into(),
                story_ids: vec!["st_onboarding".into()],
                follow_up: None,
                fix: Some("answer_first".into()),
                note: Some("Say the result first.".into()),
                rewrite: None,
                ai: None,
                feedback: None,
                extra: Default::default(),
            },
        }
    }

    fn session(id: &str, started: &str, app: Option<&str>) -> Session {
        Session { id: id.into(), mode: "drill".into(), stage: "hiring_manager".into(), application_id: app.map(String::from), stage_id: None, started: started.into(), target_id: None, resume: None, extra: Default::default() }
    }

    fn store() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::init(dir.path().join("data")).unwrap();
        s.save_story(&story()).unwrap();
        s.save_session(&session("ses_a", "2026-11-01T10:00:00Z", None)).unwrap();
        s.save_session(&session("ses_b", "2026-11-02T10:00:00Z", None)).unwrap();
        s.save_rep("ses_a", &full("ses_a", 1, 1, "q1", "Tell me about a time you improved a metric.", true)).unwrap();
        s.save_rep("ses_a", &full("ses_a", 2, 2, "q1", "Tell me about a time you improved a metric.", true)).unwrap();
        s.save_rep("ses_a", &full("ses_a", 3, 1, "q2", "Why this company?", true)).unwrap();
        s.save_rep("ses_a", &full("ses_a", 4, 1, "q3", "A silent one.", false)).unwrap();
        s.save_rep("ses_b", &full("ses_b", 1, 1, "q1", "Tell me about a time you improved a metric.", true)).unwrap();
        (dir, s)
    }

    #[test]
    fn every_answer_with_words_is_taken_and_a_silent_one_is_counted() {
        let (_d, s) = store();
        let sel = select(&s, &Filters::default()).unwrap();
        assert_eq!(sel.items.len(), 4);
        assert_eq!(sel.skipped_no_transcript, 1);
        let ids: Vec<(String, u32)> = sel.items.iter().map(|i| (i.session.id.clone(), i.rep.rep.n)).collect();
        assert_eq!(ids, [("ses_a".into(), 1), ("ses_a".into(), 2), ("ses_a".into(), 3), ("ses_b".into(), 1)], "oldest first");
    }

    #[test]
    fn earlier_tries_are_the_same_question_in_the_same_session() {
        let (_d, s) = store();
        let sel = select(&s, &Filters::default()).unwrap();
        assert!(sel.items[0].earlier.is_empty());
        assert_eq!(sel.items[1].earlier.len(), 1);
        assert_eq!(sel.items[1].earlier[0].rep.n, 1);
        assert!(sel.items[3].earlier.is_empty(), "another session's try is not an earlier try");
    }

    #[test]
    fn filters_narrow_by_session_question_and_limit() {
        let (_d, s) = store();
        let by_session = select(&s, &Filters { sessions: vec!["ses_b".into()], ..Default::default() }).unwrap();
        assert_eq!(by_session.items.len(), 1);
        let by_question = select(&s, &Filters { question: Some("WHY this".into()), ..Default::default() }).unwrap();
        assert_eq!(by_question.items.len(), 1);
        assert_eq!(by_question.items[0].rep.rep.question_id, "q2");
        let limited = select(&s, &Filters { limit: Some(2), ..Default::default() }).unwrap();
        let ids: Vec<(String, u32)> = limited.items.iter().map(|i| (i.session.id.clone(), i.rep.rep.n)).collect();
        assert_eq!(ids, [("ses_a".into(), 3), ("ses_b".into(), 1)], "the most recent two");
        assert_eq!(select(&s, &Filters { sessions: vec!["ses_none".into()], ..Default::default() }).unwrap().items.len(), 0);
    }

    #[test]
    fn a_company_filter_matches_the_applications_company_case_insensitively() {
        let (_d, s) = store();
        assert_eq!(select(&s, &Filters { company: Some("kestrel".into()), ..Default::default() }).unwrap().items.len(), 0, "a drill has no company");
        let app = s.create_application(crate::storage::applications::NewApplication { company: "Kestrel Pay".into(), role: "Lifecycle lead".into(), ..Default::default() }, chrono::NaiveDate::from_ymd_opt(2026, 11, 1).unwrap()).unwrap();
        s.save_session(&session("ses_c", "2026-11-03T10:00:00Z", Some(&app.id))).unwrap();
        s.save_rep("ses_c", &full("ses_c", 1, 1, "q1", "Tell me about a time you improved a metric.", true)).unwrap();
        let sel = select(&s, &Filters { company: Some("kestrel".into()), ..Default::default() }).unwrap();
        assert_eq!(sel.items.len(), 1);
        assert_eq!(sel.items[0].company.as_deref(), Some("Kestrel Pay"));
    }

    #[test]
    fn follow_up_answers_are_skipped_and_counted() {
        let (_d, s) = store();
        let mut f = full("ses_b", 2, 1, "q1f", "And what did you do yourself?", true);
        f.rep.follow_up = Some(crate::storage::reps::FollowUpMeta { parent_n: 1, kind: "ownership_probe".into(), question: "x".into(), number: 1 });
        s.save_rep("ses_b", &f).unwrap();
        let sel = select(&s, &Filters::default()).unwrap();
        assert_eq!((sel.items.len(), sel.skipped_follow_up), (4, 1));
    }

    #[test]
    fn the_report_path_may_not_be_inside_the_repository() {
        let repo = tempfile::tempdir().unwrap();
        let elsewhere = tempfile::tempdir().unwrap();
        let repos = [repo.path().to_path_buf()];
        assert!(checked_out_path(&repo.path().join("report.md"), &repos).unwrap_err().contains("outside"));
        fs::create_dir(repo.path().join("sub")).unwrap();
        assert!(checked_out_path(&repo.path().join("sub").join("r.md"), &repos).is_err());
        assert!(checked_out_path(&elsewhere.path().join("report.md"), &repos).is_ok());
        assert!(checked_out_path(&elsewhere.path().join("missing").join("report.md"), &repos).unwrap_err().contains("folder"));
        // A link from outside into the repository is caught by resolving the folder.
        #[cfg(unix)]
        {
            let link = elsewhere.path().join("link");
            std::os::unix::fs::symlink(repo.path(), &link).unwrap();
            assert!(checked_out_path(&link.join("r.md"), &repos).is_err());
        }
    }

    #[test]
    fn a_second_run_is_added_below_the_first() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("report.md");
        append(&path, "first\n").unwrap();
        append(&path, "second\n").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "first\nsecond\n");
        assert_eq!(partial_path(&path).file_name().unwrap(), "report.md.partial");
    }

    #[test]
    fn the_report_shows_both_sides_and_the_counters_and_has_no_em_dash() {
        let (_d, s) = store();
        let sel = select(&s, &Filters::default()).unwrap();
        let item = &sel.items[1];
        let input = build_input(&s, &item.session, &item.rep, &item.earlier.iter().collect::<Vec<_>>());
        assert!(input.earlier_tries.starts_with("try: 1"));
        let reply = r#"{"verdict":"nearly","verdict_line":"The result comes late.","worked":[{"quote":"the design team simplified the screen","why":"It names who did what."},{"quote":"never said this","why":"x"}],"fix":{"kind":"answer_first","what":"Open with the result.","why":"They want the change first.","quote":"activation went up to about 44 percent","do_instead":"Start with 44 percent.","say_instead":"I moved activation to 58 percent."},"more":[],"since_last":{"direction":"same","fixed":[],"still":["The result is last."]},"offer_follow_up":true}"#;
        let llm = Scripted::new(vec![Ok(reply)]);
        let run = coach(&llm, &input, &mut Budget::new(Provider::Claude, 0.0)).unwrap();
        let text = rep_section(2, item, &input.transcript, &Ok(run));
        for want in [
            "### 2. Tell me about a time you improved a metric.",
            "Session ses_a, answer 2 (try 2 at this question), stage: hiring manager",
            "> [1] (0.0s to 6.8s)",
            "**What Ensayo said before**",
            "- Top fix: answer_first",
            "- Note: Say the result first.",
            "**What the coach says now**",
            "Verdict: **nearly**. The result comes late.",
            "- \"the design team simplified the screen\": It names who did what.",
            "**Fix** (answer_first): Open with the result.",
            "- Where: \"activation went up to about 44 percent\"",
            "- Say instead: none",
            "**Since the last try**: same",
            "- Still there: The result is last.",
            "Checks: quotes dropped 1; say instead removed 1; retries 0",
        ] {
            assert!(text.contains(want), "missing: {want}\n{text}");
        }
        assert!(!text.contains("never said this") && !text.contains('\u{2014}'));
        let failed = rep_section(1, item, &input.transcript, &Err("The AI answered twice in a shape Ensayo couldn't read.".into()));
        assert!(failed.contains("could not be coached: The AI answered twice"));
    }

    #[test]
    fn the_header_names_the_model_prompt_cost_and_time() {
        let h = header(&RunHeader { model: "claude-sonnet-5-5".into(), provider: "Claude".into(), prompt: "smart-coach v1".into(), date: "2026-11-17 10:00 UTC".into(), reps: 12, failed: 1, cost_usd: 0.4567, approx: false, free: false, seconds: 301.4 });
        for want in ["## Run: claude-sonnet-5-5", "- Provider: Claude", "- Prompt: smart-coach v1", "- Date: 2026-11-17 10:00 UTC", "- Answers coached: 12 (1 failed)", "- Total cost: $0.457", "- Total time: 301 s"] {
            assert!(h.contains(want), "missing {want}\n{h}");
        }
        let local = header(&RunHeader { model: "qwen".into(), provider: "OpenAI-compatible".into(), prompt: "p".into(), date: "d".into(), reps: 1, failed: 0, cost_usd: 0.0, approx: false, free: true, seconds: 1.0 });
        assert!(local.contains("free (runs on this computer)"));
    }
}
