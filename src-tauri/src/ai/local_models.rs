//! The built-in local AI models (GGUF files run by the `ensayo-llm` helper): the catalog, where each one lives on this
//! computer, and what Settings shows about it. Same two models Talaan picked by a bake-off on a Mac: Qwen3.5 4B is the
//! recommended one, 9B is an optional larger size. They live in the shared models folder like the speech models
//! (`models_store`), so a copy another Craft Concepts app downloaded is used in place.

use crate::models_store;
use crate::speech::models::Offered;
use serde::Serialize;
use std::path::PathBuf;
use voice_engine_models::{catalog, SharedStore, Status};

/// A local AI model as Settings words it, plus whether it is the one most people should use. Files, sizes, download
/// addresses and licence are the engine's catalog entry with the same id.
#[derive(Debug)]
pub struct LocalModel {
    pub info: Offered,
    pub recommended: bool,
}

pub static CATALOG: &[LocalModel] = &[
    LocalModel {
        info: Offered { id: "qwen3.5-4b", name: "Qwen3.5 4B", maker: "Qwen", note: "Recommended. Small and quick enough for a laptop, and good at judging an answer." },
        recommended: true,
    },
    LocalModel {
        info: Offered { id: "qwen3.5-9b", name: "Qwen3.5 9B", maker: "Qwen", note: "Larger. A little more thorough; needs 16 GB of memory and takes about twice as long." },
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

impl LocalModel {
    /// The engine's catalog entry: the file, its size and where it comes from.
    pub fn engine(&self) -> &'static catalog::ModelInfo {
        catalog::find(self.info.id).expect("every local AI model is in the engine's catalog")
    }

    /// The GGUF file to hand the helper, when the model is on this computer.
    pub fn file_in(&self, status: &Status) -> Option<PathBuf> {
        match status {
            Status::Installed { dir, .. } => Some(dir.join(self.engine().files[0].name)),
            _ => None,
        }
    }

    pub fn size_mb(&self) -> u64 {
        self.engine().size() / 1_000_000
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
    /// "ready" (Ensayo uses it), "on_this_computer" (there, from another app), "missing", "partial" (an interrupted
    /// download), "downloading" (here) or "downloading_elsewhere" (another app is fetching it).
    pub state: &'static str,
    /// How much is on disk, for "partial" and the two "downloading" states.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fraction: Option<f32>,
}

pub fn status_in(store: &SharedStore) -> Vec<LocalAiStatus> {
    CATALOG
        .iter()
        .map(|m| {
            let status = store.status(m.info.id);
            LocalAiStatus {
                id: m.info.id,
                name: m.info.name,
                maker: m.info.maker,
                note: m.info.note,
                licence: m.engine().licence.spdx,
                size_mb: m.size_mb(),
                recommended: m.recommended,
                state: models_store::state_name(&status),
                fraction: models_store::fraction_of(&status),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use voice_engine_models::{App, Kind};

    fn sparse(path: &std::path::Path, size: u64) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::File::create(path).unwrap().set_len(size).unwrap();
    }

    fn temp_store(app: App, dir: &std::path::Path) -> SharedStore {
        SharedStore::open_at(app, dir.to_path_buf()).unwrap()
    }

    #[test]
    fn the_catalog_has_one_recommended_small_model_and_one_larger() {
        assert_eq!(CATALOG.len(), 2);
        assert_eq!(CATALOG.iter().filter(|m| m.recommended).count(), 1);
        assert_eq!(recommended().info.id, "qwen3.5-4b");
        assert!(CATALOG[1].engine().size() > CATALOG[0].engine().size());
        for m in CATALOG {
            let e = m.engine();
            assert_eq!(e.kind, Kind::Llm, "{}", m.info.id);
            assert_eq!(e.files.len(), 1);
            assert!(e.files[0].name.ends_with(".gguf"));
            assert_eq!(e.licence.spdx, "Apache-2.0");
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
    fn the_file_for_the_helper_is_in_the_models_folder_and_only_when_the_model_is_complete() {
        let data = tempfile::tempdir().unwrap();
        let store = temp_store(App::Ensayo, data.path());
        let m = recommended();
        let file = m.engine().files[0].name;
        assert_eq!(m.file_in(&store.status(m.info.id)), None);
        sparse(&data.path().join(m.info.id).join(file), 1000);
        assert_eq!(m.file_in(&store.status(m.info.id)), None, "a wrong-sized file is not a model");
        sparse(&data.path().join(m.info.id).join(file), m.engine().files[0].size);
        assert_eq!(m.file_in(&store.status(m.info.id)), Some(data.path().join(m.info.id).join(file)));
    }

    #[test]
    fn a_copy_another_app_downloaded_is_on_this_computer_until_ensayo_uses_it() {
        let data = tempfile::tempdir().unwrap();
        let ensayo = temp_store(App::Ensayo, data.path());
        let talaan = temp_store(App::Talaan, data.path());
        let m = recommended();
        sparse(&data.path().join(m.info.id).join(m.engine().files[0].name), m.engine().files[0].size);
        talaan.use_model(m.info.id).unwrap();
        assert_eq!(status_in(&ensayo)[0].state, "on_this_computer");
        assert!(m.file_in(&ensayo.status(m.info.id)).is_some(), "usable in place");
        ensayo.use_model(m.info.id).unwrap();
        assert_eq!(status_in(&ensayo)[0].state, "ready");
    }

    #[test]
    fn the_status_lists_every_model_with_name_size_licence_and_state() {
        let data = tempfile::tempdir().unwrap();
        let store = temp_store(App::Ensayo, data.path());
        let m = &CATALOG[1];
        sparse(&data.path().join(m.info.id).join(m.engine().files[0].name), m.engine().files[0].size);
        store.use_model(m.info.id).unwrap();
        let s = status_in(&store);
        assert_eq!(s.len(), 2);
        assert_eq!((s[0].id, s[0].state, s[0].recommended), ("qwen3.5-4b", "missing", true));
        assert_eq!((s[1].id, s[1].state), ("qwen3.5-9b", "ready"));
        assert_eq!(s[0].size_mb, 2740);
        assert_eq!(s[0].licence, "Apache-2.0");
        let json = serde_json::to_value(&s[0]).unwrap();
        assert!(json["name"] == "Qwen3.5 4B" && json["size_mb"] == 2740 && json.get("fraction").is_none());
    }

    #[test]
    fn a_half_downloaded_model_is_partial_with_how_much_is_there() {
        let data = tempfile::tempdir().unwrap();
        let store = temp_store(App::Ensayo, data.path());
        let m = recommended();
        let f = &m.engine().files[0];
        sparse(&data.path().join(m.info.id).join(format!("{}.part", f.name)), f.size / 2);
        let s = &status_in(&store)[0];
        assert_eq!(s.state, "partial");
        assert!((s.fraction.unwrap() - 0.5).abs() < 0.01);
        assert!(m.file_in(&store.status(m.info.id)).is_none());
    }
}
