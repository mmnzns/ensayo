//! Fixing a mis-heard word. The person edits the transcript line by line; this turns the edited lines back into words
//! with times, so the measuring and the AI judge run on the corrected text. The original words are kept next to the
//! rep in `transcript.original.json` and are never overwritten.
//!
//! Rules: the words of an edited line are matched to the original words of that line in order. A matched word keeps
//! its own time. An edited word keeps the time of the word it replaced. A word added in between shares the time of the
//! word before it. A word taken out is dropped. Times never go backwards.

use crate::metrics::sentences::Sentence;
use crate::speech::words::Word;
use crate::storage::io::is_safe_id;
use crate::storage::versioned::{load_record, save_record};
use crate::storage::{migrate, Storage};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// The file holding the words as the speech model first heard them.
pub const ORIGINAL_FILE: &str = "transcript.original.json";

#[derive(Serialize, Deserialize)]
struct OriginalFile {
    words: Vec<Word>,
}

fn rep_dir(storage: &Storage, session: &str, n: u32) -> Option<PathBuf> {
    is_safe_id(session).then(|| storage.root().join("sessions").join(session).join("reps").join(n.to_string()))
}

/// True when the rep's transcript was fixed by the person (its original words are on file).
pub fn is_edited(storage: &Storage, session: &str, n: u32) -> bool {
    rep_dir(storage, session, n).is_some_and(|d| d.join(ORIGINAL_FILE).is_file())
}

/// The rep numbers of a session whose transcript was fixed.
pub fn edited_reps(storage: &Storage, session: &str) -> Vec<u32> {
    storage.rep_numbers(session).into_iter().filter(|n| is_edited(storage, session, *n)).collect()
}

/// The words as first heard, when the transcript was fixed.
pub fn original_words(storage: &Storage, session: &str, n: u32) -> Option<Vec<Word>> {
    let dir = rep_dir(storage, session, n)?;
    load_record::<OriginalFile>(&dir.join(ORIGINAL_FILE), migrate::unchanged).ok().flatten().map(|f| f.words)
}

/// Keeps the words as heard. Does nothing when they are already kept: the first words are the original, always.
pub fn keep_original(storage: &Storage, session: &str, n: u32, words: &[Word]) -> Result<(), String> {
    let dir = rep_dir(storage, session, n).ok_or("Ensayo couldn't find that answer.")?;
    if dir.join(ORIGINAL_FILE).is_file() {
        return Ok(());
    }
    save_record(&dir.join(ORIGINAL_FILE), &OriginalFile { words: words.to_vec() }).map_err(|e| e.to_string())
}

/// A word for matching: lower case, with punctuation off its ends.
fn key(text: &str) -> String {
    text.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase()
}

/// One edited line against the original words of that line.
fn edit_line(original: &[Word], line: &str, previous: Option<&Word>) -> Vec<Word> {
    let new: Vec<&str> = line.split_whitespace().collect();
    let (a, b) = (original.len(), new.len());
    // Longest common run of equal words, so a fixed word in the middle does not shift everything after it.
    let same = |i: usize, j: usize| key(&original[i].text) == key(new[j]) && !key(new[j]).is_empty();
    let mut lcs = vec![vec![0usize; b + 1]; a + 1];
    for i in (0..a).rev() {
        for j in (0..b).rev() {
            lcs[i][j] = if same(i, j) { lcs[i + 1][j + 1] + 1 } else { lcs[i + 1][j].max(lcs[i][j + 1]) };
        }
    }
    let mut out: Vec<Word> = Vec::with_capacity(b);
    // The time an inserted word shares: the word before it, or the line's first word when it opens the line.
    let share = |out: &Vec<Word>, i: usize| -> (u64, u64) {
        out.last().or(previous).map(|w| (w.start_ms, w.end_ms)).unwrap_or_else(|| {
            let o = &original[i.min(a.saturating_sub(1))];
            (o.start_ms, o.end_ms)
        })
    };
    // Walk the matching. Words dropped and words added between two matches are one stretch: they pair up in order
    // (a replacement), and what is left over is dropped or added.
    let (mut i, mut j) = (0, 0);
    let (mut old_from, mut new_from) = (0, 0);
    let flush = |out: &mut Vec<Word>, old_from: usize, old_to: usize, new_from: usize, new_to: usize| {
        for k in 0..(new_to - new_from) {
            let text = new[new_from + k].to_string();
            if old_from + k < old_to {
                out.push(Word { text, ..original[old_from + k].clone() });
            } else {
                let (start_ms, end_ms) = share(out, old_from);
                out.push(Word { text, start_ms, end_ms });
            }
        }
    };
    while i < a || j < b {
        if i < a && j < b && same(i, j) && lcs[i][j] == lcs[i + 1][j + 1] + 1 {
            flush(&mut out, old_from, i, new_from, j);
            out.push(Word { text: new[j].to_string(), ..original[i].clone() });
            i += 1;
            j += 1;
            old_from = i;
            new_from = j;
        } else if i < a && (j >= b || lcs[i + 1][j] >= lcs[i][j + 1]) {
            i += 1;
        } else {
            j += 1;
        }
    }
    flush(&mut out, old_from, i, new_from, j);
    out
}

/// The words after the person fixed the transcript. `words` are the words the screen showed, `sentences` split them
/// into the lines the person edited, and `lines` is one edited text per line. Words outside every line stay as they are.
pub fn edit_words(words: &[Word], sentences: &[Sentence], lines: &[String]) -> Result<Vec<Word>, String> {
    if sentences.len() != lines.len() {
        return Err("The transcript changed while you were editing it. Open it again.".into());
    }
    let mut out: Vec<Word> = Vec::with_capacity(words.len());
    let mut at = 0usize;
    for (s, line) in sentences.iter().zip(lines) {
        let first = s.first_word.min(words.len());
        let end = (s.first_word + s.word_count).min(words.len());
        if first < at {
            return Err("The transcript changed while you were editing it. Open it again.".into());
        }
        out.extend_from_slice(&words[at..first]);
        let edited = edit_line(&words[first..end], line, out.last());
        out.extend(edited);
        at = end;
    }
    out.extend_from_slice(&words[at..]);
    // Times never go backwards, whatever was typed.
    let mut floor = 0u64;
    for w in out.iter_mut() {
        w.start_ms = w.start_ms.max(floor);
        w.end_ms = w.end_ms.max(w.start_ms);
        floor = w.start_ms;
    }
    if out.is_empty() {
        return Err("Leave at least one word in the transcript.".into());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn w(text: &str, a: u64, b: u64) -> Word {
        Word { text: text.into(), start_ms: a, end_ms: b }
    }

    fn line(words: &[Word]) -> Sentence {
        Sentence { index: 1, text: words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" "), start_ms: words[0].start_ms, end_ms: words[words.len() - 1].end_ms, first_word: 0, word_count: words.len() }
    }

    fn fix(original: &[Word], text: &str) -> Vec<Word> {
        edit_words(original, &[line(original)], &[text.to_string()]).unwrap()
    }

    fn base() -> Vec<Word> {
        vec![w("We", 0, 100), w("cut", 200, 300), w("churn", 400, 500), w("by", 600, 700), w("eight", 800, 900)]
    }

    fn monotonic(words: &[Word]) -> bool {
        words.windows(2).all(|p| p[0].start_ms <= p[1].start_ms) && words.iter().all(|x| x.start_ms <= x.end_ms)
    }

    #[test]
    fn an_edited_word_keeps_the_time_of_the_word_it_replaced() {
        let got = fix(&base(), "We cut churn by 18%.");
        assert_eq!(got.iter().map(|x| x.text.as_str()).collect::<Vec<_>>(), vec!["We", "cut", "churn", "by", "18%."]);
        assert_eq!((got[4].start_ms, got[4].end_ms), (800, 900));
        assert_eq!(got[0], base()[0]);
    }

    #[test]
    fn a_changed_word_in_the_middle_does_not_shift_the_words_after_it() {
        let got = fix(&base(), "We cut turn by eight");
        assert_eq!(got[2].text, "turn");
        assert_eq!((got[2].start_ms, got[2].end_ms), (400, 500));
        assert_eq!((got[4].start_ms, got[4].end_ms), (800, 900));
    }

    #[test]
    fn an_added_word_shares_the_time_of_the_word_before_it() {
        let got = fix(&base(), "We cut churn by about eight");
        assert_eq!(got.len(), 6);
        assert_eq!(got[4].text, "about");
        assert_eq!((got[4].start_ms, got[4].end_ms), (600, 700));
        assert_eq!((got[5].start_ms, got[5].end_ms), (800, 900));
        assert!(monotonic(&got));
    }

    #[test]
    fn a_word_added_at_the_start_takes_the_time_of_the_first_word() {
        let got = fix(&base(), "So we cut churn by eight");
        assert_eq!(got[0].text, "So");
        assert_eq!((got[0].start_ms, got[0].end_ms), (0, 100));
        assert!(monotonic(&got));
    }

    #[test]
    fn a_word_taken_out_is_dropped() {
        let got = fix(&base(), "We cut churn eight");
        assert_eq!(got.len(), 4);
        assert_eq!(got[3].text, "eight");
        assert_eq!((got[3].start_ms, got[3].end_ms), (800, 900));
    }

    #[test]
    fn several_replaced_and_added_words_stay_in_order() {
        let got = fix(&base(), "We cut churn by a lot more than eight");
        assert!(monotonic(&got));
        assert_eq!(got.len(), 9);
        assert_eq!(got.last().unwrap().text, "eight");
        assert_eq!(got.last().unwrap().start_ms, 800);
    }

    #[test]
    fn another_lines_words_are_left_alone_and_a_line_count_mismatch_is_refused() {
        let mut all = base();
        all.extend([w("Then", 2000, 2100), w("done", 2200, 2300)]);
        let s = [Sentence { first_word: 0, word_count: 5, ..line(&all[..5]) }, Sentence { index: 2, first_word: 5, word_count: 2, ..line(&all[5..]) }];
        let got = edit_words(&all, &s, &["We cut churn by 18%.".into(), "Then done".into()]).unwrap();
        assert_eq!(got[5..], all[5..]);
        assert!(edit_words(&all, &s, &["only one".into()]).is_err());
    }

    #[test]
    fn emptying_everything_is_refused() {
        assert!(edit_words(&base(), &[line(&base())], &["  ".into()]).is_err());
    }
}
