# Builds ensayo-llm (the built-in local AI helper, its own process so its llama.cpp never meets Whisper's ggml) from
# this workspace and puts it where Tauri's externalBin expects it: src-tauri/binaries/ensayo-llm-<target triple>.exe.
# Always optimized: llama.cpp is unusably slow in a debug build. Also copied next to the dev binaries so `tauri dev`
# finds it. Used by dev, ci.yml and the Release workflow's test-build; real releases take their helpers from the
# engine's build workflow instead (docs/RELEASE.md).
#
# Graphics-card helper: when the Vulkan SDK is installed (VULKAN_SDK is set and the folder exists) this also builds
# `--features vulkan` as ensayo-llm-vulkan-<triple>.exe (and target\debug\ensayo-llm-vulkan.exe). Without the SDK it
# says so and skips; the app then uses the processor helper. The Vulkan sidecar is not in the default externalBin
# list, so skipping never breaks bundling (docs/RELEASE.md, "The graphics-card helper").
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

if ($env:VULKAN_SDK -and (Test-Path $env:VULKAN_SDK)) {
  # Its own target folder: the Vulkan and processor builds compile llama.cpp differently, and sharing one folder would
  # rebuild it every time the two alternate.
  $vk = 'target\vulkan-helper'
  cargo build --release -p ensayo-llm --features vulkan --target-dir $vk
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Copy-Item "$vk\release\ensayo-llm.exe" "binaries\ensayo-llm-vulkan-$triple.exe" -Force
  try { Copy-Item "$vk\release\ensayo-llm.exe" target\debug\ensayo-llm-vulkan.exe -Force -ErrorAction Stop } catch { Write-Warning "Could not update target\debug\ensayo-llm-vulkan.exe (is tauri dev running?): $_" }
} else {
  Write-Host 'Vulkan SDK not found (VULKAN_SDK is not set): skipping the graphics-card AI helper. The app will use the processor helper.'
}
