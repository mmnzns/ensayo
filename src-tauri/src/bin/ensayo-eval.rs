//! `ensayo-eval`: how often the scorer agrees with your own pass or fail labels (Build Plan, M5).
//!
//!   ensayo-eval --data <data folder> [--rescore] [--json] [--suggest] [--gate] [--min-reps 30] [--min-agreement 0.8]
//!
//! Without `--rescore` it compares the checks saved with each rep at the time. With `--rescore` it runs the current
//! scorer again over every labelled rep, using the feedback engine from Settings (or `ENSAYO_AI_PROVIDER` and
//! `ENSAYO_AI_KEY`, `ENSAYO_AI_MODEL`). `--gate` exits with 1 when the gate (80% agreement, no false pass on
//! answer_first, at least 30 labelled reps) is not met.

use ensayo_lib::ai_commands::{resolve, resolved_from_disk, Engine};
use ensayo_lib::eval::{compare, suggest_thresholds, MIN_AGREEMENT, MIN_REPS};
use ensayo_lib::metrics::Check;
use ensayo_lib::rep_commands::{rejudge, AiCtx};
use ensayo_lib::scoring::run::Budget;
use ensayo_lib::storage::reps::EvalRecord;
use ensayo_lib::storage::settings::AiSettings;
use ensayo_lib::storage::Storage;
use std::collections::HashMap;
use std::path::PathBuf;

struct Args {
    data: PathBuf,
    rescore: bool,
    json: bool,
    suggest: bool,
    gate: bool,
    min_reps: usize,
    min_agreement: f64,
}

fn parse() -> Result<Args, String> {
    let mut a = Args {
        data: std::env::var("ENSAYO_DATA_DIR").map(PathBuf::from).unwrap_or_else(|_| ensayo_lib::paths::default_data_dir()),
        rescore: false,
        json: false,
        suggest: false,
        gate: false,
        min_reps: MIN_REPS,
        min_agreement: MIN_AGREEMENT,
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
            "--help" | "-h" => return Err("usage: ensayo-eval --data <data folder> [--rescore] [--json] [--suggest] [--gate] [--min-reps N] [--min-agreement F]".into()),
            other => return Err(format!("unknown option {other}")),
        }
    }
    Ok(a)
}

fn engine() -> Result<Engine, String> {
    if let Ok(provider) = std::env::var("ENSAYO_AI_PROVIDER") {
        let settings = AiSettings { provider, fast_model: std::env::var("ENSAYO_AI_MODEL").unwrap_or_default(), strong_model: std::env::var("ENSAYO_AI_STRONG").unwrap_or_default(), base_url: std::env::var("ENSAYO_AI_URL").unwrap_or_default(), cost_cap_usd: 0.0 };
        let key = std::env::var("ENSAYO_AI_KEY").ok();
        return resolve(&settings, |_| key.clone())?.map(Engine::Cloud).ok_or_else(|| "no feedback engine chosen".to_string());
    }
    resolved_from_disk()?.ok_or_else(|| "No feedback engine is set up. Choose one in Settings, or set ENSAYO_AI_PROVIDER and ENSAYO_AI_KEY.".to_string())
}

fn run() -> Result<bool, String> {
    let args = parse()?;
    let storage = Storage::open(args.data.clone()).map_err(|e| e.to_string())?;
    let loaded = storage.eval_reps().map_err(|e| e.to_string())?;
    for p in &loaded.problems {
        eprintln!("skipped: {p}");
    }
    let records: Vec<EvalRecord> = loaded.items;
    let mut fresh: HashMap<(String, u32), Vec<Check>> = HashMap::new();
    if args.rescore {
        let engine = engine()?;
        let llm = engine.client();
        let (provider, _) = engine.budget_basis();
        let mut budget = Budget::new(provider, 0.0);
        let labelled: Vec<&EvalRecord> = records.iter().filter(|r| !r.labels.is_empty()).collect();
        for (i, rec) in labelled.iter().enumerate() {
            eprintln!("scoring {}/{}: {}-{}", i + 1, labelled.len(), rec.full.session_id, rec.full.rep.n);
            let mut ctx = AiCtx { llm: llm.as_ref(), budget: &mut budget };
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
