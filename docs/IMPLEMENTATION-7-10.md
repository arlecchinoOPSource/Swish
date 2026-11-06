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
