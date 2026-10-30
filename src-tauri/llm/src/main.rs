//! ensayo-llm: Ensayo's built-in local AI helper. Runs llama.cpp in its own process so its copy of ggml never meets
//! Whisper's (the app links whisper.cpp), and so a model crash or out-of-memory never takes the app down.
//! Adapted from Talaan's `talaan-llm` (Miguel's own MIT code), processor and Metal only: no Windows GPU build in v0.
//!
//! Reads one JSON request per line on stdin, writes JSON events per line on stdout (protocol crate). Exits when
//! stdin closes (the app quit or crashed) or after a while without requests. Logs go to stderr.

use ensayo_llm_protocol::{decode_request, encode, Backend, Completion, Event, Phase, Reply, Request};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{LlamaChatMessage, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use std::io::{BufRead, Write};
use std::num::NonZeroU32;
use std::sync::mpsc;
use std::time::{Duration, Instant};

/// Without a request for this long the helper exits, which frees all of the model's memory. The app starts it
/// again on the next answer. `ENSAYO_LLM_IDLE_SECS` shortens it (tests only).
const IDLE_EXIT: Duration = Duration::from_secs(120);

fn idle_exit() -> Duration {
    std::env::var("ENSAYO_LLM_IDLE_SECS").ok().and_then(|v| v.parse().ok()).map(Duration::from_secs).unwrap_or(IDLE_EXIT)
}
const BATCH: usize = 512;

fn send(ev: &Event) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{}", encode(ev));
    let _ = out.flush();
}

fn backend() -> Backend {
    Backend { backend: if cfg!(target_os = "macos") { "metal" } else { "cpu" }.into() }
}

fn main() {
    // Quiet llama.cpp's own logging; errors still come back as events (and the app only keeps error lines).
    llama_cpp_2::send_logs_to_tracing(llama_cpp_2::LogOptions::default().with_logs_enabled(false));
    let llama = match LlamaBackend::init() {
        Ok(b) => b,
        Err(e) => return send(&Event::Error { message: format!("Couldn't start the built-in local AI: {e}") }),
    };

    // stdin on its own thread so the main loop can time out when idle.
    let (tx, rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            let Ok(line) = line else { break };
            if tx.send(line).is_err() {
                break;
            }
        }
    });

    let idle = idle_exit();
    let mut loaded: Option<Loaded> = None;
    loop {
        let line = match rx.recv_timeout(idle) {
            Ok(l) => l,
            Err(_) => break, // idle or stdin closed: free everything by exiting
        };
        match decode_request(&line) {
            Ok(Request::Ping) => send(&Event::Ready { backend: backend() }),
            Ok(Request::Complete(c)) => match complete(&llama, &mut loaded, &c) {
                Ok(reply) => send(&Event::Done(reply)),
                Err(message) => send(&Event::Error { message }),
            },
            Err(e) => send(&Event::Error { message: format!("bad request: {e}") }),
        }
    }
}

struct Loaded {
    path: String,
    model: LlamaModel,
}

/// Every layer goes to the GPU where there is one (Metal on the Mac); the Windows build has none and uses the
/// processor whatever this says.
fn model_params() -> LlamaModelParams {
    LlamaModelParams::default().with_n_gpu_layers(999)
}

fn load<'a>(llama: &LlamaBackend, loaded: &'a mut Option<Loaded>, path: &str) -> Result<&'a LlamaModel, String> {
    if !loaded.as_ref().is_some_and(|l| l.path == path) {
        *loaded = None;
        send(&Event::Progress { phase: Phase::Loading, done: 0, total: 0 });
        if !std::path::Path::new(path).is_file() {
            return Err("The built-in local AI model file is missing. Download it again in Settings › AI.".to_string());
        }
        let model = LlamaModel::load_from_file(llama, path, &model_params()).map_err(|e| format!("Couldn't load the built-in local AI model: {e}"))?;
        *loaded = Some(Loaded { path: path.to_string(), model });
    }
    Ok(&loaded.as_ref().expect("loaded above").model)
}

fn threads() -> i32 {
    let logical = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    thread_count(logical, physical_cores())
}

/// llama.cpp threads. Mac: all the cores, 2 to 8. Windows: the processor build is limited by memory bandwidth and the
/// math units a core's two hardware threads share, so the physical cores (at most 8) are the right count; without
/// that figure, half the logical threads (a core usually has two).
fn thread_count(logical: usize, physical: Option<usize>) -> i32 {
    let n = if cfg!(target_os = "windows") { physical.filter(|p| *p > 0).unwrap_or(logical / 2) } else { logical };
    n.clamp(2, 8) as i32
}

/// Physical core count on Windows, from the processor-core entries of GetLogicalProcessorInformationEx.
#[cfg(target_os = "windows")]
fn physical_cores() -> Option<usize> {
    use windows::Win32::System::SystemInformation::{GetLogicalProcessorInformationEx, RelationProcessorCore, SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX};
    let mut bytes = 0u32;
    // The first call fails on purpose and says how big the answer is.
    unsafe { let _ = GetLogicalProcessorInformationEx(RelationProcessorCore, None, &mut bytes); }
    if bytes == 0 {
        return None;
    }
    let mut buf = vec![0u8; bytes as usize];
    unsafe { GetLogicalProcessorInformationEx(RelationProcessorCore, Some(buf.as_mut_ptr() as *mut SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX), &mut bytes) }.ok()?;
    // Entries are variable length: each starts with its own size.
    let (mut at, mut cores) = (0usize, 0usize);
    while at + 8 <= bytes as usize {
        let size = u32::from_ne_bytes(buf[at + 4..at + 8].try_into().ok()?) as usize;
        if size == 0 {
            break;
        }
        cores += 1;
        at += size;
    }
    (cores > 0).then_some(cores)
}

#[cfg(not(target_os = "windows"))]
fn physical_cores() -> Option<usize> {
    None
}

fn context_params(n_ctx: u32) -> LlamaContextParams {
    LlamaContextParams::default().with_n_ctx(NonZeroU32::new(n_ctx)).with_n_threads(threads()).with_n_threads_batch(threads())
}

fn complete(llama: &LlamaBackend, loaded: &mut Option<Loaded>, c: &Completion) -> Result<Reply, String> {
    let started = Instant::now();
    let model = load(llama, loaded, &c.model_path)?;

    let template = model.chat_template(None).map_err(|e| format!("The AI model has no chat template: {e}"))?;
    let messages = [
        LlamaChatMessage::new("system".into(), c.system.clone()).map_err(|e| e.to_string())?,
        LlamaChatMessage::new("user".into(), c.user.clone()).map_err(|e| e.to_string())?,
    ];
    let prompt = model.apply_chat_template(&template, &messages, true).map_err(|e| format!("Couldn't build the prompt: {e}"))?;
    let vocab = model.vocab();
    let tokens = vocab.tokenize(prompt.as_bytes(), false, true);
    let n_prompt = tokens.len() as u32;
    if n_prompt + c.max_tokens > c.n_ctx {
        return Err(format!("The text is too long for the built-in local AI ({n_prompt} tokens, room for {}).", c.n_ctx.saturating_sub(c.max_tokens)));
    }

    // The sampler first: a bad schema should fail before the model reads anything.
    let mut samplers = vec![];
    if let Some(schema) = &c.json_schema {
        let grammar = llama_cpp_2::json_schema_to_grammar(schema).map_err(|e| format!("bad output schema: {e}"))?;
        samplers.push(LlamaSampler::grammar(model, &grammar, "root").map_err(|e| format!("bad output schema: {e}"))?);
    }
    if c.temperature <= 0.0 {
        samplers.push(LlamaSampler::greedy());
    } else {
        samplers.push(LlamaSampler::top_k(40));
        samplers.push(LlamaSampler::top_p(0.9, 1));
        samplers.push(LlamaSampler::temp(c.temperature));
        samplers.push(LlamaSampler::dist(1234));
    }
    let mut sampler = LlamaSampler::chain_simple(samplers);

    let ctx_params = context_params(c.n_ctx).with_n_batch(BATCH as u32).with_n_ubatch(BATCH as u32);
    let mut ctx = model.new_context(llama, ctx_params).map_err(|e| format!("There is not enough memory for the built-in local AI: {e}"))?;

    // Read the prompt in batches; only the last token needs logits.
    let mut batch = LlamaBatch::new(BATCH, 1);
    for (start, chunk) in tokens.chunks(BATCH).enumerate().map(|(i, ch)| (i * BATCH, ch)) {
        batch.clear();
        for (j, t) in chunk.iter().enumerate() {
            let pos = start + j;
            batch.add(*t, pos as i32, &[0], pos + 1 == tokens.len()).map_err(|e| e.to_string())?;
        }
        ctx.decode(&mut batch).map_err(|e| format!("The built-in local AI failed while reading: {e}"))?;
        send(&Event::Progress { phase: Phase::Reading, done: (start + chunk.len()) as u32, total: n_prompt });
    }

    let mut out: Vec<u8> = vec![];
    let mut n_cur = tokens.len() as i32;
    let mut written = 0u32;
    let mut truncated = true;
    while written < c.max_tokens {
        // `sample` also accepts the token into the samplers (grammar state included); accepting it again
        // would push the grammar past it.
        let token = sampler.sample(&ctx, batch.n_tokens() - 1);
        if vocab.is_eog(token) {
            truncated = false;
            break;
        }
        out.extend(vocab.token_to_piece(token, false, None));
        written += 1;
        if written % 32 == 0 {
            send(&Event::Progress { phase: Phase::Writing, done: written, total: 0 });
        }
        batch.clear();
        batch.add(token, n_cur, &[0], true).map_err(|e| e.to_string())?;
        n_cur += 1;
        ctx.decode(&mut batch).map_err(|e| format!("The built-in local AI failed while writing: {e}"))?;
    }

    Ok(Reply {
        text: String::from_utf8_lossy(&out).into_owned(),
        prompt_tokens: n_prompt,
        output_tokens: written,
        seconds: started.elapsed().as_secs_f32(),
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_helper_names_what_it_runs_on() {
        let b = backend();
        assert_eq!(b.backend, if cfg!(target_os = "macos") { "metal" } else { "cpu" });
    }

    #[test]
    fn threads_stay_between_two_and_eight() {
        assert!((2..=8).contains(&threads()));
    }

    #[test]
    fn the_thread_count_follows_the_system() {
        if cfg!(target_os = "windows") {
            assert_eq!(thread_count(16, Some(8)), 8);
            assert_eq!(thread_count(16, Some(12)), 8);
            assert_eq!(thread_count(8, Some(4)), 4);
            assert_eq!(thread_count(4, Some(2)), 2);
            assert_eq!(thread_count(2, Some(1)), 2);
            // No core figure: half the logical threads.
            assert_eq!(thread_count(12, None), 6);
            assert_eq!(thread_count(32, None), 8);
            assert_eq!(thread_count(2, None), 2);
        } else {
            assert_eq!(thread_count(10, None), 8);
            assert_eq!(thread_count(10, Some(4)), 8);
            assert_eq!(thread_count(4, None), 4);
            assert_eq!(thread_count(1, None), 2);
        }
    }

    #[test]
    fn a_missing_model_file_is_a_plain_error_not_a_crash() {
        let llama = LlamaBackend::init().unwrap();
        let mut loaded = None;
        let c = Completion { model_path: "/nonexistent/model.gguf".into(), n_ctx: 512, system: String::new(), user: String::new(), json_schema: None, max_tokens: 1, temperature: 0.0 };
        let e = complete(&llama, &mut loaded, &c).unwrap_err();
        assert!(e.contains("missing") && e.contains("Settings"), "{e}");
    }
}
