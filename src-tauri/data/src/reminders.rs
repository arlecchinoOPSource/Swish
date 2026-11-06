//! Reminder create/edit. One implementation serves regular and project reminders;
//! moving between them keeps the ID, creation time, and completion state.

use rusqlite::{OptionalExtension, Transaction, params};

use crate::date::now_timestamp;
use crate::error::{Error, Field};
use crate::model::{Reminder, ReminderInput, new_id, validate_id};
use crate::store::{REMINDER_COLUMNS, Store, reminder_from_row};

/// Checks the project reference inside the writing transaction, so the answer
/// cannot go stale before the write commits.
fn require_project(tx: &Transaction<'_>, project_id: Option<&str>) -> Result<(), Error> {
    let Some(id) = project_id else { return Ok(()) };
    let exists: bool = tx.query_row(
        "SELECT EXISTS (SELECT 1 FROM projects WHERE id = ?1)",
        [id],
        |row| row.get(0),
    )?;
    if exists {
        Ok(())
    } else {
        Err(Error::invalid(
            Field::ProjectId,
            "no longer exists; choose another project or Regular Reminders",
        ))
    }
}

fn select(tx: &Transaction<'_>, id: &str) -> Result<Reminder, Error> {
    Ok(tx.query_row(
        &format!("SELECT {REMINDER_COLUMNS} FROM reminders WHERE id = ?1"),
        [id],
        reminder_from_row,
    )?)
}

impl Store {
    pub fn create_reminder(&mut self, input: &ReminderInput) -> Result<Reminder, Error> {
        let valid = input.validate()?;
        let id = new_id();
        let now = now_timestamp();
        self.write(|tx| {
            require_project(tx, valid.project_id.as_deref())?;
            tx.execute(
                "INSERT INTO reminders (id, project_id, title, text, due_date, completed_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?6)",
                params![id, valid.project_id, valid.title, valid.text, valid.due_date, now],
            )?;
            select(tx, &id)
        })
    }

    /// Updates content and assignment. Completion is changed only by `set_completed`.
    pub fn update_reminder(&mut self, id: &str, input: &ReminderInput) -> Result<Reminder, Error> {
        let id = validate_id(id, Field::Id)?;
        let valid = input.validate()?;
        let now = now_timestamp();
        self.write(|tx| {
            require_project(tx, valid.project_id.as_deref())?;
            let changed = tx.execute(
                "UPDATE reminders SET project_id = ?2, title = ?3, text = ?4, due_date = ?5, updated_at = ?6 WHERE id = ?1",
                params![id, valid.project_id, valid.title, valid.text, valid.due_date, now],
            )?;
            if changed == 0 {
                return Err(Error::NotFound { entity: "reminder" });
            }
            select(tx, &id)
        })
    }

    pub fn reminder(&self, id: &str) -> Result<Option<Reminder>, Error> {
        Ok(self
            .connection()
            .query_row(
                &format!("SELECT {REMINDER_COLUMNS} FROM reminders WHERE id = ?1"),
                [id],
                reminder_from_row,
            )
            .optional()?)
    }
}

impl Store {
    /// Marks a reminder completed or open again. Completing never deletes; repeating
    /// the same state keeps the original completion time.
    pub fn set_completed(&mut self, id: &str, completed: bool) -> Result<Reminder, Error> {
        let id = validate_id(id, Field::Id)?;
        let now = now_timestamp();
        self.write(|tx| {
            let changed = tx.execute(
                "UPDATE reminders SET
                    completed_at = CASE WHEN ?2 THEN coalesce(completed_at, ?3) ELSE NULL END,
                    updated_at = CASE WHEN (completed_at IS NOT NULL) = ?2 THEN updated_at ELSE ?3 END
                 WHERE id = ?1",
                params![id, completed, now],
            )?;
            if changed == 0 {
                return Err(Error::NotFound { entity: "reminder" });
            }
            select(tx, &id)
        })
    }
}
