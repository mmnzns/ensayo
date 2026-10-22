# Installing Ensayo

Ensayo is a free practice app for interviews: you answer out loud, it gives you one note, you answer again. It runs on your own computer. Your answers and stories stay there.

## Mac

1. Download the disk image from the release page and open it: `Ensayo_<version>_aarch64.dmg` for Apple silicon, `Ensayo_<version>_x64.dmg` for an Intel Mac.
2. Drag **Ensayo** to **Applications**.
3. The first time only: in Applications, **right-click Ensayo, then Open**, then **Open** again. (macOS does this for any app that does not come from the App Store. If you see a message instead, open **System Settings, Privacy & Security** and choose **Open Anyway**.)
4. When Ensayo asks to use the microphone, choose **OK**. It cannot hear you otherwise.

## Windows

1. Download `Ensayo_<version>_x64-setup.exe` and run it.
2. If Windows says it protected your PC, choose **More info, then Run anyway**. (This appears for any app without a paid certificate.)
3. Open Ensayo from the Start menu. When Windows asks about the microphone, allow it. If you missed it: **Settings, Privacy & security, Microphone**.

## Updates

New versions arrive by themselves. Ensayo checks in the background; when one is ready a note at the top says so, and **Update now** installs it and restarts. **Later** hides it until the next time you open Ensayo. **Settings, About** shows your version and has **Check for updates**. Ensayo never updates in the middle of a practice answer.

## First run

Ensayo asks a few things about you, checks the microphone, downloads a speech model (a few hundred MB, once, so it works offline after), and lets you choose how feedback is given:

- **A model on this computer.** Free and private. Slower on older machines.
- **Your own key** from Anthropic, OpenAI, Google and others. Faster and sharper. You pay the provider, a few cents a session, and Ensayo has a spending cap.
- **Neither.** You still get timing, length and filler words, but not whether you answered the question.

You can change all of this later in **Settings**.

## Where things are

- Your stories and history are plain files in the **data folder** (Settings, Privacy shows where). You can point it at a synced folder to use the same stories on two computers; open Ensayo on one computer at a time.
- Speech models, answer recordings and settings are kept on this computer only.
- API keys are kept in the macOS Keychain or the Windows Credential Manager, never in a file.

## Giving feedback

**Settings, Feedback** writes an email to Miguel. **Label this rep** on a result (under the note) helps most: it says which notes were right.

## Removing Ensayo

- **In the app:** Settings, Privacy, **Delete all my data** removes your stories, history, recordings, models and saved keys.
- **Mac:** then drag Ensayo from Applications to the Bin.
- **Windows:** Settings, Apps, Ensayo, Uninstall. Tick **Delete the application data** to remove everything, including saved keys. A data folder you chose yourself (on a drive, say) is left alone because it holds your stories.
