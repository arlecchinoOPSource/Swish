# Planned data contract

Use a versioned SQLite schema in the native app; not browser localStorage as the release source of truth.

| Entity | Fields |
| --- | --- |
| Project | immutable ID, nonempty name, optional description, deadline date, createdAt, updatedAt |
| Reminder | immutable ID, nullable projectId, nonempty title, text, nullable dueDate, completedAt or null, createdAt, updatedAt |

Project deadline is required by the intended v1 creation flow. Reminder due date is optional. Date-only deadlines use ISO YYYY-MM-DD values, not UTC-midnight timestamps, to avoid timezone drift. Timestamps identify actual events. Any later time-of-day alert feature must specify timezone, daylight-saving, missed-alert, and device lifecycle policies separately.

A null projectId means a regular reminder. A non-null projectId must resolve to an existing project. The same reminder model and rendering behavior serve both contexts. Progress is derived from completion states; do not store a second contradictory total. Completing preserves the item and can be reversed.

Validate inputs at the native boundary, use parameterized queries and foreign keys, and serialize autosave mutations. Save status follows committed transactions. A failed write keeps draft data and a retry path. Deleting a project and children is atomic after confirmation; undo or confirmation protects reminder deletion. Editing or moving a reminder preserves its ID and completion history.

Tests must cover empty/invalid titles, orphan references, date boundaries, completing/reopening, independent due dates, rollback, restart persistence, and old-schema migration. Use synthetic data only. Backup/restore is a hardening issue; validate version and structure before any replacement, with rollback on failure.
