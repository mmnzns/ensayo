//! The built-in local AI models (GGUF files run by the `ensayo-llm` helper): the catalog, where each one lives on this
//! computer, and what Settings shows about it. Same two models Talaan picked by a bake-off on a Mac: Qwen3.5 4B is the
//! recommended one, 9B is an optional larger size. Files download with the speech models' downloader into
//! `<models>/llm/<id>/`, and a copy Talaan already downloaded is used read-only ("On this computer").

use crate::paths;
use crate::speech::models::{EngineKind, Location, ModelFile, ModelInfo, ModelStore};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug)]
pub struct LocalModel {
    pub info: ModelInfo,
    /// The model's own licence, for Settings and THIRD_PARTY_NOTICES.md.
    pub licence: &'static str,
    pub recommended: bool,
}

pub static CATALOG: &[LocalModel] = &[
    LocalModel {
        info: ModelInfo {
            id: "qwen3.5-4b",
            name: "Qwen3.5 4B",
            maker: "Qwen",
            note: "Recommended. Small and quick enough for a laptop, and good at judging an answer.",
            engine: EngineKind::Llm,
            languages: "Many languages",
            speed: 3,
            accuracy: 2,
            files: &[ModelFile {
                name: "Qwen3.5-4B-Q4_K_M.gguf",
                url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf",
                size: 2_740_937_888,
                sha256: "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
            }],
        },
        licence: "Apache-2.0",
        recommended: true,
    },
    LocalModel {
        info: ModelInfo {
            id: "qwen3.5-9b",
            name: "Qwen3.5 9B",
            maker: "Qwen",
            note: "Larger. A little more thorough; needs 16 GB of memory and takes about twice as long.",
            engine: EngineKind::Llm,
            languages: "Many languages",
            speed: 2,
            accuracy: 3,
            files: &[ModelFile {
                name: "Qwen3.5-9B-Q4_K_M.gguf",
                url: "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/3885219b6810b007914f3a7950a8d1b469d598a5/Qwen3.5-9B-Q4_K_M.gguf",
                size: 5_680_522_464,
                sha256: "03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8",
            }],
        },
        licence: "Apache-2.0",
        recommended: false,
    },
];

/// The model most people should use.
pub fn recommended() -> &'static LocalModel {
    CATALOG.iter().find(|m| m.recommended).expect("the catalog has a recommended model")
}

pub fn find(id: &str) -> Option<&'static LocalModel> {
    CATALOG.iter().find(|m| m.info.id == id)
}

/// The model a settings value names. The value is `AiSettings::fast_model`; empty, or left over from a cloud
/// provider ("claude-haiku-5-5"), means the recommended one.
pub fn choose(setting: &str) -> &'static LocalModel {
    find(setting.trim()).unwrap_or_else(recommended)
}

/// Ensayo's models folder for the built-in AI (`<models>/llm`), with Talaan's copies readable.
pub fn store() -> ModelStore {
    ModelStore::new(paths::models_dir().join("llm"), true)
}

/// Ensayo's own folder only (what a download writes to); never Talaan's.
pub fn own_store() -> ModelStore {
    ModelStore::new(paths::models_dir().join("llm"), false)
}

impl LocalModel {
    /// The GGUF file to hand the helper, wherever it was found.
    pub fn file_in(&self, loc: &Location) -> Option<PathBuf> {
        loc.dir().map(|d| d.join(self.info.files[0].name))
    }

    pub fn size_mb(&self) -> u64 {
        self.info.size() / 1_000_000
    }
}

/// What Settings shows for one model.
#[derive(Debug, Serialize, PartialEq)]
pub struct LocalAiStatus {
    pub id: &'static str,
    pub name: &'static str,
    pub maker: &'static str,
    pub note: &'static str,
    pub licence: &'static str,
    pub size_mb: u64,
    pub recommended: bool,
    /// "ready" (Ensayo's copy), "on_this_computer" (one Talaan downloaded, used in place) or "missing".
    pub state: &'static str,
}

pub fn state_of(loc: &Location) -> &'static str {
    match loc {
        Location::Own(_) => "ready",
        Location::OnThisComputer(_) => "on_this_computer",
        Location::Missing => "missing",
    }
}

pub fn status_in(store: &ModelStore) -> Vec<LocalAiStatus> {
    CATALOG
        .iter()
        .map(|m| LocalAiStatus {
            id: m.info.id,
            name: m.info.name,
            maker: m.info.maker,
            note: m.info.note,
            licence: m.licence,
            size_mb: m.size_mb(),
            recommended: m.recommended,
            state: state_of(&store.locate(&m.info)),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn sparse(path: &std::path::Path, size: u64) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let f = fs::File::create(path).unwrap();
        f.set_len(size).unwrap();
    }

    #[test]
    fn the_catalog_has_one_recommended_small_model_and_one_larger() {
        assert_eq!(CATALOG.len(), 2);
        assert_eq!(CATALOG.iter().filter(|m| m.recommended).count(), 1);
        assert_eq!(recommended().info.id, "qwen3.5-4b");
        assert!(CATALOG[1].info.size() > CATALOG[0].info.size());
        for m in CATALOG {
            assert_eq!(m.info.engine, EngineKind::Llm);
            assert!(!m.info.engine.is_speech());
            assert_eq!(m.info.files.len(), 1);
            let f = &m.info.files[0];
            assert!(f.name.ends_with(".gguf"));
            assert_eq!(f.sha256.len(), 64);
            assert!(f.url.starts_with("https://") && f.url.ends_with(f.name));
            assert_eq!(m.licence, "Apache-2.0");
        }
    }

    #[test]
    fn a_settings_value_picks_a_model_and_anything_else_means_the_recommended_one() {
        assert_eq!(choose("qwen3.5-9b").info.id, "qwen3.5-9b");
        assert_eq!(choose(" qwen3.5-4b ").info.id, "qwen3.5-4b");
        assert_eq!(choose("").info.id, "qwen3.5-4b");
        assert_eq!(choose("claude-haiku-5-5").info.id, "qwen3.5-4b", "left over from a cloud provider");
    }

    #[test]
    fn ensayos_own_copy_lives_under_models_llm_and_talaans_is_found_read_only() {
        let data = tempfile::tempdir().unwrap();
        let talaan = tempfile::tempdir().unwrap();
        let m = recommended();
        let file = m.info.files[0].name;
        let root = data.path().join("models").join("llm");
        let mut store = ModelStore { root: root.clone(), talaan_root: Some(talaan.path().to_path_buf()), reuse: true };
        assert_eq!(store.locate(&m.info), Location::Missing);
        assert_eq!(m.file_in(&Location::Missing), None);
        assert_eq!(state_of(&Location::Missing), "missing");

        // Talaan keeps it at <its models>/<id>/<file>.
        sparse(&talaan.path().join(m.info.id).join(file), m.info.files[0].size);
        let found = store.locate(&m.info);
        assert_eq!(found, Location::OnThisComputer(talaan.path().join(m.info.id)));
        assert_eq!(state_of(&found), "on_this_computer");
        assert_eq!(m.file_in(&found), Some(talaan.path().join(m.info.id).join(file)));
        store.reuse = false;
        assert_eq!(store.locate(&m.info), Location::Missing, "downloads never count Talaan's copy");

        // Ensayo's own copy wins once there is one.
        sparse(&root.join(m.info.id).join(file), m.info.files[0].size);
        store.reuse = true;
        let own = store.locate(&m.info);
        assert_eq!(own, Location::Own(root.join(m.info.id)));
        assert_eq!(state_of(&own), "ready");
        assert_eq!(store.own_dir(&m.info), root.join(m.info.id));
    }

    #[test]
    fn a_half_downloaded_or_wrong_sized_file_is_not_a_model() {
        let data = tempfile::tempdir().unwrap();
        let m = recommended();
        let store = ModelStore { root: data.path().to_path_buf(), talaan_root: None, reuse: true };
        sparse(&data.path().join(m.info.id).join(m.info.files[0].name), 1000);
        assert_eq!(store.locate(&m.info), Location::Missing);
        fs::write(data.path().join(m.info.id).join(format!("{}.part", m.info.files[0].name)), b"x").unwrap();
        assert_eq!(store.locate(&m.info), Location::Missing);
    }

    #[test]
    fn the_status_lists_every_model_with_name_size_licence_and_state() {
        let data = tempfile::tempdir().unwrap();
        let store = ModelStore { root: data.path().to_path_buf(), talaan_root: None, reuse: true };
        let m = &CATALOG[1];
        sparse(&data.path().join(m.info.id).join(m.info.files[0].name), m.info.files[0].size);
        let s = status_in(&store);
        assert_eq!(s.len(), 2);
        assert_eq!((s[0].id, s[0].state, s[0].recommended), ("qwen3.5-4b", "missing", true));
        assert_eq!((s[1].id, s[1].state), ("qwen3.5-9b", "ready"));
        assert_eq!(s[0].size_mb, 2740);
        assert_eq!(s[0].licence, "Apache-2.0");
        let json = serde_json::to_value(&s[0]).unwrap();
        assert!(json["name"] == "Qwen3.5 4B" && json["size_mb"] == 2740);
    }
}
