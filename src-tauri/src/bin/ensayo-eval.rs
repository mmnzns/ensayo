//! `ensayo-eval`: how often the scorer agrees with your own pass or fail labels (Build Plan, M5), and the Smart coach
//! report.
//!
//!   ensayo-eval --data <data folder> [--rescore] [--json] [--suggest] [--gate] [--min-reps 30] [--min-agreement 0.8]
//!
//! Without `--rescore` it compares the checks saved with each rep at the time. With `--rescore` it runs the current
//! scorer again over every labelled rep, using the feedback engine from Settings (or `ENSAYO_AI_PROVIDER`,
//! `ENSAYO_AI_KEY` or else the key saved in Settings, and `ENSAYO_AI_MODEL`). `--gate` exits with 1 when the gate (80% agreement, no false pass on
//! answer_first, at least 30 labelled reps) is not met.
//!
//!   ensayo-eval --data <data folder> --coach-report <report.md> [--session <id>]... [--company <text>]
//!               [--question <text>] [--limit N] [--max-cost USD] [--dry-run]
//!
//! The Smart coach report (Phase 0, prompt 12): coaches your saved answers, every one that matches (labelled or not;
//! follow-up answers and answers with no words are skipped), and writes what it says next to what Ensayo said before.
//! `--session` can be repeated; `--company` matches the application's company and `--question` the question text,
//! both ignoring case; `--limit` keeps the most recent N. `--dry-run` makes no AI call: it prints how many answers
//! match, the model that would run and a cost estimate, so you can see the price first. A report that already exists
//! gets a new section added at the end (one file can hold several models). The report holds your real answers: it
//! can't be written inside the repository, and nothing from it is printed here (progress lines only).
//!
//! The engine comes from Settings, or from the environment: `ENSAYO_AI_PROVIDER` (claude, openai, gemini, groq,
//! cerebras, mistral, openrouter, compatible for Ollama or LM Studio, local for the built-in local AI),
//! `ENSAYO_AI_KEY` (if unset, the key saved in Settings for that provider is used), `ENSAYO_AI_MODEL` (the Smart coach uses it for the strong model too unless `ENSAYO_AI_STRONG` is
//! set), `ENSAYO_AI_URL` (the server of a compatible engine). For `local`, `ENSAYO_AI_MODEL` is a built-in model id
//! (empty means the recommended one) and the `ensayo-llm` helper must sit beside this program.

use ensayo_lib::ai_commands::{resolve, resolved_from_disk, resolved_with, Engine};
use ensayo_lib::eval::coach_report::{self, Filters, RunHeader};
use ensayo_lib::eval::{compare, suggest_thresholds, MIN_AGREEMENT, MIN_REPS};
use ensayo_lib::metrics::Check;
use ensayo_lib::rep_commands::{rejudge, AiCtx};
use ensayo_lib::scoring::prompts::{get, PromptId};
use ensayo_lib::scoring::run::{Budget, CallError};
use ensayo_lib::scoring::smart_coach;
use ensayo_lib::storage::reps::EvalRecord;
use ensayo_lib::storage::settings::AiSettings;
use ensayo_lib::storage::Storage;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

struct Args {
    data: PathBuf,
    rescore: bool,
    json: bool,
    suggest: bool,
    gate: bool,
    min_reps: usize,
    min_agreement: f64,
    coach_report: Option<PathBuf>,
    filters: Filters,
    dry_run: bool,
    max_cost: f64,
}

const USAGE: &str = "usage: ensayo-eval --data <data folder> [--rescore] [--json] [--suggest] [--gate] [--min-reps N] [--min-agreement F]
       ensayo-eval --data <data folder> --coach-report <report.md> [--session <id>]... [--company <text>] [--question <text>] [--limit N] [--max-cost USD] [--dry-run]

The Smart coach report coaches your saved answers and writes a Markdown file. Start with --dry-run: no AI call, just the
number of answers, the model and the estimated cost. Engine: Settings, or ENSAYO_AI_PROVIDER (claude, openai, gemini, groq,
cerebras, mistral, openrouter, compatible, local), ENSAYO_AI_KEY (if unset, the key saved in Settings for that provider), ENSAYO_AI_MODEL, ENSAYO_AI_STRONG, ENSAYO_AI_URL.";

fn parse() -> Result<Args, String> {
    let mut a = Args {
        data: std::env::var("ENSAYO_DATA_DIR").map(PathBuf::from).unwrap_or_else(|_| ensayo_lib::paths::default_data_dir()),
        rescore: false,
        json: false,
        suggest: false,
        gate: false,
        min_reps: MIN_REPS,
        min_agreement: MIN_AGREEMENT,
        coach_report: None,
        filters: Filters::default(),
        dry_run: false,
        max_cost: 0.0,
    };
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        let mut value = |name: &str| it.next().ok_or_else(|| format!("{name} needs a value"));
        match arg.as_str() {
            "--data" => a.data = PathBuf::from(value("--data")?),
            "--rescore" => a.rescore = true,
            "--json" => a.json = true,
            "--suggest" => a.suggest = true,
            "--gate" => a.gate = true,
            "--min-reps" => a.min_reps = value("--min-reps")?.parse().map_err(|_| "--min-reps must be a number")?,
            "--min-agreement" => a.min_agreement = value("--min-agreement")?.parse().map_err(|_| "--min-agreement must be a number like 0.8")?,
            "--coach-report" => a.coach_report = Some(PathBuf::from(value("--coach-report")?)),
            "--session" => a.filters.sessions.push(value("--session")?),
            "--company" => a.filters.company = Some(value("--company")?),
            "--question" => a.filters.question = Some(value("--question")?),
            "--limit" => a.filters.limit = Some(value("--limit")?.parse().map_err(|_| "--limit must be a number")?),
            "--max-cost" => a.max_cost = value("--max-cost")?.parse().map_err(|_| "--max-cost must be a number of US dollars, like 2.5")?,
            "--dry-run" => a.dry_run = true,
            "--help" | "-h" => {
                println!("{USAGE}");
                std::process::exit(0);
            }
            other => return Err(format!("unknown option {other}")),
        }
    }
    let filtering = a.dry_run || a.max_cost > 0.0 || a.filters.limit.is_some() || a.filters.company.is_some() || a.filters.question.is_some() || !a.filters.sessions.is_empty();
    if a.coach_report.is_none() && filtering {
        return Err("--session, --company, --question, --limit, --max-cost and --dry-run belong with --coach-report <report.md>.".into());
    }
    Ok(a)
}

/// The engine for this run. `for_coach` makes ENSAYO_AI_MODEL the strong model too (the Smart coach is a strong-model
/// prompt, so the one model named is the one used). `dry_run` needs no key: a placeholder stands in, nothing is sent.
fn engine(for_coach: bool, dry_run: bool) -> Result<Engine, String> {
    if let Ok(provider) = std::env::var("ENSAYO_AI_PROVIDER") {
        let model = std::env::var("ENSAYO_AI_MODEL").unwrap_or_default();
        let mut strong = std::env::var("ENSAYO_AI_STRONG").unwrap_or_default();
        if for_coach && strong.trim().is_empty() {
            strong = model.clone();
        }
        let settings = AiSettings { provider: provider.clone(), fast_model: model, strong_model: strong, base_url: std::env::var("ENSAYO_AI_URL").unwrap_or_default(), cost_cap_usd: 0.0 };
        if provider.trim() == ensayo_lib::ai_commands::LOCAL {
            return resolved_with(&settings, |_| None)?.ok_or_else(|| "no feedback engine chosen".to_string());
        }
        // ENSAYO_AI_KEY wins; if it is unset, the key saved in Settings for this provider (never printed).
        let key = std::env::var("ENSAYO_AI_KEY").ok().filter(|k| !k.trim().is_empty()).or_else(|| ensayo_lib::ai::providers::Provider::parse(provider.trim()).and_then(|p| ensayo_lib::keys::get(p.key_id()))).or_else(|| dry_run.then(|| "dry-run".to_string()));
        return resolve(&settings, |_| key.clone())?.map(Engine::Cloud).ok_or_else(|| "no feedback engine chosen".to_string());
    }
    resolved_from_disk()?.ok_or_else(|| "No feedback engine is set up. Choose one in Settings, or set ENSAYO_AI_PROVIDER (with ENSAYO_AI_KEY, or a key saved in Settings).".to_string())
}

/// The provider's name and the model the Smart coach (a strong-model prompt) would use.
fn engine_names(e: &Engine) -> (String, String) {
    match e {
        Engine::Cloud(r) => (r.provider.name().to_string(), r.strong.clone()),
        Engine::Local(l) => ("Built-in local AI".to_string(), l.id.to_string()),
    }
}

/// Folders the report must stay out of: the repository this program was built from, and the one it is run in.
fn repo_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Path::new(env!("CARGO_MANIFEST_DIR")).parent().map(Path::to_path_buf).into_iter().collect();
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(root) = cwd.ancestors().find(|d| d.join(".git").exists()) {
            dirs.push(root.to_path_buf());
        }
    }
    dirs
}

fn coach_report(args: &Args, out: &Path, storage: &Storage) -> Result<(), String> {
    let out = coach_report::checked_out_path(out, &repo_dirs())?;
    let selection = coach_report::select(storage, &args.filters)?;
    for p in &selection.problems {
        eprintln!("skipped: {p}");
    }
    let total = selection.items.len();
    println!("{total} answer(s) match.");
    if selection.skipped_no_transcript + selection.skipped_follow_up > 0 {
        println!("Skipped: {} with no words, {} follow-up or candidate-question answers.", selection.skipped_no_transcript, selection.skipped_follow_up);
    }
    if total == 0 {
        return Ok(());
    }
    let engine = engine(true, args.dry_run)?;
    let (provider_name, model) = engine_names(&engine);
    let (provider, _) = engine.budget_basis();
    let prompt = get(PromptId::SmartCoach);
    let prompt_name = format!("{} v{}", prompt.id, prompt.version);

    if args.dry_run {
        // The estimate builds every input up front with no coach replies (it would be a little longer with them).
        let inputs: Vec<smart_coach::CoachInput> = selection.items.iter().map(|i| smart_coach::build_input(storage, &i.session, &i.rep, &i.earlier.iter().collect::<Vec<_>>(), &[])).collect();
        let (mut tokens_in, mut tokens_out) = (0u64, 0u64);
        for input in &inputs {
            let (i, o) = smart_coach::estimate_tokens(input);
            tokens_in += i;
            tokens_out += o;
        }
        println!("Dry run: no AI call was made.");
        println!("Model: {model} ({provider_name}), prompt {prompt_name}");
        println!("Estimated size: about {tokens_in} tokens in ({} an answer), about {tokens_out} tokens out.", tokens_in / total as u64);
        match ensayo_lib::ai::cost::price_or_fallback(provider, &model) {
            None => println!("Estimated cost: free (this engine runs on this computer)."),
            Some(p) => {
                let usd = (tokens_in as f64 * p.input + tokens_out as f64 * p.output) / 1_000_000.0;
                println!("Estimated cost: about ${usd:.3} (${:.2} in and ${:.2} out per million tokens{}).", p.input, p.output, if p.approx { ", a guessed price" } else { "" });
                println!("A reply that has to be asked for again costs about double for that answer.");
            }
        }
        println!("The report would go to {}", out.display());
        return Ok(());
    }

    if let Engine::Local(_) = &engine {
        let helper = ensayo_lib::ai::local::helper_path();
        if !helper.exists() {
            return Err("The built-in local AI needs its helper program (ensayo-llm) beside ensayo-eval. Build it with `cargo build -p ensayo-llm`, or use an Ollama or LM Studio server (ENSAYO_AI_PROVIDER=compatible).".into());
        }
    }
    let llm = engine.client();
    let mut budget = Budget::new(provider, args.max_cost);
    let partial = coach_report::partial_path(&out);
    let _ = std::fs::remove_file(&partial);
    let started = std::time::Instant::now();
    let (mut done, mut failed) = (0usize, 0usize);
    // The replies given so far in this run, by session id and rep number, so a later try sees the notes this run gave
    // to its earlier tries. A try outside the selection, or one that failed, has none and falls back to the old note.
    let mut replies: HashMap<(String, u32), smart_coach::SmartCoach> = HashMap::new();
    for (i, item) in selection.items.iter().enumerate() {
        eprintln!("coaching {}/{}", i + 1, total);
        let earlier: Vec<&_> = item.earlier.iter().collect();
        let earlier_replies: Vec<Option<&smart_coach::SmartCoach>> = earlier.iter().map(|e| replies.get(&(e.session_id.clone(), e.rep.n))).collect();
        let input = smart_coach::build_input(storage, &item.session, &item.rep, &earlier, &earlier_replies);
        let result = smart_coach::coach(llm.as_ref(), &input, &mut budget);
        let stop = matches!(result, Err(CallError::CapReached { .. }));
        let shown = result.map_err(|e| match &e {
            CallError::CapReached { .. } => e.cap_words(),
            other => other.notice(),
        });
        match &shown {
            Ok(run) => {
                done += 1;
                replies.insert((item.rep.session_id.clone(), item.rep.rep.n), run.reply.clone());
            }
            Err(_) => {
                failed += 1;
                eprintln!("  this answer could not be coached (the reason is in the report)");
            }
        }
        coach_report::append(&partial, &coach_report::rep_section(i + 1, item, &input.transcript, &shown))?;
        if stop {
            let left = total - i - 1;
            if left > 0 {
                coach_report::append(&partial, &format!("The spending limit stopped the run: {left} more answer(s) were not coached.\n\n---\n\n"))?;
            }
            break;
        }
    }
    let head = coach_report::header(&RunHeader {
        model: model.clone(),
        provider: provider_name,
        prompt: prompt_name,
        date: chrono::Utc::now().format("%Y-%m-%d %H:%M UTC").to_string(),
        reps: done,
        failed,
        cost_usd: budget.spend.usd,
        approx: budget.spend.approx,
        free: matches!(engine, Engine::Local(_)) || provider == ensayo_lib::ai::providers::Provider::Compatible,
        seconds: started.elapsed().as_secs_f64(),
    });
    let body = std::fs::read_to_string(&partial).map_err(|e| format!("Couldn't read back the answers coached so far: {}", e.kind()))?;
    let intro = if out.exists() { "\n\n".to_string() } else { "# Smart coach report\n\n".to_string() };
    coach_report::append(&out, &format!("{intro}{head}{body}"))?;
    let _ = std::fs::remove_file(&partial);
    println!("Wrote {} answer(s) ({failed} failed) to {}. Cost about ${:.3}.", done + failed, out.display(), budget.spend.usd);
    Ok(())
}

fn run() -> Result<bool, String> {
    let args = parse()?;
    let storage = Storage::open(args.data.clone()).map_err(|e| e.to_string())?;
    if let Some(out) = &args.coach_report {
        coach_report(&args, out, &storage)?;
        return Ok(true);
    }
    let loaded = storage.eval_reps().map_err(|e| e.to_string())?;
    for p in &loaded.problems {
        eprintln!("skipped: {p}");
    }
    let records: Vec<EvalRecord> = loaded.items;
    let mut fresh: HashMap<(String, u32), Vec<Check>> = HashMap::new();
    if args.rescore {
        let engine = engine(false, false)?;
        let llm = engine.client();
        let (provider, _) = engine.budget_basis();
        let mut budget = Budget::new(provider, 0.0);
        let labelled: Vec<&EvalRecord> = records.iter().filter(|r| !r.labels.is_empty()).collect();
        for (i, rec) in labelled.iter().enumerate() {
            eprintln!("scoring {}/{}: {}-{}", i + 1, labelled.len(), rec.full.session_id, rec.full.rep.n);
            let mut ctx = AiCtx { coach: engine.coach_level(), llm: llm.as_ref(), budget: &mut budget };
            match rejudge(&storage, &mut ctx, &rec.full) {
                Ok(checks) => {
                    fresh.insert((rec.full.session_id.clone(), rec.full.rep.n), checks);
                }
                Err(e) => eprintln!("  could not score: {e}"),
            }
        }
        eprintln!("estimated cost: ${:.3}", budget.spend.usd);
    }
    let report = compare(
        &records,
        |r| if args.rescore { fresh.get(&(r.full.session_id.clone(), r.full.rep.n)).cloned().unwrap_or_default() } else { r.full.metrics.checks.clone() },
        args.min_reps,
        args.min_agreement,
    );
    if args.json {
        println!("{}", serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?);
    } else {
        print!("{}", report.text());
    }
    if args.suggest {
        let s = suggest_thresholds(&records);
        println!("\nSuggested limits from your labels (read them, then decide; nothing was changed):");
        println!("  time to point: {}", s.time_to_point_s.map(|v| format!("under {v:.0} s")).unwrap_or_else(|| "not enough labels".into()));
        println!("  tail after the number: {}", s.tail_s.map(|v| format!("under {v:.0} s")).unwrap_or_else(|| "not enough labels".into()));
        println!("  filler words: {}", s.fillers_per_min.map(|v| format!("under {v:.1} a minute")).unwrap_or_else(|| "not enough labels".into()));
    }
    Ok(report.gate.passed)
}

fn main() {
    match run() {
        Ok(passed) => {
            if std::env::args().any(|a| a == "--gate") && !passed {
                std::process::exit(1);
            }
        }
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    }
}
