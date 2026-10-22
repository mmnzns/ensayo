//! Keeps secrets and the person's name out of the log and out of the diagnostics block. Two layers: exact values
//! that are known (a saved key), and patterns for things that look like keys or that name the home folder. Nothing
//! here reads a file or the network, so it is cheap to run on every log line.

use std::path::Path;

/// What to blank out. `names` are the home folder's path and the user name in it; `secrets` are exact values
/// (an API key) to blank wherever they appear.
#[derive(Debug, Clone, Default)]
pub struct Redactor {
    pub names: Vec<String>,
    pub secrets: Vec<String>,
}

impl Redactor {
    /// The home folder and user name of whoever is running Ensayo.
    pub fn for_this_computer() -> Redactor {
        let mut names = Vec::new();
        if let Some(home) = dirs::home_dir() {
            names.extend(home_names(&home));
        }
        for var in ["USER", "USERNAME", "LOGNAME"] {
            if let Ok(v) = std::env::var(var) {
                names.push(v);
            }
        }
        Redactor { names: tidy(names), secrets: Vec::new() }
    }

    pub fn with_secrets(mut self, secrets: impl IntoIterator<Item = String>) -> Redactor {
        self.secrets.extend(secrets.into_iter().filter(|s| s.trim().len() >= 6));
        self
    }

    pub fn apply(&self, text: &str) -> String {
        let mut out = text.to_string();
        for s in &self.secrets {
            out = out.replace(s.as_str(), "[key]");
        }
        // Longest first, so the whole home path goes before the bare user name inside it.
        for n in &self.names {
            let replacement = if n.contains('/') || n.contains('\\') { "~" } else { "<user>" };
            out = out.replace(n.as_str(), replacement);
        }
        blank_keys(&out)
    }
}

/// The home folder's path (both slash styles) and its last component, the user name.
fn home_names(home: &Path) -> Vec<String> {
    let full = home.to_string_lossy().into_owned();
    let mut v = vec![full.replace('\\', "/"), full.clone()];
    if let Some(name) = home.file_name() {
        v.push(name.to_string_lossy().into_owned());
    }
    v
}

/// Drops names too short to match safely, repeats, and orders longest first.
fn tidy(mut names: Vec<String>) -> Vec<String> {
    names.retain(|n| n.trim().chars().count() >= 3);
    names.sort_by_key(|n| std::cmp::Reverse(n.len()));
    names.dedup();
    names
}

pub fn redactor_for_home(home: &Path, user: &str) -> Redactor {
    let mut names = home_names(home);
    names.push(user.to_string());
    Redactor { names: tidy(names), secrets: Vec::new() }
}

const KEY_PREFIXES: [&str; 7] = ["sk-", "sk_", "gsk_", "AIza", "xai-", "pk-", "ghp_"];

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

/// A run of characters that looks like an API key: a well-known prefix, or a long mix of letters and digits.
fn looks_like_key(run: &str) -> bool {
    let n = run.chars().count();
    if n >= 12 && KEY_PREFIXES.iter().any(|p| run.starts_with(p)) {
        return true;
    }
    n >= 32 && run.chars().any(|c| c.is_ascii_digit()) && run.chars().any(|c| c.is_ascii_alphabetic())
}

/// Blanks `key=...` in a web address and anything shaped like an API key.
pub fn blank_keys(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if is_token_char(c) {
            let start = i;
            while i < chars.len() && is_token_char(chars[i]) {
                i += 1;
            }
            let run: String = chars[start..i].iter().collect();
            let after_key_eq = out.ends_with("key=") || out.ends_with("token=") || out.ends_with("apikey=");
            if after_key_eq || looks_like_key(&run) {
                out.push_str("[key]");
            } else {
                out.push_str(&run);
            }
        } else {
            out.push(c);
            i += 1;
        }
    }
    out
}

/// `p` relative to the data folder `root`, with forward slashes. A path outside it shows only its last part, so the
/// user name in the rest of the path never reaches the log.
pub fn relative_to(root: &Path, p: &Path) -> String {
    match p.strip_prefix(root) {
        Ok(rel) => rel.to_string_lossy().replace('\\', "/"),
        Err(_) => p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
    }
}

/// `text` cut to at most `max` bytes, on a character boundary, with an ellipsis when something was dropped.
pub fn truncate(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_string();
    }
    let mut end = max;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}...", &text[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn me() -> Redactor {
        redactor_for_home(Path::new("/Users/dana.okafor"), "dana.okafor")
    }

    #[test]
    fn the_home_folder_becomes_a_tilde_and_the_user_name_is_gone() {
        let out = me().apply("failed to read /Users/dana.okafor/Library/Application Support/x.json for dana.okafor");
        assert!(!out.contains("dana"), "{out}");
        assert!(!out.contains("okafor"), "{out}");
        assert!(out.contains("~/Library"), "{out}");
    }

    #[test]
    fn windows_style_paths_are_covered_too() {
        let r = redactor_for_home(Path::new(r"C:\Users\dana"), "dana");
        let out = r.apply(r"C:\Users\dana\AppData\Local\x and C:/Users/dana/y");
        assert!(!out.contains("dana"), "{out}");
    }

    #[test]
    fn a_known_secret_is_blanked_wherever_it_is() {
        let r = Redactor::default().with_secrets(["hunter2-secret".to_string()]);
        assert_eq!(r.apply("the key hunter2-secret failed, hunter2-secret"), "the key [key] failed, [key]");
    }

    #[test]
    fn things_shaped_like_keys_are_blanked() {
        let r = Redactor::default();
        for text in [
            "sk-ant-api03-abcDEF123456789",
            "https://api.example.com/v1?key=AbC12345 trailing",
            "token AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY",
            "0123456789abcdef0123456789abcdef0123",
        ] {
            let out = r.apply(text);
            assert!(out.contains("[key]"), "{text} -> {out}");
            assert!(!out.contains("abcDEF123456789") && !out.contains("AbC12345") && !out.contains("9tSrke72") && !out.contains("0123456789abcdef0123"), "{out}");
        }
    }

    #[test]
    fn ordinary_words_ids_and_model_names_are_left_alone() {
        let r = Redactor::default();
        for text in ["finish_rep 1234 ms", "ai claude fast model=claude-haiku-5-5 in=812 out=96", "session ses-1a2b3c4d done", "Qwen3.5-4B-Q4_K_M.gguf is ready"] {
            assert_eq!(r.apply(text), text);
        }
    }

    #[test]
    fn short_names_are_not_used_to_match() {
        let r = redactor_for_home(Path::new("/Users/al"), "al");
        assert_eq!(r.apply("al is in the middle of globally"), "al is in the middle of globally");
    }

    #[test]
    fn paths_are_shown_relative_to_the_data_folder() {
        let root = Path::new("/Users/dana/Drive/Ensayo");
        assert_eq!(relative_to(root, &root.join("bank/stories/s1.json")), "bank/stories/s1.json");
        assert_eq!(relative_to(root, Path::new("/Users/dana/elsewhere/file.txt")), "file.txt");
    }

    #[test]
    fn truncation_never_splits_a_character() {
        assert_eq!(truncate("short", 10), "short");
        let cut = truncate(&"é".repeat(50), 11);
        assert!(cut.ends_with("..."));
        assert!(cut.len() <= 14);
    }
}
