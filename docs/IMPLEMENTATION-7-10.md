# Issues 7–10: projects, reminders, and completion on local SQLite

Stacked on PR #22 (issues 3–6), which is still open; these branches assume its Core 0.4.0 pin and canvas.

## S-07 / #7 — domain and SQLite migrations

`src-tauri/data` is a Tauri-free crate holding the shared model (one reminder type with nullable `projectId`), boundary validation, versioned migrations, and the transactional store. The native host opens `swish.sqlite3` in the app data directory at startup; if that fails the window still opens and the canvas explains the error with a retry instead of showing invented empty data. The only command so far, `load_workspace`, is declared in `build.rs` and granted in `capabilities/main.json`.

Tests (synthetic data only): calendar-date and timestamp formatting; input validation (blank, multi-line, oversized, control characters, invalid dates, malformed IDs, unknown fields); fresh migration and reopen; every migration step from an empty file; newer-schema refusal; foreign-database refusal without modification; foreign-key orphan rejection, cascade, and stable IDs; CHECK/STRICT constraints; date-only round-trip and independent dates; multi-statement rollback; display order and camelCase serialization; error messages without internals. A browser test covers the failed-load/retry state.

Verified here: `cargo test -p swish-data` and `cargo clippy` on Linux; `cargo build` of the native host on Linux (compile only); strict TypeScript/Vite build; Chromium UI tests. Not verified: native startup or storage on macOS/Windows (CI builds both), WebKit UI tests locally. Only schema version 1 exists, so "old-schema migration" is covered as the 0→1 step and the step-by-step harness; real upgrade fixtures arrive with the first schema change.
