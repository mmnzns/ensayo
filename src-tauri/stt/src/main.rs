//! Ensayo's speech helper for the Windows graphics card: the engine's helper with Ensayo's prefix. Built with
//! `--features vulkan` it is `ensayo-stt-vulkan.exe`.
fn main() {
    voice_engine_stt::run_helper(voice_engine_protocol::HelperConfig { env_prefix: "ENSAYO" });
}
