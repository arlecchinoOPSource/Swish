# Terminal parity: panels, controls, sound, startup and close

Owner feedback (November 6, 2026) after testing the preview:

1. Search, Create, Themes, and Sounds should open as centred popups, like Terminal.
2. The radios, checkboxes, and sliders in Themes, Sounds, and Settings should look like Terminal's.
3. The project canvas should be narrower and more compact.
4. No sound played at all.
5. Startup screen and animation with the same startup and close sounds as Terminal and Ember.

The shared parts were built in Arlecchino Core first (Core PR #16, version 0.5.0, ported from Terminal `420a5e6`); this change consumes that pin.

## What changed

- **Panels:** Search and Themes use Core's `search` placement (centred near the top, `›` field, keyboard-highlighted results), and Create and Sounds use the `list` placement (centred). All four dim the window behind them. Settings stays beside its rail button, as in Terminal.
- **Controls:**
  - Themes is Terminal's searchable list with live swatches.
  - Sounds has the master ON/OFF switch, master volume, and a row per sound with its own switch and ▶ preview.
  - Settings uses Terminal's sections (DISPLAY, INTERFACE, BACKUP, ABOUT), select rows, and segmented Motion and Startup screen controls.
- **Canvas:**
  - The column is 760 px wide (was 960) and the padding is tighter.
  - An empty project shows one "No reminders in this project yet." line (the duplicate empty progress line is gone).
  - New Reminder, Edit Project, and Delete Project share one row, with Delete (still red) at its end; Edit and Delete Reminder share one row too.
- **Sound, why it was silent:**
  1. Every cue defaulted to off.
  2. Core played sounds through `<audio>` elements, which a macOS web view blocks without a click.
  3. In the native app, the security policy blocked the page from fetching its own bundled sound files (`connect-src` lacked `'self'`, which Terminal has).

  All three are fixed. Swish now ships with sound **on** by default, which goes against Terminal's opt-in default; the owner asked to hear the sounds. Earlier all-off settings are not carried over, but an explicit mute would be.
- **Startup:** the shared startup sound plays once at launch (`sounds.playStartup()` before the first render, as in Terminal). The startup screen now follows real data readiness: it leaves when local data has loaded, and shows "LOCAL DATA UNAVAILABLE" if loading fails, instead of always claiming ready.
- **Close:** closing the window (or quitting with ⌘Q) is held. The page waits for queued saves, starts the shared close sound, and the host hides the window at once and exits when the sound ends (at most 6.5 s), leaving fullscreen first on macOS. This is ported from Terminal's host. Every step has a timeout, so a stuck save or audio device cannot keep the app open indefinitely.
- **Interface sounds:** clicks in the rail, panels, dialogs, and canvas actions; completion when a reminder is checked off; error when a save fails.

## Evidence

- Core: 22 unit tests (fake Web Audio).
- Swish:
  - 71 Chromium UI tests, including an axe WCAG A/AA audit of every panel in all four themes.
  - Six sound tests. A Web Audio spy records which bundled file actually starts, which also proves the WAVs decode.
  - Native suite 6/6 on Linux.
- **Native close on Linux** (Xvfb, Openbox, PulseAudio null sink, real window close via the window manager):
  - The page asked to linger 6000 ms, the full close sound.
  - The window disappeared immediately.
  - The process exited 6.0 s later, with or without a prior click.
- **Native startup sound on Linux:** recorded from the null sink at launch. Its envelope matches `startup.wav` (loud for about 2 s, then quiet, then a small swell at about 5 s), scaled by the 70% volume curve: about 8,000 recorded against the file's 17,281 × 0.49 ≈ 8,467.
- **A defect found and fixed in Core by that test:** hiding the window had stopped the close sound.
- **Screenshots:** `docs/screenshots/terminal-parity/`.

Not verified: macOS and Windows speakers, macOS fullscreen close, and Windows close behaviour. CI runs the native suite on Windows, but it does not listen for sound.
