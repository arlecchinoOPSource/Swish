# Issues 11–14: deletion, search, saving and dates, backup

Each issue has its own branch and PR, stacked in order (#11 → #12 → #13 → #14) on `main` after PRs #22–#26.

## S-11 / #11 — safe deletion

Every project and reminder has a red Delete button with an accessible name that says what it deletes (for projects, including the reminder count).

- **Projects:** a modal confirmation names the project and states how many reminders go with it, completed or not, and that this cannot be undone. Cancel has initial focus; Escape and Cancel change nothing and return focus to the Delete button. `Store::delete_project(id, expected_reminders)` deletes the reminders and the project in one transaction and only if the count still matches what was confirmed; otherwise it changes nothing and says why. A failure keeps the dialog open with the reason and a retry.
- **Reminders:** deletion is immediate and returns the removed row; an Undo bar ("Deleted reminder “…”") appears with focus on **Undo delete**. The 10-second window pauses while the bar has pointer or keyboard focus, and Dismiss ends it. Undo calls `Store::restore_reminder`, which re-validates the snapshot and re-inserts it with its original ID, project, creation time, and completion. Undo is refused cleanly if the project was deleted meanwhile, or if the reminder already exists (no duplicates).
- Commands `delete_project`, `delete_reminder`, `restore_reminder` are granted individually.

Tests: Rust — exact cascade scope, stale-count refusal, empty projects, forced mid-transaction failure rolling back child deletes, delete + undo identity/completion, double undo, undo into a deleted project, tampered snapshots, deletions persisting across reopen. Chromium — labelled buttons on every entity, confirm count, Cancel/Escape no-ops with focus return, failed delete with retry, undo restoring identity/completion/focus, undo expiry with a controlled clock, refused undo after project deletion. Screenshots: `docs/screenshots/delete-project-confirm.png`, `delete-reminder-undo.png`.

Not verified: deletion in the native window on macOS/Windows.
