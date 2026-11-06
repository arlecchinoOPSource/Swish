# Issues 7–10: projects, reminders, and completion on local SQLite

Stacked on PR #22 (issues 3–6), which is still open; these branches assume its Core 0.4.0 pin and canvas.

## S-07 / #7 — domain and SQLite migrations

`src-tauri/data` is a Tauri-free crate holding the shared model (one reminder type with nullable `projectId`), boundary validation, versioned migrations, and the transactional store. The native host opens `swish.sqlite3` in the app data directory at startup; if that fails the window still opens and the canvas explains the error with a retry instead of showing invented empty data. The only command so far, `load_workspace`, is declared in `build.rs` and granted in `capabilities/main.json`.

Tests (synthetic data only): calendar-date and timestamp formatting; input validation (blank, multi-line, oversized, control characters, invalid dates, malformed IDs, unknown fields); fresh migration and reopen; every migration step from an empty file; newer-schema refusal; foreign-database refusal without modification; foreign-key orphan rejection, cascade, and stable IDs; CHECK/STRICT constraints; date-only round-trip and independent dates; multi-statement rollback; display order and camelCase serialization; error messages without internals. A browser test covers the failed-load/retry state.

Verified here: `cargo test -p swish-data` and `cargo clippy` on Linux; `cargo build` of the native host on Linux (compile only); strict TypeScript/Vite build; Chromium UI tests. Not verified: native startup or storage on macOS/Windows (CI builds both), WebKit UI tests locally. Only schema version 1 exists, so "old-schema migration" is covered as the 0→1 step and the step-by-step harness; real upgrade fixtures arrive with the first schema change.

## S-08 / #8 — create and edit projects

`Store::create_project` / `update_project` validate at the boundary, write in one transaction, and return the stored row; edits keep the ID and `createdAt`. Native commands `create_project` and `update_project` are granted individually. The canvas renders real projects (ordered by deadline) and the unsaved sample layout from PR #22 is removed. "New Project" is available on the canvas and in the rail's Create panel; each project panel has Edit Project. Forms mark required fields in text, put errors next to the field (`aria-invalid`, message with a warning glyph, focus moved to the field), and keep the whole draft after any failure with a Retry save action. The status bar reads SAVING… then SAVED only after the native command returns; the browser preview never says Saved. Delete Project stays disabled until S-11.

Tests: Rust create/trim, edit preserves ID and creation time, invalid input writes nothing, missing and malformed IDs, SQL-looking text stored literally, multiple projects surviving a file reopen. Chromium: create from canvas and rail, deadline ordering, focus after save/cancel, edit identity, field validation, simulated failed save with draft kept and retry, four long projects at 480×400. Screenshots: `docs/screenshots/projects-canvas.png`, `projects-edit.png`.

Not verified: native create/edit through the real desktop window on macOS or Windows, and app restart there. Restart persistence is verified at the storage layer by reopening the SQLite file.

## S-09 / #9 — standalone and project reminders

`Store::create_reminder` / `update_reminder` check the project reference inside the writing transaction (a missing project is a field error naming Project, never an orphan), keep the ID, `createdAt`, and completion state on every edit or move, and leave completion to its own command. Native commands `create_reminder` and `update_reminder` are granted individually. One `ReminderCard` and one `ReminderForm` serve both contexts: header, optional text, optional due date (with Clear due date), and a Project selector including "Regular Reminders (no project)". New Reminder is available in each project, in Regular Reminders, and in the rail's Create panel. Project reminder lists scroll and are keyboard-focusable regions; a list grows while it contains a form so nothing is clipped. The large completion control is shown but disabled until S-10.

Tests: Rust creation in both contexts with independent dates, orphan/malformed references and invalid fields rejected without writes, moving project→project→regular preserving ID/creation/completion, a failed move leaving the row unchanged, and persistence after reopening the file. Chromium: both contexts share the card, rail entry and validation, moving with stable IDs and focus, clearing the due date, failed save with every field kept and retry, six long reminders at 480×400 with keyboard scrolling. Screenshots: `docs/screenshots/reminders-canvas.png`, `reminders-edit.png`.

Not verified: reminder create/edit through the real desktop window on macOS or Windows.

## S-10 / #10 — completion and project progress

`Store::set_completed` sets `completedAt` (keeping the first timestamp if completed again) or clears it; it never deletes, and content edits never touch completion. The `set_reminder_completed` command is granted individually. Each card enables Core's large `CompletionControl` (Space/Enter by keyboard). While a toggle is saving the control is disabled and the label says so; the card changes only from what storage returns. A failed toggle leaves the stored state on screen, explains which change failed, and offers Retry. The completion sound plays only after a successful completion. Project progress is derived from the project's reminders ("1 of 2 completed", "— all done", or "No reminders to complete yet"), shown as text with a decorative bar; completed cards show "✓ Completed" text, not only color.

Tests: Rust complete/reopen without deletion, idempotent repeats keep timestamps, edits keep completion, unknown/malformed IDs, completion and reopening surviving a file reopen. Chromium: keyboard toggling, progress counts including empty and all-done, regular reminders, failed completion with stored state shown and retry, editing a completed reminder. Screenshot: `docs/screenshots/completion-progress.png`.

## Native evidence on Linux (all four issues)

The debug native binary was built with the bundled frontend and run under Xvfb on Linux (WebKitGTK), driven with xdotool. In the real window it loaded through IPC (LOCAL DATA READY), created a project with a date-only deadline (stored exactly as `2026-11-20`), created a project reminder, and completed it; the status bar showed SAVED after each commit. After killing and relaunching the app, the project, reminder, ✓ Completed state, and "1 of 1 completed — all done" progress came back from `~/.local/share/com.arlecchino.swish/swish.sqlite3`: `docs/screenshots/native-linux-after-restart.png`. Linux is not a v1 target; macOS and Windows native storage, restart, and installed behavior remain unverified and need checks on those platforms. Typing into WebKitGTK's date field with synthetic keys did not move between segments (the calendar picker worked); check keyboard date entry on the real targets. `gen/schemas/macOS-schema.json` is regenerated on macOS builds and was not refreshed here.
