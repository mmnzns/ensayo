# Builds ensayo-llm (the built-in local AI helper, its own process so its llama.cpp never meets Whisper's ggml) and
# puts it where Tauri's externalBin expects it: src-tauri/binaries/ensayo-llm-<target triple>.exe. Always optimized:
# llama.cpp is unusably slow in a debug build. Also copied next to the dev binaries so `tauri dev` finds it.
# Processor build only (no Vulkan helper in v0).
$ErrorActionPreference = 'Stop'
# llama.cpp (and whisper.cpp) for a fixed CPU baseline, not this machine's (scripts/cpu-baseline.ps1).
. (Join-Path $PSScriptRoot 'cpu-baseline.ps1')
Set-Location (Join-Path $PSScriptRoot '..\src-tauri')
$triple = ((rustc -vV) | Where-Object { $_ -like 'host: *' }).Substring(6)
cargo build --release -p ensayo-llm
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
New-Item -ItemType Directory -Force binaries, target\debug | Out-Null
Copy-Item target\release\ensayo-llm.exe "binaries\ensayo-llm-$triple.exe" -Force
try { Copy-Item target\release\ensayo-llm.exe target\debug\ensayo-llm.exe -Force -ErrorAction Stop } catch { Write-Warning "Could not update target\debug\ensayo-llm.exe (is tauri dev running?): $_" }
