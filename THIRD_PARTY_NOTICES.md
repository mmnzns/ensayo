# Third-party notices

Ensayo uses the following libraries, fonts and models. Each is used under its own license.

Speech and audio engine: built on the Talaan engine (Miguel Monzones, MIT), source commit `932fb91`.

| Component | License | Source |
|---|---|---|
| Tauri | MIT / Apache-2.0 | https://tauri.app |
| React | MIT | https://react.dev |
| Vite | MIT | https://vite.dev |
| Tailwind CSS | MIT | https://tailwindcss.com |
| Plus Jakarta Sans (font) | SIL OFL 1.1 | https://github.com/tokotype/PlusJakartaSans |
| Outfit (font) | SIL OFL 1.1 | https://github.com/Outfitio/Outfit-Fonts |
| Poppins (font) | SIL OFL 1.1 | https://github.com/itfoundry/poppins |
| Fontsource (font packaging) | MIT | https://fontsource.org |
| serde, serde_json | MIT / Apache-2.0 | https://serde.rs |
| dirs | MIT / Apache-2.0 | https://github.com/soc/dirs-rs |
| thiserror | MIT / Apache-2.0 | https://github.com/dtolnay/thiserror |
| log | MIT / Apache-2.0 | https://github.com/rust-lang/log |
| tempfile (tests only) | MIT / Apache-2.0 | https://github.com/Stebalien/tempfile |
| tiny_http (tests only) | MIT / Apache-2.0 | https://github.com/tiny-http/tiny-http |
| cpal (audio input) | Apache-2.0 | https://github.com/RustAudio/cpal |
| hound (WAV files) | Apache-2.0 | https://github.com/ruuda/hound |
| rubato (resampling) | MIT / Apache-2.0 | https://github.com/HEnquist/rubato |
| rtrb (ring buffer) | MIT / Apache-2.0 | https://github.com/mgeier/rtrb |
| objc2, block2 (macOS bindings) | MIT | https://github.com/madsmtm/objc2 |
| objc2-foundation, objc2-av-foundation | Zlib / Apache-2.0 / MIT | https://github.com/madsmtm/objc2 |
| whisper.cpp (via whisper-rs) | MIT | https://github.com/ggml-org/whisper.cpp |
| whisper-rs | Unlicense | https://github.com/tazz4843/whisper-rs |
| llama.cpp (built-in local AI, in the `ensayo-llm` helper) | MIT | https://github.com/ggml-org/llama.cpp |
| llama-cpp-2, llama-cpp-sys-2 (Rust bindings to llama.cpp) | MIT / Apache-2.0 | https://github.com/utilityai/llama-cpp-rs |
| ONNX Runtime (via ort) | MIT | https://github.com/microsoft/onnxruntime |
| ort | MIT / Apache-2.0 | https://github.com/pykeio/ort |
| parakeet-rs | MIT / Apache-2.0 | https://github.com/altunenes/parakeet-rs |
| reqwest (model downloads, your own AI key) | MIT / Apache-2.0 | https://github.com/seanmonstar/reqwest |
| sha2 | MIT / Apache-2.0 | https://github.com/RustCrypto/hashes |
| keyring (Keychain, Credential Manager) | MIT / Apache-2.0 | https://github.com/hwchen/keyring-rs |
| winreg (Windows registry) | MIT | https://github.com/gentoo90/winreg-rs |
| pdf-extract (text from a resume PDF, on this computer) | MIT | https://github.com/jrmuizel/pdf-extract |
| docx-rs (text from a resume Word file, on this computer) | MIT | https://github.com/bokuweb/docx-rs |

## Models

Models are downloaded on demand from their sources, not bundled or redistributed by Ensayo. Their license terms travel with them on the source pages listed.

| Model | License | Source |
|---|---|---|
| NVIDIA Parakeet TDT 0.6B v3 (ONNX export by istupakov) | CC-BY-4.0, © NVIDIA | https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3, https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx |
| NVIDIA Parakeet TDT 0.6B v2 (ONNX export by istupakov) | CC-BY-4.0, © NVIDIA | https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2, https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx |
| Parakeet Ultra (Parakeet TDT 0.6B v3 further trained by Moondream; ONNX export by Olicorne) | CC-BY-4.0 | https://huggingface.co/moondream/parakeet-ultra, https://huggingface.co/Olicorne/parakeet-tdt-0.6b-v3-ultra-onnx |
| NVIDIA Parakeet Unified EN 0.6B (ONNX export by bobNight) | NVIDIA Open Model License | https://huggingface.co/nvidia/parakeet-unified-en-0.6b, https://huggingface.co/bobNight/parakeet-unified-en-0.6b-onnx, license text: https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/ |
| NVIDIA Nemotron 3.5 ASR Streaming 0.6B (ONNX export by altunenes for parakeet-rs) | OpenMDW-1.1, © NVIDIA | https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b, https://huggingface.co/altunenes/parakeet-rs (`nemotron-3.5-asr-streaming-0.6b-onnx/`), license text: https://openmdw.ai/license |
| OpenAI Whisper large-v3-turbo, large-v3, large-v2, medium, small, base, tiny (ggml conversions) | MIT | https://github.com/openai/whisper, https://huggingface.co/ggerganov/whisper.cpp |
| Qwen3.5 4B, Q4_K_M GGUF by Unsloth (built-in local AI, recommended) | Apache-2.0, © Alibaba Cloud (Qwen) | https://huggingface.co/Qwen/Qwen3.5-4B, https://huggingface.co/unsloth/Qwen3.5-4B-GGUF |
| Qwen3.5 9B, Q4_K_M GGUF by Unsloth (built-in local AI, optional larger size) | Apache-2.0, © Alibaba Cloud (Qwen) | https://huggingface.co/Qwen/Qwen3.5-9B, https://huggingface.co/unsloth/Qwen3.5-9B-GGUF |
| Silero VAD (ggml conversion) | MIT | https://github.com/snakers4/silero-vad, https://huggingface.co/ggml-org/whisper-vad |

Other dependencies are added here as they are introduced.
