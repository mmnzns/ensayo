# Ensayo

Interview rehearsal app. Answer out loud, get one fix, answer again. Mac and Windows. Free.

Public repo (the updater reads its releases). Decisions and the build plan live in Notion ("Ensayo (Interview Practice App)").
Code lives here, outside Google Drive: `~/Developer/Ensayo` (Mac), `C:\Dev\Ensayo` (PC).

- **Using it:** `INSTALL.md`.
- **Working on it:** `CLAUDE.md` (setup, commands, rules). Plans per milestone are in `docs/plans/`.
- **Releasing it:** `docs/RELEASE.md`.
- **Third-party code and models:** `THIRD_PARTY_NOTICES.md`.
- **License:** MIT, see `LICENSE`.

```bash
npm install
sh scripts/build-llm-helper.sh      # once: the built-in local AI helper the app bundles
npm run tauri dev                   # the app
npm run dev                         # the screens in a browser, on sample data
npm test && cargo test --manifest-path src-tauri/Cargo.toml --workspace
```
