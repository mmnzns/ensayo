//! The speech model catalog and where each model's files live: Ensayo's own copy, or a copy Talaan already
//! downloaded ("On this computer", used read-only, never named in the UI).

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineKind {
    /// Parakeet TDT (v2, v3, Ultra).
    Parakeet,
    /// Parakeet Unified (English).
    ParakeetUnified,
    /// Nemotron ASR (multilingual).
    Nemotron,
    Whisper,
}

impl EngineKind {
    /// A model that turns speech into text (the ones offered in Settings › Speech models).
    pub fn is_speech(self) -> bool {
        matches!(self, EngineKind::Parakeet | EngineKind::ParakeetUnified | EngineKind::Nemotron | EngineKind::Whisper)
    }
}

#[derive(Debug)]
pub struct ModelFile {
    pub name: &'static str,
    pub url: &'static str,
    pub size: u64,
    pub sha256: &'static str,
}

#[derive(Debug)]
pub struct ModelInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub maker: &'static str,
    pub note: &'static str,
    pub engine: EngineKind,
    /// Shown in Settings ("25 European languages").
    pub languages: &'static str,
    /// 1..3, for the dots in Settings.
    pub speed: u8,
    pub accuracy: u8,
    pub files: &'static [ModelFile],
}

impl ModelInfo {
    pub fn size(&self) -> u64 {
        self.files.iter().map(|f| f.size).sum()
    }
}

#[cfg(test)]
const PARAKEET_V3: &str = "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/";
#[cfg(test)]
const WHISPER: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/";

/// Speech models, in the order Settings lists them: the three recommended ones first (setup shows those and
/// hides the rest behind "Show all models"), then the other Whisper sizes and NVIDIA models.
pub static CATALOG: &[ModelInfo] = &[
    ModelInfo {
        id: "whisper-turbo",
        name: "Whisper Large Turbo",
        maker: "OpenAI",
        note: "Most accurate. 99 languages, including Filipino.",
        engine: EngineKind::Whisper,
        languages: "99 languages",
        speed: 2,
        accuracy: 3,
        files: &[ModelFile { name: "ggml-large-v3-turbo-q5_0.bin", url: concat!("https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/", "ggml-large-v3-turbo-q5_0.bin"), size: 574_041_195, sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2" }],
    },
    ModelInfo {
        id: "parakeet-v3",
        name: "Parakeet",
        maker: "NVIDIA",
        note: "Good for quick notes in 25 European languages.",
        engine: EngineKind::Parakeet,
        languages: "25 European languages",
        speed: 3,
        accuracy: 1,
        files: &[
            ModelFile { name: "encoder-model.int8.onnx", url: concat!("https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/", "encoder-model.int8.onnx"), size: 652_183_999, sha256: "6139d2fa7e1b086097b277c7149725edbab89cc7c7ae64b23c741be4055aff09" },
            ModelFile { name: "decoder_joint-model.int8.onnx", url: concat!("https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/", "decoder_joint-model.int8.onnx"), size: 18_202_004, sha256: "eea7483ee3d1a30375daedc8ed83e3960c91b098812127a0d99d1c8977667a70" },
            ModelFile { name: "nemo128.onnx", url: concat!("https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/", "nemo128.onnx"), size: 139_764, sha256: "a9fde1486ebfcc08f328d75ad4610c67835fea58c73ba57e3209a6f6cf019e9f" },
            ModelFile { name: "vocab.txt", url: concat!("https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/", "vocab.txt"), size: 93_939, sha256: "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d" },
            ModelFile { name: "config.json", url: concat!("https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/", "config.json"), size: 97, sha256: "666903c76b9798caf2c210afd4f6cd60b08a8dbf9800ec8d7a3bc0d2148ac466" },
        ],
    },
    ModelInfo {
        id: "whisper-small",
        name: "Whisper Small",
        maker: "OpenAI",
        note: "A smaller download that works on older computers. Lower accuracy.",
        engine: EngineKind::Whisper,
        languages: "99 languages",
        speed: 3,
        accuracy: 1,
        files: &[ModelFile { name: "ggml-small.bin", url: concat!("https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/", "ggml-small.bin"), size: 487_601_967, sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b" }],
    },
    ModelInfo {
        id: "whisper-large-v3",
        name: "Whisper Large v3",
        maker: "OpenAI",
        note: "Whisper’s largest model. Very accurate, slower than Turbo.",
        engine: EngineKind::Whisper,
        languages: "99 languages",
        speed: 1,
        accuracy: 3,
        files: &[ModelFile { name: "ggml-large-v3-q5_0.bin", url: concat!("https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/", "ggml-large-v3-q5_0.bin"), size: 1_081_140_203, sha256: "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1" }],
    },
    ModelInfo {
        id: "whisper-large-v2",
        name: "Whisper Large v2",
        maker: "OpenAI",
        note: "The earlier large model. Some voices and accents come out better.",
        engine: EngineKind::Whisper,
        languages: "99 languages",
        speed: 1,
        accuracy: 3,
        files: &[ModelFile { name: "ggml-large-v2-q5_0.bin", url: concat!("https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/", "ggml-large-v2-q5_0.bin"), size: 1_080_732_091, sha256: "3a214837221e4530dbc1fe8d734f302af393eb30bd0ed046042ebf4baf70f6f2" }],
    },
    ModelInfo {
        id: "whisper-medium",
        name: "Whisper Medium",
        maker: "OpenAI",
        note: "Between Small and Large: good accuracy at a moderate speed.",
        engine: EngineKind::Whisper,
        languages: "99 languages",
        speed: 1,
        accuracy: 2,
        files: &[ModelFile { name: "ggml-medium.bin", url: concat!("https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/", "ggml-medium.bin"), size: 1_533_763_059, sha256: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208" }],
    },
    ModelInfo {
        id: "whisper-base",
        name: "Whisper Base",
        maker: "OpenAI",
        note: "Very small and fast. Rough on names and accents.",
        engine: EngineKind::Whisper,
        languages: "99 languages",
        speed: 3,
        accuracy: 1,
        files: &[ModelFile { name: "ggml-base.bin", url: concat!("https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/", "ggml-base.bin"), size: 147_951_465, sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe" }],
    },
    ModelInfo {
        id: "whisper-tiny",
        name: "Whisper Tiny",
        maker: "OpenAI",
        note: "The smallest. For trying Ensayo out or very old computers.",
        engine: EngineKind::Whisper,
        languages: "99 languages",
        speed: 3,
        accuracy: 1,
        files: &[ModelFile { name: "ggml-tiny.bin", url: concat!("https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/", "ggml-tiny.bin"), size: 77_691_713, sha256: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21" }],
    },
    ModelInfo {
        id: "parakeet-ultra",
        name: "Parakeet Ultra",
        maker: "NVIDIA",
        note: "Parakeet v3 further trained by Moondream for better accuracy. 25 European languages.",
        engine: EngineKind::Parakeet,
        languages: "25 European languages",
        speed: 3,
        accuracy: 2,
        files: &[
            ModelFile { name: "encoder-model.int8.onnx", url: concat!("https://huggingface.co/Olicorne/parakeet-tdt-0.6b-v3-ultra-onnx/resolve/3646b2f1a516a2310810902bfaa67515f3c89d38/", "int8/encoder-model.int8.onnx"), size: 649_524_002, sha256: "fc7de298eae88ba8aae8ea62bde60cd401401bd294748b8d57a72e5ad6b9d04a" },
            ModelFile { name: "decoder_joint-model.int8.onnx", url: concat!("https://huggingface.co/Olicorne/parakeet-tdt-0.6b-v3-ultra-onnx/resolve/3646b2f1a516a2310810902bfaa67515f3c89d38/", "int8/decoder_joint-model.int8.onnx"), size: 18_203_490, sha256: "f7e2db395a3b738cb2893cfb853d25863cebcc5282583a2e86b5762559e0bd32" },
            ModelFile { name: "nemo128.onnx", url: concat!("https://huggingface.co/Olicorne/parakeet-tdt-0.6b-v3-ultra-onnx/resolve/3646b2f1a516a2310810902bfaa67515f3c89d38/", "nemo128.onnx"), size: 139_764, sha256: "a9fde1486ebfcc08f328d75ad4610c67835fea58c73ba57e3209a6f6cf019e9f" },
            ModelFile { name: "vocab.txt", url: concat!("https://huggingface.co/Olicorne/parakeet-tdt-0.6b-v3-ultra-onnx/resolve/3646b2f1a516a2310810902bfaa67515f3c89d38/", "vocab.txt"), size: 93_939, sha256: "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d" },
            ModelFile { name: "config.json", url: concat!("https://huggingface.co/Olicorne/parakeet-tdt-0.6b-v3-ultra-onnx/resolve/3646b2f1a516a2310810902bfaa67515f3c89d38/", "config.json"), size: 97, sha256: "666903c76b9798caf2c210afd4f6cd60b08a8dbf9800ec8d7a3bc0d2148ac466" },
        ],
    },
    ModelInfo {
        id: "parakeet-v2",
        name: "Parakeet v2",
        maker: "NVIDIA",
        note: "English only. Fast and very accurate in English.",
        engine: EngineKind::Parakeet,
        languages: "English",
        speed: 3,
        accuracy: 2,
        files: &[
            ModelFile { name: "encoder-model.int8.onnx", url: concat!("https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/0bbb45a3365852604aef28b538a8f066f4ccaa85/", "encoder-model.int8.onnx"), size: 652_184_014, sha256: "3e0581fda6ab843888b51e56d7ee78b6d5bc3237ec113af1f732d1d5286aa155" },
            ModelFile { name: "decoder_joint-model.int8.onnx", url: concat!("https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/0bbb45a3365852604aef28b538a8f066f4ccaa85/", "decoder_joint-model.int8.onnx"), size: 8_998_286, sha256: "a449f49acd68979d418651dd2dcb737cc0f1bf0225e009e29ee326354edbf7d3" },
            ModelFile { name: "nemo128.onnx", url: concat!("https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/0bbb45a3365852604aef28b538a8f066f4ccaa85/", "nemo128.onnx"), size: 139_764, sha256: "a9fde1486ebfcc08f328d75ad4610c67835fea58c73ba57e3209a6f6cf019e9f" },
            ModelFile { name: "vocab.txt", url: concat!("https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/0bbb45a3365852604aef28b538a8f066f4ccaa85/", "vocab.txt"), size: 9_384, sha256: "ec182b70dd42113aff6c5372c75cac58c952443eb22322f57bbd7f53977d497d" },
            ModelFile { name: "config.json", url: concat!("https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/0bbb45a3365852604aef28b538a8f066f4ccaa85/", "config.json"), size: 97, sha256: "666903c76b9798caf2c210afd4f6cd60b08a8dbf9800ec8d7a3bc0d2148ac466" },
        ],
    },
    ModelInfo {
        id: "parakeet-unified-en",
        name: "Parakeet Unified",
        maker: "NVIDIA",
        note: "English only. NVIDIA’s newer English model, with punctuation.",
        engine: EngineKind::ParakeetUnified,
        languages: "English",
        speed: 3,
        accuracy: 2,
        files: &[
            ModelFile { name: "encoder.int8.onnx", url: concat!("https://huggingface.co/bobNight/parakeet-unified-en-0.6b-onnx/resolve/09e9060322d99c5f070010724786e6ee090fd51d/", "encoder.int8.onnx"), size: 42_606_669, sha256: "c81adfab77634e00c1668a221a14f244c5fb3409e7c14eeebaf6ac963425910f" },
            ModelFile { name: "encoder.int8.onnx.data", url: concat!("https://huggingface.co/bobNight/parakeet-unified-en-0.6b-onnx/resolve/09e9060322d99c5f070010724786e6ee090fd51d/", "encoder.int8.onnx.data"), size: 611_491_584, sha256: "3d54dd04646c15677bd2844a84df3770b12cc1ce183481f7b6e0def31c92114a" },
            ModelFile { name: "decoder_joint.int8.onnx", url: concat!("https://huggingface.co/bobNight/parakeet-unified-en-0.6b-onnx/resolve/09e9060322d99c5f070010724786e6ee090fd51d/", "decoder_joint.int8.onnx"), size: 8_995_064, sha256: "7f76ad5f35035f25630075699c6c942a2c0c05ff42cb398f966f3c256d148e1e" },
            ModelFile { name: "tokenizer.model", url: concat!("https://huggingface.co/bobNight/parakeet-unified-en-0.6b-onnx/resolve/09e9060322d99c5f070010724786e6ee090fd51d/", "tokenizer.model"), size: 251_056, sha256: "07d4e5a63840a53ab2d4d106d2874768143fb3fbdd47938b3910d2da05bfb0a9" },
        ],
    },
    ModelInfo {
        id: "nemotron-3.5",
        name: "Nemotron 3.5",
        maker: "NVIDIA",
        note: "NVIDIA’s newest, 35 languages. A larger download.",
        engine: EngineKind::Nemotron,
        languages: "35 languages",
        speed: 2,
        accuracy: 2,
        files: &[
            ModelFile { name: "encoder.onnx", url: concat!("https://huggingface.co/altunenes/parakeet-rs/resolve/4d2a8bc71f5c896ec40faa59732e6716295edaf2/nemotron-3.5-asr-streaming-0.6b-onnx/", "encoder.onnx"), size: 42_164_972, sha256: "d569fbe78b48fbb04e169d324f5d25463838ceed7b5fc3bfe209872441979bd9" },
            ModelFile { name: "encoder.onnx.data", url: concat!("https://huggingface.co/altunenes/parakeet-rs/resolve/4d2a8bc71f5c896ec40faa59732e6716295edaf2/nemotron-3.5-asr-streaming-0.6b-onnx/", "encoder.onnx.data"), size: 2_454_405_120, sha256: "7584f85df76bc9ae6fbdfa53aa8d97b07a842525d1c501d536d77fd9e4f57ac7" },
            ModelFile { name: "decoder_joint.onnx", url: concat!("https://huggingface.co/altunenes/parakeet-rs/resolve/4d2a8bc71f5c896ec40faa59732e6716295edaf2/nemotron-3.5-asr-streaming-0.6b-onnx/", "decoder_joint.onnx"), size: 97_590_054, sha256: "634dfadf24cb4f73c2fae170b36611d68db48186426882cbc8f7e02ed9f2bb29" },
            ModelFile { name: "tokenizer.model", url: concat!("https://huggingface.co/altunenes/parakeet-rs/resolve/4d2a8bc71f5c896ec40faa59732e6716295edaf2/nemotron-3.5-asr-streaming-0.6b-onnx/", "tokenizer.model"), size: 406_554, sha256: "ce3895e40806f02a26c3a225161b96ef682d6c0054bae32a245dec4258d7d291" },
        ],
    },
];

/// Silero voice activity detection, used with every model. Downloaded with the first model.
pub static VAD: ModelInfo = ModelInfo {
    id: "vad",
    name: "Silero VAD",
    maker: "Silero",
    note: "",
    engine: EngineKind::Whisper,
    languages: "",
    speed: 3,
    accuracy: 3,
    files: &[ModelFile { name: "ggml-silero-v6.2.0.bin", url: "https://huggingface.co/ggml-org/whisper-vad/resolve/9ffd54a1e1ee413ddf265af9913beaf518d1639b/ggml-silero-v6.2.0.bin", size: 885_098, sha256: "2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987" }],
};

/// Whisper Turbo: on real calls it was more complete and accurate than Parakeet (which skipped stretches and
/// misheard more), and at ~13x real time an hour of speech takes a few minutes.
pub const DEFAULT_MODEL: &str = "whisper-turbo";

pub fn find(id: &str) -> Option<&'static ModelInfo> {
    if id == VAD.id {
        return Some(&VAD);
    }
    CATALOG.iter().find(|m| m.id == id)
}

// Keep the URL prefixes referenced so a typo in one of the concat! literals above shows up in tests.
#[cfg(test)]
const PREFIXES: [&str; 2] = [PARAKEET_V3, WHISPER];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Location {
    Missing,
    /// Ensayo's own copy in `<models>/<id>/`.
    Own(PathBuf),
    /// A copy Talaan already downloaded, read in place.
    OnThisComputer(PathBuf),
}

impl Location {
    pub fn dir(&self) -> Option<&Path> {
        match self {
            Location::Own(p) | Location::OnThisComputer(p) => Some(p),
            Location::Missing => None,
        }
    }
}

/// Where models are stored and whether Talaan's copies may be reused.
#[derive(Debug, Clone)]
pub struct ModelStore {
    pub root: PathBuf,
    /// Talaan's models folder (`<root>/<model id>/<files>`), if Talaan's data is on this computer.
    pub talaan_root: Option<PathBuf>,
    pub reuse: bool,
}

impl ModelStore {
    pub fn new(root: PathBuf, reuse: bool) -> Self {
        ModelStore { root, talaan_root: talaan_models_root(), reuse }
    }

    /// Where Ensayo downloads `m` to.
    pub fn own_dir(&self, m: &ModelInfo) -> PathBuf {
        self.root.join(m.id)
    }

    pub fn locate(&self, m: &ModelInfo) -> Location {
        let own = self.own_dir(m);
        if complete(&own, m) {
            return Location::Own(own);
        }
        if self.reuse {
            if let Some(root) = &self.talaan_root {
                let dir = root.join(m.id);
                if complete(&dir, m) {
                    return Location::OnThisComputer(dir);
                }
            }
        }
        Location::Missing
    }
}

/// Every file present with its exact size. (Hashes are checked at download; re-hashing gigabytes on every
/// lookup would be too slow, and a size match on files this large is a strong signal.)
fn complete(dir: &Path, m: &ModelInfo) -> bool {
    m.files.iter().all(|f| std::fs::metadata(dir.join(f.name)).map(|md| md.is_file() && md.len() == f.size).unwrap_or(false))
}

/// Talaan keeps its models in `<its data folder>/models` on the Mac and `%LOCALAPPDATA%\<its bundle id>\models` on
/// Windows (read from Talaan's `transcriber/models.rs`).
fn talaan_models_root() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        dirs::data_local_dir().map(|d| d.join("com.craftconceptsdigital.talaan").join("models"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        dirs::data_dir().map(|d| d.join("Talaan").join("models"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fake_model() -> &'static ModelInfo {
        find("whisper-small").unwrap()
    }

    fn sparse(path: &Path, size: u64) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::File::create(path).unwrap().set_len(size).unwrap();
    }

    #[test]
    fn catalog_is_consistent() {
        assert!(find(DEFAULT_MODEL).is_some());
        for m in CATALOG.iter().chain(std::iter::once(&VAD)) {
            assert!(!m.files.is_empty(), "{}", m.id);
            for f in m.files {
                assert_eq!(f.sha256.len(), 64, "{}", f.name);
                assert!(f.url.ends_with(f.name), "{}", f.url);
                assert!(f.url.starts_with("https://huggingface.co/"), "{}", f.url);
            }
        }
        let v3 = find("parakeet-v3").unwrap();
        assert!(v3.files.iter().all(|f| f.url.starts_with(PREFIXES[0])));
        assert!(CATALOG.iter().all(|m| m.engine.is_speech()));
        let ids: std::collections::HashSet<_> = CATALOG.iter().map(|m| m.id).collect();
        assert_eq!(ids.len(), CATALOG.len(), "duplicate model id");
        for m in CATALOG.iter().filter(|m| m.engine == EngineKind::Whisper) {
            assert!(m.files.iter().all(|f| f.url.starts_with(PREFIXES[1])));
        }
    }

    #[test]
    fn own_copy_wins_and_partial_files_do_not_count() {
        let data = tempfile::tempdir().unwrap();
        let store = ModelStore { root: data.path().join("models"), talaan_root: None, reuse: true };
        let m = fake_model();
        assert_eq!(store.locate(m), Location::Missing);
        sparse(&store.own_dir(m).join(m.files[0].name), m.files[0].size - 1);
        assert_eq!(store.locate(m), Location::Missing);
        sparse(&store.own_dir(m).join(m.files[0].name), m.files[0].size);
        assert_eq!(store.locate(m), Location::Own(store.own_dir(m)));
    }

    #[test]
    fn a_model_talaan_downloaded_is_found_only_when_reuse_is_on() {
        let data = tempfile::tempdir().unwrap();
        let talaan = tempfile::tempdir().unwrap();
        let m = fake_model();
        // Talaan's layout: <its models folder>/<model id>/<files>
        sparse(&talaan.path().join(m.id).join(m.files[0].name), m.files[0].size);
        let mut store = ModelStore { root: data.path().join("models"), talaan_root: Some(talaan.path().to_path_buf()), reuse: true };
        assert_eq!(store.locate(m), Location::OnThisComputer(talaan.path().join(m.id)));
        store.reuse = false;
        assert_eq!(store.locate(m), Location::Missing);
    }

    #[test]
    fn a_missing_or_empty_talaan_folder_changes_nothing() {
        let data = tempfile::tempdir().unwrap();
        let empty = tempfile::tempdir().unwrap();
        let m = fake_model();
        let none = ModelStore { root: data.path().join("models"), talaan_root: None, reuse: true };
        assert_eq!(none.locate(m), Location::Missing);
        let some = ModelStore { root: data.path().join("models"), talaan_root: Some(empty.path().to_path_buf()), reuse: true };
        assert_eq!(some.locate(m), Location::Missing);
    }

    #[test]
    fn ensayos_own_copy_is_preferred_over_talaans() {
        let data = tempfile::tempdir().unwrap();
        let talaan = tempfile::tempdir().unwrap();
        let m = fake_model();
        sparse(&talaan.path().join(m.id).join(m.files[0].name), m.files[0].size);
        let store = ModelStore { root: data.path().join("models"), talaan_root: Some(talaan.path().to_path_buf()), reuse: true };
        sparse(&store.own_dir(m).join(m.files[0].name), m.files[0].size);
        assert_eq!(store.locate(m), Location::Own(store.own_dir(m)));
    }
}
