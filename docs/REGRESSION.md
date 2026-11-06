# Regression suites and platform evidence (S-15)

Three layers. Each records what it proves and where it cannot reach.

| Layer | Command | Where it runs | What it proves |
| --- | --- | --- | --- |
| Storage | `cargo test --manifest-path src-tauri/Cargo.toml -p swish-data` | any OS; CI on macOS + Windows | schema, migrations, constraints, transactions, crash mid-write, backup validation, refused files untouched |
| Browser UI | `npm run test:ui` | Chromium + WebKit; CI on macOS + Windows | interaction, accessibility, keyboard, focus, scaling, motion, mute, error paths (browser preview, in-memory data) |
| **Native** | `npm run test:native` (after a debug build, see below) | real desktop binary over WebDriver; CI on **Linux and Windows** | the real IPC, capability grants, SQLite file, restarts, migration and refused-file handling |

Build the native binary for the native suite:

```sh
npm run build
cargo build --manifest-path src-tauri/Cargo.toml --features tauri/custom-protocol
cargo install tauri-driver --locked   # once; Linux also needs webkit2gtk-driver, Windows msedgedriver
npm run test:native                   # on Linux without a display: xvfb-run -a npm run test:native
```

Debug builds honour `SWISH_DATA_DIR` so every native scenario uses a throwaway folder; release builds ignore it. Each scenario also clears the webview's own storage (preferences, drafts). The suite writes `native-e2e-report.json`, which CI uploads per platform.

## Coverage against the S-15 acceptance criteria

**Keyboard, focus, scaling, small windows, reduced motion, mute** (`tests/ui/regression.spec.ts`, `tests/ui/a11y.spec.ts`)
- The whole workflow with the keyboard only: create a project (including the date) and a reminder, complete, edit, delete + undo, search and jump to a result, delete a project through its confirmation.
- Every Tab stop has a focus indicator and is not covered by anything, including while the sticky Undo bar is showing.
- 14 px and 24 px text, with 150% root scaling, at the 480×400 minimum window: no horizontal overflow in the empty, populated, form, undo, panel, and confirmation states; panel close buttons and dialog actions stay on screen.
- OS reduced motion: no element keeps a transition or animation, and smooth scrolling is off.
- Mute: with every cue enabled but muted, completion and panels play nothing; unmuting plays again.
- axe WCAG 2.0/2.1/2.2 A and AA checks in **all four themes** across canvas, form errors, search, every panel, undo bar, delete confirmation, empty state, and load error.

**CRUD, search, delete, restart, migration, errors on native storage** (`tests/native/e2e.mjs`)
1. Create, edit, complete; SAVED only after the commit; rows checked in SQLite (exact date-only values); state identical after restart.
2. Accent-insensitive search with navigation; reminder delete + Undo; reminder delete made final; project delete through the keyboard-operated confirmation; checked in SQLite and after restart; no stray drafts.
3. An older empty database file is migrated to schema 1 and marked as Swish data.
4. A file from a newer Swish, another application's database, and a corrupt file each show "Local data unavailable" with the right reason, never invented empty data, and stay **byte-for-byte unchanged**.

## Defects found and fixed in S-15

| Defect | Found by | Fix |
| --- | --- | --- |
| Regular "New Reminder" button's accessible name did not contain its visible label (WCAG 2.5.3) | axe | Name is now "New Reminder in Regular Reminders" |
| Focused buttons scrolled behind the sticky Undo bar (WCAG 2.4.11) | focus sweep | `scroll-padding-bottom` sized from the bar's real height |
| Opening a refused file (newer, foreign) switched it to WAL before refusing it, modifying it | native suite | Read-only checks now run before any write; byte-for-byte Rust test |
| The Undo bar never appeared on WebKitGTK: the deleted row was read from inside a React state updater, which may run later | native suite | The write queue returns stored values directly |
| Preview restore picker was flaky on Windows WebKit (detached file input) | CI | Input is attached while open (PR for #14) |

## Platform evidence

| Platform | Evidence | Status |
| --- | --- | --- |
| Linux (not a v1 target) | Native suite 6/6, three consecutive local runs; GTK file dialogs exercised for backup (see IMPLEMENTATION-11-14.md) | Verified here |
| Windows | Native suite in CI (`native-e2e (windows-latest)`); storage + UI suites in CI | See the PR's CI run |
| macOS | Storage + UI suites in CI; native build in CI. **No WebDriver exists for WKWebView apps**, so the native checks below are manual | Needs a person on a Mac |

### Manual macOS native checklist

Run `npm run dev` (or the built app) on a Mac. Use synthetic data.

1. Keyboard only: create a project (type the deadline with the keyboard), a reminder, complete it, delete it, Undo.
2. Quit with ⌘Q and reopen: everything is still there and the status bar reads LOCAL DATA READY.
3. Leave a form half-typed, quit, reopen: "Unsaved changes kept on this device" offers it back.
4. Delete a project with reminders; quit; reopen: gone, other items intact.
5. Settings → Export backup… (native save sheet), add a reminder, Restore from backup…, confirm, then Undo restore.
6. System Settings → Accessibility: Reduce Motion on (no animation), Larger Text / zoom, VoiceOver reads checkbox state, overdue text, and dialogs.
7. Mute in Sounds, complete a reminder: silent. Unmute: the cue plays through the speakers.
8. Data lives in `~/Library/Application Support/com.arlecchino.swish/` (`swish.sqlite3`, `backups/`).

Record the macOS version, Mac model, and results in the issue.
