# Live build checks: Ensayo on voice-engine v0.3.1, with every fix

For the live test on the PC, after the Windows chat's first round (2026-10-30). The build is the bundle: the engine move
(now on v0.3.1), the QA fixes (0.1.5 and windows-polish), and the graphics-card helper built by the engine's workflow.
Report results to Miguel. Fix nothing in engine code. If the engine is at fault, note it on the Notion page "Voice Apps
Engine Sync" › Still open, under "From Ensayo's move".

## Already passed (first round, branch engine-v0.2.2 at cfd1273)

Tests; the installer builds with the Vulkan helper; `Test-GgmlBaseline`; installed over 0.1.4 with all 6 models linked
as the same files, nothing downloaded, 0 left for later.

## Get the build

GitHub, Actions, Release, Run workflow on branch `engine-v0.2.2`. When it finishes, download the `ensayo-Windows`
artifact (the installer). The build still says 0.1.4; the version goes up at release.

## Checks

1. **Install over a running Ensayo.** Start the installed Ensayo, ask local AI one thing so its helper is running, then
   run the new installer without quitting. It must close `ensayo-llm.exe` and `ensayo-llm-vulkan.exe` (no "file in
   use"), and keys and data must survive. Quit Ensayo afterwards: no helper is left running.
2. **Story read with local AI.** It failed on 0.1.4 (Qwen 3.5 4B's reply failed the schema twice). Run it again; it must
   finish.
3. **Graphics-card default.** Settings › Speech › "Use the graphics card" is on and names the RTX 5070 Ti, not the
   Radeon. Parakeet Ultra runs on DirectML on the RTX (the log's backend and device), at least the processor's 57x.
4. **Local AI on the card.** Score one rep with Qwen 3.5 4B. The reply comes from the Vulkan helper; compare its time
   with the processor's 4.96 s.
5. **Fallback.** Quit Ensayo, set `VOICE_ENGINE_GPU=fail` (this build's helpers read `VOICE_ENGINE_*`, not
   `ENSAYO_*`), start it, score a rep. The one-time notice appears and the reply still arrives on the processor. Then
   remove the variable and restart: the failure is remembered, so the AI stays on the processor with no notice (by
   design, the notice is only for a card that just failed). Turn the switch off and on: the next reply is on the card
   again, without a restart.
6. **Switch off.** Speech and AI run on the processor, with no notice.
7. **Delete per model.** Delete a model no other app uses: it is erased. Delete one Talaan or Parlato also uses: it is
   kept for them.
8. **Ollama and LM Studio.** If either is installed and running, its models and context sizes appear in Settings.
9. **Windows look** (the windows-polish fixes): dark title bar, Windows scrollbars, a real 1366x768 screen (the window
   fits and remembers its size and place), and the 5 interviewer voices.
10. **Do not** run Delete all data on real data.
