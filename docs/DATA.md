# Data contract

Implemented in `src-tauri/data` (crate `swish-data`) as a versioned SQLite schema in the native app; browser localStorage is never the source of truth for projects or reminders. The browser development preview (`npm run dev:web`) uses an in-memory adapter and labels itself as not saving to disk.

## Storage implementation (S-07)

- File: `swish.sqlite3` in the Tauri app data directory for `com.arlecchino.swish`; no shared database with Terminal or Ember. `PRAGMA application_id` marks the file as Swish (`0x53575348`); a database from another application is refused rather than adopted.
- Migrations: an append-only list in `migrations.rs`, tracked by `PRAGMA user_version`; each step runs in its own transaction. A file written by a newer schema is refused with an update message instead of being downgraded.
- Connection: `foreign_keys=ON` (verified on open), `trusted_schema=OFF`, WAL journal, `synchronous=FULL`, five-second busy timeout. Tables are `STRICT`.
- Constraints repeat the boundary rules: 36-character IDs, nonblank names/titles, `YYYY-MM-DD`-shaped dates, `ON DELETE CASCADE` from projects to their reminders, `ON UPDATE RESTRICT` so project IDs never change.
- Boundary validation (`model.rs`) trims and limits names/titles to one line of 200 characters, text to 10,000 characters, rejects control characters, checks real calendar dates (leap years included), canonical UUID references, and unknown JSON fields.
- All mutations go through `Store::write`, one immediate transaction; callers report Saved only after it returns. Errors reach the UI as `{ code, field?, message }` without paths, SQL, or stored content.
- Timestamps (`createdAt`, `updatedAt`, `completedAt`) are RFC 3339 UTC with milliseconds.

| Entity | Fields |
| --- | --- |
| Project | immutable ID, nonempty name, optional description, deadline date, createdAt, updatedAt |
| Reminder | immutable ID, nullable projectId, nonempty title, text, nullable dueDate, completedAt or null, createdAt, updatedAt |

Project deadline is required by the intended v1 creation flow. Reminder due date is optional. Date-only deadlines use ISO YYYY-MM-DD values, not UTC-midnight timestamps, to avoid timezone drift. Timestamps identify actual events. Any later time-of-day alert feature must specify timezone, daylight-saving, missed-alert, and device lifecycle policies separately.

A null projectId means a regular reminder. A non-null projectId must resolve to an existing project. The same reminder model and rendering behavior serve both contexts. Progress is derived from completion states; do not store a second contradictory total. Completing preserves the item and can be reversed.

Validate inputs at the native boundary, use parameterized queries and foreign keys, and serialize autosave mutations. Save status follows committed transactions. A failed write keeps draft data and a retry path. Deleting a project and children is atomic after confirmation; undo or confirmation protects reminder deletion. Editing or moving a reminder preserves its ID and completion history.

Tests must cover empty/invalid titles, orphan references, date boundaries, completing/reopening, independent due dates, rollback, restart persistence, and old-schema migration. Use synthetic data only. Backup/restore (S-14) validates version, structure, every field, unique IDs, and references before any replacement; it saves a safety copy of the current data first and replaces everything in one transaction. See docs/IMPLEMENTATION-11-14.md.
