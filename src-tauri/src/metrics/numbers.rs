//! Numbers said out loud, normalised so they can be matched with a story's proof points ("twenty-four percent"
//! equals 24 %). Approximations ("about a quarter") are not matched here; the AI covers them in M4.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Number {
    pub value: f64,
    pub percent: bool,
    /// What was said or written, for showing back to the user.
    pub raw: String,
    /// Position of the first token (a word of the transcript when extracted from words).
    pub token: usize,
}

enum Part {
    Unit(u64),
    Tens(u64),
    Hundred,
    Scale(f64),
}

fn word_part(w: &str) -> Option<Part> {
    const UNITS: [&str; 20] = [
        "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
        "seventeen", "eighteen", "nineteen",
    ];
    const TENS: [&str; 8] = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
    if let Some(i) = UNITS.iter().position(|u| *u == w) {
        return Some(Part::Unit(i as u64));
    }
    if let Some(i) = TENS.iter().position(|t| *t == w) {
        return Some(Part::Tens((i as u64 + 2) * 10));
    }
    match w {
        "hundred" => Some(Part::Hundred),
        "thousand" => Some(Part::Scale(1e3)),
        "million" => Some(Part::Scale(1e6)),
        "billion" => Some(Part::Scale(1e9)),
        _ => None,
    }
}

fn scale_word(w: &str) -> Option<f64> {
    match w {
        "hundred" => Some(100.0),
        "thousand" => Some(1e3),
        "million" => Some(1e6),
        "billion" => Some(1e9),
        _ => None,
    }
}

/// Lower-case pieces of the text with the position of the whitespace token each came from. Hyphenated words split
/// ("twenty-four"); edge punctuation goes, except a leading currency sign and a trailing percent sign, which stay.
fn tokens(text: &str) -> Vec<(String, usize)> {
    let mut out = Vec::new();
    for (i, raw) in text.split_whitespace().enumerate() {
        for piece in raw.split(['-', '\u{2013}', '\u{2014}']) {
            let t = piece.trim_matches(|c: char| !(c.is_alphanumeric() || c == '%' || c == '.')).trim_end_matches('.').to_lowercase();
            if !t.is_empty() {
                out.push((t, i));
            }
        }
    }
    out
}

fn percent_follows(toks: &[(String, usize)], at: usize) -> Option<usize> {
    match toks.get(at).map(|t| t.0.as_str()) {
        Some("percent") | Some("%") => Some(1),
        Some("per") if toks.get(at + 1).map(|t| t.0.as_str()) == Some("cent") => Some(2),
        _ => None,
    }
}

pub fn extract(text: &str) -> Vec<Number> {
    let toks = tokens(text);
    let mut out = Vec::new();
    let mut i = 0;
    while i < toks.len() {
        let (word, token) = (&toks[i].0, toks[i].1);
        let first = word.chars().next().unwrap_or(' ');
        if first.is_ascii_digit() {
            let mut body = word.replace(',', "");
            let mut percent = false;
            let mut mult = 1.0;
            let mut consumed = 1;
            if let Some(b) = body.strip_suffix('%') {
                percent = true;
                body = b.to_string();
            } else if let Some(b) = body.strip_suffix('k') {
                mult = 1e3;
                body = b.to_string();
            } else if let Some(b) = body.strip_suffix('m') {
                mult = 1e6;
                body = b.to_string();
            } else if let Some(b) = body.strip_suffix('b') {
                mult = 1e9;
                body = b.to_string();
            } else if let Some(b) = body.strip_suffix('x') {
                body = b.to_string();
            }
            let Ok(mut value) = body.parse::<f64>() else {
                i += 1;
                continue;
            };
            if !percent {
                if let Some(m) = toks.get(i + 1).and_then(|t| scale_word(&t.0)) {
                    mult *= m;
                    consumed += 1;
                }
            }
            value *= mult;
            if !percent {
                if let Some(n) = percent_follows(&toks, i + consumed) {
                    percent = true;
                    consumed += n;
                }
            }
            out.push(Number { value, percent, raw: word.clone(), token });
            i += consumed;
            continue;
        }
        if word_part(word).is_some() {
            let (mut total, mut current) = (0f64, 0f64);
            let (mut j, mut seen_big) = (i, false);
            while j < toks.len() {
                let w = toks[j].0.as_str();
                match word_part(w) {
                    Some(Part::Unit(v)) | Some(Part::Tens(v)) => current += v as f64,
                    Some(Part::Hundred) => {
                        current = current.max(1.0) * 100.0;
                        seen_big = true;
                    }
                    Some(Part::Scale(m)) => {
                        total += current.max(1.0) * m;
                        current = 0.0;
                        seen_big = true;
                    }
                    None if w == "and" && seen_big && toks.get(j + 1).is_some_and(|t| word_part(&t.0).is_some()) => {}
                    None => break,
                }
                j += 1;
            }
            let mut consumed = j - i;
            let bare_one = consumed == 1 && word == "one";
            let percent = match percent_follows(&toks, j) {
                Some(n) => {
                    consumed += n;
                    true
                }
                None => false,
            };
            if !(bare_one && !percent) {
                out.push(Number { value: total + current, percent, raw: toks[i..i + consumed].iter().map(|t| t.0.as_str()).collect::<Vec<_>>().join(" "), token });
            }
            i += consumed;
            continue;
        }
        i += 1;
    }
    out
}

pub fn same(a: f64, b: f64) -> bool {
    (a - b).abs() <= (a.abs().max(b.abs()) * 0.005).max(0.05)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn values(text: &str) -> Vec<(f64, bool)> {
        extract(text).into_iter().map(|n| (n.value, n.percent)).collect()
    }

    #[test]
    fn digits_and_percent_signs() {
        assert_eq!(values("It went from 24% to 38%."), vec![(24.0, true), (38.0, true)]);
        assert_eq!(values("about 24 percent"), vec![(24.0, true)]);
        assert_eq!(values("24 per cent"), vec![(24.0, true)]);
        assert_eq!(values("a team of 12"), vec![(12.0, false)]);
    }

    #[test]
    fn numbers_written_as_words() {
        assert_eq!(values("twenty-four percent"), vec![(24.0, true)]);
        assert_eq!(values("twenty four percent"), vec![(24.0, true)]);
        assert_eq!(values("two hundred and fifty customers"), vec![(250.0, false)]);
        assert_eq!(values("ninety days"), vec![(90.0, false)]);
        assert_eq!(values("thirty one thousand users"), vec![(31000.0, false)]);
    }

    #[test]
    fn scales_commas_currency_and_multipliers() {
        assert_eq!(values("2.5 million records"), vec![(2_500_000.0, false)]);
        assert_eq!(values("40k users"), vec![(40_000.0, false)]);
        assert_eq!(values("$1,200 a month"), vec![(1200.0, false)]);
        assert_eq!(values("three million"), vec![(3_000_000.0, false)]);
        assert_eq!(values("a 3x lift"), vec![(3.0, false)]);
    }

    #[test]
    fn a_bare_one_is_a_pronoun_not_a_number() {
        assert!(values("one of the things I did").is_empty());
        assert_eq!(values("one million sends"), vec![(1_000_000.0, false)]);
    }

    #[test]
    fn a_full_stop_after_a_number_is_not_a_decimal_point() {
        assert_eq!(values("We reached 38. Then it grew"), vec![(38.0, false)]);
    }

    #[test]
    fn same_ignores_rounding_noise_only() {
        assert!(same(24.0, 24.0));
        assert!(same(2_500_000.0, 2_500_000.4));
        assert!(!same(38.0, 40.0));
    }

    #[test]
    fn no_numbers_gives_nothing() {
        assert!(values("we shipped it and it worked").is_empty());
    }
}
