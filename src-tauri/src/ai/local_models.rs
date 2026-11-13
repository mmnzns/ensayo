//! The built-in local AI models (GGUF files run by the `ensayo-llm` helper): the catalog, where each one lives on this
//! computer, and what Settings shows about it. Same two models Talaan picked by a bake-off on a Mac: Qwen3.5 4B is the
//! recommended one, 9B is an optional larger size. They live in the shared models folder like the speech models
//! (`models_store`), so a copy another Craft Concepts app downloaded is used in place.

use crate::ai::local;
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
    LocalModel {
        info: Offered { id: "granite-4.2-3b", name: "Granite 4.2 3B", maker: "IBM", note: "Smaller and lighter than Qwen. A choice for an older computer; its notes are a little less thorough." },
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
/// A model whose context on this computer is under this many tokens cannot hold a job posting and an answer.
pub const MIN_USABLE_CONTEXT: u32 = 12_288;

/// This computer's memory in bytes; 0 when the system won't say (the safe, smallest tier).
fn memory_here() -> u64 {
    crate::diagnostics::total_memory_bytes().unwrap_or(0)
}

/// The model a settings value names, unless it is too small here (see `choose_with_memory`).
pub fn choose(setting: &str) -> &'static LocalModel {
    choose_with_memory(setting, memory_here())
}

/// `choose` for a computer with `total_memory_bytes`. A model that needs more memory than this computer has is never
/// returned: the recommended one is used instead. If even that is too small it is kept, and the engine's
/// `PromptTooLong` error speaks for it.
pub fn choose_with_memory(setting: &str, total_memory_bytes: u64) -> &'static LocalModel {
    let named = find(setting.trim()).unwrap_or_else(recommended);
    if named.too_small_for(total_memory_bytes) { recommended() } else { named }
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

    /// True when the context this model gets on a computer with `total_memory_bytes` is under `MIN_USABLE_CONTEXT`.
    pub fn too_small_for(&self, total_memory_bytes: u64) -> bool {
        match self.engine().llm.as_ref() {
            Some(info) => local::context_for(info, total_memory_bytes) < MIN_USABLE_CONTEXT,
            None => false,
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
    /// True when this model needs more memory than this computer has. Settings greys it out; it cannot be downloaded
    /// or chosen.
    pub too_small_here: bool,
}

pub fn status_in(store: &SharedStore) -> Vec<LocalAiStatus> {
    status_with_memory(store, memory_here())
}

pub fn status_with_memory(store: &SharedStore, total_memory_bytes: u64) -> Vec<LocalAiStatus> {
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
                too_small_here: m.too_small_for(total_memory_bytes),
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
    fn the_catalog_has_the_recommended_small_model_then_the_larger_one_then_granite() {
        let ids: Vec<&str> = CATALOG.iter().map(|m| m.info.id).collect();
        assert_eq!(ids, ["qwen3.5-4b", "qwen3.5-9b", "granite-4.2-3b"]);
        assert_eq!(CATALOG.iter().filter(|m| m.recommended).count(), 1);
        assert_eq!(recommended().info.id, "qwen3.5-4b");
        assert!(CATALOG[1].engine().size() > CATALOG[0].engine().size());
        assert!(CATALOG[2].engine().size() < CATALOG[0].engine().size(), "Granite is the lighter download");
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
        let big = 32 * (1u64 << 30);
        assert_eq!(choose_with_memory("qwen3.5-9b", big).info.id, "qwen3.5-9b");
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
        assert_eq!(s.len(), 3);
        assert_eq!(s[2].state, "missing");
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

    #[test]
    fn a_model_too_big_for_the_memory_is_flagged_and_never_chosen() {
        let gib = 1u64 << 30;
        let data = tempfile::tempdir().unwrap();
        let store = temp_store(App::Ensayo, data.path());
        let at8 = status_with_memory(&store, 8 * gib);
        assert_eq!((at8[0].id, at8[0].too_small_here), ("qwen3.5-4b", false));
        assert_eq!((at8[1].id, at8[1].too_small_here), ("qwen3.5-9b", true));
        assert_eq!((at8[2].id, at8[2].too_small_here), ("granite-4.2-3b", false));
        assert!(status_with_memory(&store, 16 * gib).iter().all(|s| !s.too_small_here));
        assert_eq!(choose_with_memory("qwen3.5-9b", 8 * gib).info.id, "qwen3.5-4b", "falls back to the recommended one");
        assert_eq!(choose_with_memory("qwen3.5-9b", 16 * gib).info.id, "qwen3.5-9b");
        assert_eq!(choose_with_memory("granite-4.2-3b", 8 * gib).info.id, "granite-4.2-3b");
        assert_eq!(choose_with_memory("qwen3.5-9b", 0).info.id, "qwen3.5-4b");
        assert_eq!(serde_json::to_value(&at8[1]).unwrap()["too_small_here"], true);
    }
}
