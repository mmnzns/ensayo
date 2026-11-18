//! Reading the files a person picks for "Add many at once": Markdown or text files, a folder of them, or a Notion
//! export zip. Only reads; nothing is saved here and nothing is logged. The text goes to the screen, which splits it
//! into stories for the person to check.

use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::Path;

/// A file this big is not one story. It is skipped with a plain line instead.
const MAX_FILE_BYTES: u64 = 300 * 1024;
const MAX_FILES: usize = 500;
const MAX_DEPTH: usize = 8;

#[derive(Debug, Serialize, PartialEq)]
pub struct StoryFile {
    pub name: String,
    pub text: String,
}

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct StoryFiles {
    pub files: Vec<StoryFile>,
    /// Plain lines about anything left out.
    pub skipped: Vec<String>,
}

fn is_text_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".txt")
}

fn short_name(path: &str) -> String {
    path.rsplit(['/', '\\']).next().unwrap_or(path).to_string()
}

fn decode(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    text.strip_prefix('\u{feff}').unwrap_or(&text).to_string()
}

impl StoryFiles {
    fn add(&mut self, name: String, bytes: &[u8]) {
        if self.files.len() >= MAX_FILES {
            let line = format!("Stopped at {MAX_FILES} files. Pick fewer at a time.");
            if !self.skipped.contains(&line) {
                self.skipped.push(line);
            }
            return;
        }
        let text = decode(bytes);
        if text.trim().is_empty() {
            return;
        }
        self.files.push(StoryFile { name, text });
    }
}

fn read_file(path: &Path, out: &mut StoryFiles) {
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    match fs::metadata(path) {
        Ok(m) if m.len() > MAX_FILE_BYTES => out.skipped.push(format!("{name} is too long to be one story.")),
        Ok(_) => match fs::read(path) {
            Ok(bytes) => out.add(name, &bytes),
            Err(_) => out.skipped.push(format!("{name} could not be opened.")),
        },
        Err(_) => out.skipped.push(format!("{name} could not be opened.")),
    }
}

fn read_folder(dir: &Path, depth: usize, out: &mut StoryFiles) {
    let Ok(entries) = fs::read_dir(dir) else {
        out.skipped.push(format!("{} could not be opened.", short_name(&dir.to_string_lossy())));
        return;
    };
    let mut paths: Vec<_> = entries.flatten().map(|e| e.path()).collect();
    paths.sort();
    for p in paths {
        if p.is_dir() {
            if depth < MAX_DEPTH {
                read_folder(&p, depth + 1, out);
            }
        } else if is_text_name(&p.to_string_lossy()) {
            read_file(&p, out);
        }
    }
}

fn read_zip(path: &Path, out: &mut StoryFiles) {
    let label = short_name(&path.to_string_lossy());
    let Ok(file) = fs::File::open(path) else {
        out.skipped.push(format!("{label} could not be opened."));
        return;
    };
    let Ok(mut archive) = zip::ZipArchive::new(file) else {
        out.skipped.push(format!("{label} is not a zip Ensayo can open."));
        return;
    };
    let mut nested = 0;
    for i in 0..archive.len() {
        let Ok(mut entry) = archive.by_index(i) else { continue };
        if entry.is_dir() || entry.is_symlink() {
            continue;
        }
        let name = entry.name().to_string();
        if name.starts_with("__MACOSX/") || name.contains("/__MACOSX/") {
            continue;
        }
        if name.to_lowercase().ends_with(".zip") {
            nested += 1;
            continue;
        }
        if !is_text_name(&name) {
            continue;
        }
        let short = short_name(&name);
        if entry.size() > MAX_FILE_BYTES {
            out.skipped.push(format!("{short} is too long to be one story."));
            continue;
        }
        let mut bytes = Vec::new();
        if (&mut entry).take(MAX_FILE_BYTES + 1).read_to_end(&mut bytes).is_err() {
            out.skipped.push(format!("{short} could not be read."));
            continue;
        }
        out.add(short, &bytes);
    }
    if nested > 0 {
        out.skipped.push(format!("{label} has {nested} zip{} inside it. Unzip it and pick the folder instead.", if nested == 1 { "" } else { "s" }));
    }
}

/// Everything readable under the picked paths, in the order picked (a folder's files in name order).
pub fn collect(paths: &[String]) -> StoryFiles {
    let mut out = StoryFiles::default();
    for p in paths {
        let path = Path::new(p);
        if path.is_dir() {
            read_folder(path, 0, &mut out);
        } else if p.to_lowercase().ends_with(".zip") {
            read_zip(path, &mut out);
        } else if is_text_name(p) {
            read_file(path, &mut out);
        } else {
            out.skipped.push(format!("{} is not a Markdown or text file.", short_name(p)));
        }
    }
    out
}

#[tauri::command]
pub async fn read_story_files(paths: Vec<String>) -> Result<StoryFiles, String> {
    tauri::async_runtime::spawn_blocking(move || collect(&paths)).await.map_err(|e| e.to_string())
}

/// The listed price of a model in US dollars per million tokens, `[input, output]`, or nothing when it is not listed.
/// The bulk import uses it to say roughly what reading many stories will cost.
#[tauri::command]
pub fn model_price(model: String) -> Option<[f64; 2]> {
    crate::ai::cost::price(model.trim()).map(|p| [p.input, p.output])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn zip_with(path: &Path, entries: &[(&str, &str)]) {
        let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        for (name, body) in entries {
            zip.start_file(*name, opts).unwrap();
            zip.write_all(body.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
    }

    #[test]
    fn a_folder_gives_its_markdown_and_text_files_in_name_order() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("b.md"), "# Beta\nbody").unwrap();
        fs::write(dir.path().join("a.txt"), "Alpha").unwrap();
        fs::write(dir.path().join("pic.png"), [1, 2, 3]).unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("sub").join("c.md"), "Gamma").unwrap();
        let got = collect(&[dir.path().to_string_lossy().to_string()]);
        let names: Vec<_> = got.files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, ["a.txt", "b.md", "c.md"]);
        assert!(got.skipped.is_empty());
    }

    #[test]
    fn picked_files_keep_their_order_and_other_kinds_are_named() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.md");
        let b = dir.path().join("b.pdf");
        fs::write(&a, "\u{feff}Hello").unwrap();
        fs::write(&b, "x").unwrap();
        let got = collect(&[b.to_string_lossy().to_string(), a.to_string_lossy().to_string()]);
        assert_eq!(got.files, vec![StoryFile { name: "a.md".into(), text: "Hello".into() }]);
        assert_eq!(got.skipped, vec!["b.pdf is not a Markdown or text file.".to_string()]);
    }

    #[test]
    fn a_notion_zip_gives_its_markdown_and_skips_images_and_inner_zips() {
        let dir = tempfile::tempdir().unwrap();
        let z = dir.path().join("Export.zip");
        zip_with(&z, &[("Stories/Win back 0123.md", "# Win back"), ("Stories/img.png", "x"), ("__MACOSX/Stories/._a.md", "junk"), ("Part-2.zip", "x")]);
        let got = collect(&[z.to_string_lossy().to_string()]);
        assert_eq!(got.files.len(), 1);
        assert_eq!(got.files[0].name, "Win back 0123.md");
        assert!(got.skipped[0].contains("1 zip inside it"), "{:?}", got.skipped);
    }

    #[test]
    fn a_huge_file_and_an_empty_file_are_not_stories() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("big.md"), vec![b'a'; (MAX_FILE_BYTES + 1) as usize]).unwrap();
        fs::write(dir.path().join("empty.md"), "  \n").unwrap();
        let got = collect(&[dir.path().to_string_lossy().to_string()]);
        assert!(got.files.is_empty());
        assert_eq!(got.skipped, vec!["big.md is too long to be one story.".to_string()]);
    }

    #[test]
    fn model_price_knows_a_listed_model_only() {
        assert_eq!(model_price("claude-sonnet-5-5".into()), Some([2.0, 10.0]));
        assert_eq!(model_price("nope".into()), None);
    }
}
