//! Safe deletion. Project deletion removes its reminders in the same transaction and
//! only when the count still matches what the user confirmed. Reminder deletion
//! returns the removed row so the UI can offer Undo, which restores it exactly.

use rusqlite::params;
use serde::Serialize;

use crate::date::{is_timestamp, now_timestamp};
use crate::error::{Error, Field};
use crate::model::{Reminder, ReminderInput, validate_id};
use crate::store::{REMINDER_COLUMNS, Store, reminder_from_row};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletedProject {
    pub project_id: String,
    pub deleted_reminders: u32,
}

impl Store {
    /// Deletes a project and all of its reminders atomically. `expected_reminders`
    /// is the count shown in the confirmation; a different count changes nothing.
    pub fn delete_project(
        &mut self,
        id: &str,
        expected_reminders: u32,
    ) -> Result<DeletedProject, Error> {
        let id = validate_id(id, Field::Id)?;
        self.write(|tx| {
            let exists: bool = tx.query_row("SELECT EXISTS (SELECT 1 FROM projects WHERE id = ?1)", [&id], |r| r.get(0))?;
            if !exists {
                return Err(Error::NotFound { entity: "project" });
            }
            let count: u32 = tx.query_row("SELECT count(*) FROM reminders WHERE project_id = ?1", [&id], |r| r.get(0))?;
            if count != expected_reminders {
                return Err(Error::Changed {
                    message: format!(
                        "This project now has {count} reminder{}, not {expected_reminders}. Nothing was deleted; review and confirm again.",
                        if count == 1 { "" } else { "s" }
                    ),
                });
            }
            tx.execute("DELETE FROM reminders WHERE project_id = ?1", [&id])?;
            tx.execute("DELETE FROM projects WHERE id = ?1", [&id])?;
            Ok(DeletedProject { project_id: id.clone(), deleted_reminders: count })
        })
    }

    /// Deletes one reminder and returns it, so it can be restored with Undo.
    pub fn delete_reminder(&mut self, id: &str) -> Result<Reminder, Error> {
        let id = validate_id(id, Field::Id)?;
        self.write(|tx| {
            let reminder = tx
                .query_row(
                    &format!("SELECT {REMINDER_COLUMNS} FROM reminders WHERE id = ?1"),
                    [&id],
                    reminder_from_row,
                )
                .map_err(|e| match e {
                    rusqlite::Error::QueryReturnedNoRows => Error::NotFound { entity: "reminder" },
                    other => other.into(),
                })?;
            tx.execute("DELETE FROM reminders WHERE id = ?1", [&id])?;
            Ok(reminder)
        })
    }

    /// Re-inserts a deleted reminder with its original ID, creation time, and
    /// completion. The snapshot is untrusted and fully re-validated.
    pub fn restore_reminder(&mut self, snapshot: &Reminder) -> Result<Reminder, Error> {
        let id = validate_id(&snapshot.id, Field::Id)?;
        let valid = ReminderInput {
            project_id: snapshot.project_id.clone(),
            title: snapshot.title.clone(),
            text: snapshot.text.clone(),
            due_date: snapshot.due_date.clone(),
        }
        .validate()?;
        if !is_timestamp(&snapshot.created_at)
            || snapshot
                .completed_at
                .as_deref()
                .is_some_and(|t| !is_timestamp(t))
        {
            return Err(Error::invalid(Field::Id, "has an unreadable timestamp"));
        }
        let now = now_timestamp();
        self.write(|tx| {
            let taken: bool = tx.query_row("SELECT EXISTS (SELECT 1 FROM reminders WHERE id = ?1)", [&id], |r| r.get(0))?;
            if taken {
                return Err(Error::Changed { message: "That reminder is already present. Nothing was changed.".into() });
            }
            if let Some(project) = &valid.project_id {
                let exists: bool = tx.query_row("SELECT EXISTS (SELECT 1 FROM projects WHERE id = ?1)", [project], |r| r.get(0))?;
                if !exists {
                    return Err(Error::invalid(Field::ProjectId, "was deleted, so this reminder cannot be restored into it"));
                }
            }
            tx.execute(
                "INSERT INTO reminders (id, project_id, title, text, due_date, completed_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![id, valid.project_id, valid.title, valid.text, valid.due_date, snapshot.completed_at, snapshot.created_at, now],
            )?;
            Ok(tx.query_row(&format!("SELECT {REMINDER_COLUMNS} FROM reminders WHERE id = ?1"), [&id], reminder_from_row)?)
        })
    }
}
