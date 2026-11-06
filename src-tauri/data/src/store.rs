//! The Swish-only SQLite store. Every mutation runs in a single immediate transaction;
//! callers report "Saved" only after the method returns `Ok`.

use std::path::Path;
use std::time::Duration;

use rusqlite::{Connection, OpenFlags, Row, Transaction, TransactionBehavior};

use crate::error::Error;
use crate::migrations;
use crate::model::{Project, Reminder, Workspace};

/// File name inside the app's own data directory (`com.arlecchino.swish`).
pub const DATABASE_FILE: &str = "swish.sqlite3";

pub struct Store {
    conn: Connection,
}

pub(crate) const PROJECT_COLUMNS: &str = "id, name, description, deadline, created_at, updated_at";
pub(crate) const REMINDER_COLUMNS: &str =
    "id, project_id, title, text, due_date, completed_at, created_at, updated_at";

impl Store {
    /// Opens (creating if needed) the database at `path` and applies pending migrations.
    pub fn open(path: &Path) -> Result<Self, Error> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        Self::prepare(Connection::open_with_flags(path, flags)?, true)
    }

    /// A private in-memory store for tests.
    pub fn open_in_memory() -> Result<Self, Error> {
        Self::prepare(Connection::open_in_memory()?, false)
    }

    fn prepare(mut conn: Connection, on_disk: bool) -> Result<Self, Error> {
        conn.busy_timeout(Duration::from_secs(5))?;
        conn.pragma_update(None, "foreign_keys", true)?;
        conn.pragma_update(None, "trusted_schema", false)?;
        if on_disk {
            conn.pragma_update(None, "journal_mode", "WAL")?;
            conn.pragma_update(None, "synchronous", "FULL")?;
        }
        let enforced: bool = conn.pragma_query_value(None, "foreign_keys", |row| row.get(0))?;
        if !enforced {
            return Err(Error::Storage(rusqlite::Error::InvalidQuery));
        }
        migrations::migrate(&mut conn)?;
        Ok(Store { conn })
    }

    pub fn schema_version(&self) -> Result<i64, Error> {
        migrations::version(&self.conn)
    }

    /// Runs `work` in one immediate transaction: all of it commits, or none of it does.
    pub fn write<T>(
        &mut self,
        work: impl FnOnce(&Transaction<'_>) -> Result<T, Error>,
    ) -> Result<T, Error> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let value = work(&tx)?;
        tx.commit()?;
        Ok(value)
    }

    /// The full canvas: projects by deadline, reminders in creation order.
    pub fn workspace(&self) -> Result<Workspace, Error> {
        let mut projects = self.conn.prepare(&format!(
            "SELECT {PROJECT_COLUMNS} FROM projects ORDER BY deadline, created_at, id"
        ))?;
        let projects = projects
            .query_map([], project_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        let mut reminders = self.conn.prepare(&format!(
            "SELECT {REMINDER_COLUMNS} FROM reminders ORDER BY created_at, id"
        ))?;
        let reminders = reminders
            .query_map([], reminder_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Workspace {
            projects,
            reminders,
        })
    }

    /// Direct connection access for migration and constraint tests.
    #[doc(hidden)]
    pub fn connection(&self) -> &Connection {
        &self.conn
    }
}

pub(crate) fn project_from_row(row: &Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        deadline: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

pub(crate) fn reminder_from_row(row: &Row<'_>) -> rusqlite::Result<Reminder> {
    Ok(Reminder {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        text: row.get(3)?,
        due_date: row.get(4)?,
        completed_at: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}
