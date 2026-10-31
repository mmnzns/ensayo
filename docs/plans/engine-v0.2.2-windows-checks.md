# Windows checks: Ensayo on voice-engine v0.2.2

For the Windows chat, on the PC (C:\Dev\Ensayo). Report results to Miguel. Fix nothing in engine code. If the engine is at fault, note it on the Notion page "Voice Apps Engine Sync" › Still open, under "From Ensayo's move".

## Setup

1. Back up `%LOCALAPPDATA%\com.craftconceptsdigital.ensayo` and Ensayo's data folder first.
2. Make sure installed Ensayo 0.1.4 has Parakeet Ultra and Qwen 3.5 4B downloaded (download them in 0.1.4 if not).
3. Fetch, then check out `engine-v0.2.2`.
4. Install the Vulkan SDK if you want the local AI graphics-card helper built locally (`VULKAN_SDK` must be set). Otherwise `scripts\build-llm-helper.ps1` skips it.
5. Run `cd src-tauri; cargo test --workspace`, then `npx tsc --noEmit` and `npm test -- --run`.

## Checks

1. **Build.** Run `npm run tauri build -- --bundles nsis`. To bundle the Vulkan helper as a release does, add the release `--config` described in docs/RELEASE.md. Check that `Test-GgmlBaseline` passes on the app's whisper.cpp cache (`-O2`, AVX2 baseline).
2. **Install over 0.1.4.**
   - Install the new build over the running 0.1.4, so the installer has to close `ensayo-llm.exe` (and `ensayo-llm-vulkan.exe` if one is running).
   - The install must not fail on a locked helper.
   - Keys and data must survive.
3. **Model move-in.** On first launch the log shows the move report, with 0 left for later. Parakeet Ultra, voice detection and Qwen 3.5 4B must now be in `%LOCALAPPDATA%\Craft Concepts Digital\Models\<id>\`. Check:
   - each is the same file as before (`fsutil file queryfileid`), not a copy;
   - nothing was downloaded;
   - the old paths still exist as hard links.
4. **Graphics-card default.** Settings › Speech › "Use the graphics card" should be on and name the RTX 5070 Ti, not the Radeon. Then confirm:
   - Parakeet Ultra reports DirectML on the RTX;
   - its speed is at least the processor's 57x.
5. **Local AI on the card.** With the Vulkan helper present and the switch on, score one rep with Qwen 3.5 4B. Compare the reply time with the processor's 4.96 s.
6. **Fallback.** Force a card failure (`ENSAYO_GPU=fail` for a locally built helper; `VOICE_ENGINE_GPU=fail` for a CI-built one). Check two things:
   - the one-time notice appears, and the reply still arrives on the processor;
   - turning the switch off and on again clears it.
7. **Switch off.** With the card switch off, speech and AI must run on the processor and show no notice.
8. **Delete per model.** Delete Parakeet v3 if present, or another model no other app uses: it is erased. Delete one Talaan also uses: it is kept for Talaan.
9. **Ollama and LM Studio.** If either is installed and running, its models and context sizes appear in Settings.
10. **windows-polish items not yet checked by eye** (on branch `qa`):
    - the dark title bar;
    - the Windows scrollbars;
    - a real 1366x768 screen;
    - the 5 interviewer voices.
11. **Do not** run Delete all data on real data.
