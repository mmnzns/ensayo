#!/bin/bash
# Builds ensayo-llm (the built-in local AI helper, its own process so its llama.cpp never meets Whisper's ggml) and
# puts it where Tauri's externalBin expects it: src-tauri/binaries/ensayo-llm-<target triple>. Always optimized:
# llama.cpp is unusably slow in a debug build. Also copied next to the dev binaries so `tauri dev` finds it, and
# into target/debug/deps' parent for `cargo test`. The first build compiles llama.cpp and takes several minutes.
set -euo pipefail
cd "$(dirname "$0")/../src-tauri"
TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
cargo build --release -p ensayo-llm
mkdir -p binaries target/debug
cp target/release/ensayo-llm "binaries/ensayo-llm-$TRIPLE"
cp target/release/ensayo-llm target/debug/ensayo-llm
