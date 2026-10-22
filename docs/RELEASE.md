# Cutting a tester release

1. Update `version` in `src-tauri/tauri.conf.json` (and `package.json`, `src-tauri/Cargo.toml`) to the same number.
2. `git tag v0.2.0 && git push origin v0.2.0`. The **Release** workflow makes a draft release in the public releases repo, then builds the Windows installer and both Mac disk images (Apple silicon and Intel), signs the updater packages, and uploads everything. When the three builds are done it adds `latest.json`.
3. Open the draft in the public releases repo, install the files on a clean user account, run through `INSTALL.md`, then publish by hand. Publishing is what makes the update visible to installed copies.
4. A dry run without a tag: Actions, **Release**, **Run workflow** (builds the installers and keeps them as artifacts; needs the signing secrets).

## The automatic updater

Installed copies of Ensayo look for a newer version 20 seconds after they start and every 6 hours after that (an hour after a failed check). When one is found, a banner at the top of the app says "Ensayo 0.2.0 is ready". **Update now** downloads it, checks its signature against the public key in `tauri.conf.json`, installs it and restarts. **Later** hides the banner until the next start. Settings, About shows the version and has **Check for updates**. The banner never appears in a practice session, and an update is refused while an answer is being recorded.

How it fits together:

- The app asks `https://github.com/mmnzns/ensayo-releases/releases/latest/download/latest.json` (`plugins.updater.endpoints` in `src-tauri/tauri.conf.json`, the only place it is set). The Ensayo repo is private and GitHub downloads from a private repo need a login, so the installers, `.sig` files and `latest.json` are published in a separate public repo that holds releases only.
- `scripts/latest-json.mjs` builds `latest.json` from every `.sig` on the release. Test it with `node --test scripts/latest-json.check.mjs`.
- Debug builds (`npm run tauri dev`) never check.
- Local release builds need the signing key too, because `bundle.createUpdaterArtifacts` is on: `TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/ensayo.key)" npm run tauri build`.

### One-time setup

1. Create the public repo `mmnzns/ensayo-releases` (empty except a README, so it has a default branch). To use another name, change the endpoint in `tauri.conf.json`, set the repo variable `RELEASE_REPO` and change `DEFAULT_REPO` in `scripts/latest-json.mjs`.
2. Make a fine-grained token that can only touch that repo, with **Contents: Read and write**, and add it to the Ensayo repo as the secret `RELEASES_TOKEN`.
3. Add the secrets `TAURI_SIGNING_PRIVATE_KEY` (the contents of `~/.tauri/ensayo.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the key was made with an empty password, and GitHub won't store an empty secret: skip this one, the workflow then passes it unset, which Tauri reads as an empty password; confirm with a dry run).
4. Keep `~/.tauri/ensayo.key` safe and backed up somewhere private. It is never committed. If it is lost, installed copies can't be updated: they would reject anything signed with a new key, and testers would have to install the next version by hand. The public half is in `tauri.conf.json`.

The first release with the updater (0.2.0 or later, whatever carries this change) is still installed by hand. From then on, testers on that version get the next one by themselves.

## Code signing: deliberately none

Ensayo ships unsigned, like Talaan and Parlato, until an app earns the money for certificates (decided 2026-10-22). What that
means, and what INSTALL.md already tells testers:

- **Mac:** the app is ad-hoc signed. First open is right-click, Open. Because the signature changes with every build, macOS
  asks for the microphone again after each update. To stop that later, add the secrets `APPLE_CERTIFICATE` (base64 of a
  `.p12`), `APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY`; the Mac job already passes them when present.
- **Windows:** SmartScreen shows "Windows protected your PC" once; More info, Run anyway. A code-signing certificate removes it.

The updater's own signature (the minisign key above) is separate from both and is always on: it is what stops a tampered
download from installing.

## What a tester build must not contain

No personal data and no stories (the app starts empty), no API keys, and a general question set plus role packs only. The question bank is bundled in the app's code, so it can be read by anyone who unpacks the app: do not put anything in `questions/` that must stay private from testers.
