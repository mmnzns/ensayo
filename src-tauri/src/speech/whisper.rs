//! Whisper through whisper.cpp, returning words. One word per segment (`max_len = 1` with `split_on_word`) is
//! whisper.cpp's documented way to get word timestamps.

use super::words::{clean, Word};

/// Speech threads: Mac all cores (2..=8); Windows three quarters of the logical cores (2..=12). Measured in Talaan
/// on a 16-thread Ryzen: 12 threads is fastest and 16 is 2-3x slower.
pub fn thread_count(logical: usize, windows: bool) -> usize {
    if windows { (logical * 3 / 4).clamp(2, 12) } else { logical.clamp(2, 8) }
}

pub fn threads() -> usize {
    thread_count(std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4), cfg!(windows))
}

pub fn context_params(use_gpu: bool, flash_attn: bool) -> whisper_rs::WhisperContextParameters<'static> {
    let mut p = whisper_rs::WhisperContextParameters::default();
    p.use_gpu(use_gpu);
    p.flash_attn(flash_attn);
    p
}

/// One chunk (16 kHz mono) to words relative to the chunk, and the language Whisper settled on.
/// The language is English unless told otherwise (v0 is English only).
pub fn transcribe_words(state: &mut whisper_rs::WhisperState, samples: &[f32], language: Option<&str>) -> Result<(Vec<Word>, Option<String>), String> {
    let mut params = whisper_rs::FullParams::new(whisper_rs::SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(threads() as i32);
    params.set_language(Some(language.unwrap_or("en")));
    // Each chunk stands alone: carrying text between chunks is how Whisper starts repeating itself.
    params.set_no_context(true);
    params.set_suppress_blank(true);
    params.set_suppress_nst(true);
    params.set_token_timestamps(true);
    params.set_split_on_word(true);
    params.set_max_len(1);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    // Whisper needs at least 1 s; pad short chunks with silence.
    let mut audio = samples.to_vec();
    if audio.len() < 16_000 + 1_600 {
        audio.resize(16_000 + 1_600, 0.0);
    }
    state.full(params, &audio).map_err(|e| format!("transcription failed: {e}"))?;
    let language = whisper_rs::get_lang_str(state.full_lang_id_from_state()).map(str::to_string);
    let chunk_ms = samples.len() as u64 * 1000 / 16_000;
    let mut raw = vec![];
    for i in 0..state.full_n_segments() {
        let Some(seg) = state.get_segment(i) else { continue };
        if seg.no_speech_probability() > 0.8 {
            continue;
        }
        let text = seg.to_str_lossy().map(|t| t.to_string()).unwrap_or_default();
        // Centiseconds.
        let start_ms = ((seg.start_timestamp().max(0) * 10) as u64).min(chunk_ms);
        let end_ms = ((seg.end_timestamp().max(0) * 10) as u64).min(chunk_ms).max(start_ms);
        raw.push(Word { text, start_ms, end_ms });
    }
    Ok((clean(raw), language))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_thread_count_is_three_quarters_clamped() {
        for (logical, want) in [(16, 12), (8, 6), (4, 3), (2, 2), (1, 2), (32, 12)] {
            assert_eq!(thread_count(logical, true), want, "{logical} cores");
        }
    }

    #[test]
    fn mac_thread_count_is_all_cores_clamped() {
        for (logical, want) in [(16, 8), (10, 8), (8, 8), (4, 4), (2, 2), (1, 2)] {
            assert_eq!(thread_count(logical, false), want, "{logical} cores");
        }
    }
}
