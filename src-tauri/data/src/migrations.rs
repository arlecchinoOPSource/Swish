//! Versioned schema migrations tracked by `PRAGMA user_version`.
//!
//! Each entry upgrades from version `index` to `index + 1` inside one transaction,
//! so a failed step leaves the file at its previous version. Never edit a released
//! migration; append a new one.

use rusqlite::{Connection, TransactionBehavior};

use crate::error::Error;

/// `PRAGMA application_id` marking a file as Swish data ("SWSH").
pub const APPLICATION_ID: i64 = 0x5357_5348;

pub const MIGRATIONS: &[&str] = &[
    // 0 -> 1: projects and the one shared reminder model.
    r#"
    CREATE TABLE projects (
        id          TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
        name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
        description TEXT NOT NULL DEFAULT '',
        deadline    TEXT NOT NULL CHECK (deadline GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    ) STRICT;

    CREATE TABLE reminders (
        id           TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
        project_id   TEXT NULL REFERENCES projects (id) ON DELETE CASCADE ON UPDATE RESTRICT,
        title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
        text         TEXT NOT NULL DEFAULT '',
        due_date     TEXT NULL CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
        completed_at TEXT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
    ) STRICT;

    CREATE INDEX reminders_by_project ON reminders (project_id, created_at);
    "#,
];

pub fn latest_version() -> i64 {
    MIGRATIONS.len() as i64
}

pub fn version(conn: &Connection) -> Result<i64, Error> {
    Ok(conn.pragma_query_value(None, "user_version", |row| row.get(0))?)
}

/// Brings `conn` to the latest schema, refusing files from newer versions or other apps.
pub fn migrate(conn: &mut Connection) -> Result<i64, Error> {
    migrate_to(conn, latest_version())
}

/// Migrates up to `target`. Public so tests can create older-schema fixtures.
pub fn migrate_to(conn: &mut Connection, target: i64) -> Result<i64, Error> {
    let current = check(conn)?;
    for step in current..target.min(latest_version()) {
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute_batch(MIGRATIONS[step as usize])?;
        // Integers from our own constant table, not user input.
        tx.execute_batch(&format!(
            "PRAGMA application_id = {APPLICATION_ID}; PRAGMA user_version = {};",
            step + 1
        ))?;
        tx.commit()?;
    }
    version(conn)
}

/// Read-only check that the file is Swish data this version can open. Runs before
/// anything (journal mode, migrations) writes to the file, so refused files stay
/// byte-for-byte unchanged. Returns the current schema version.
pub fn check(conn: &Connection) -> Result<i64, Error> {
    let app_id: i64 = conn.pragma_query_value(None, "application_id", |row| row.get(0))?;
    let current = version(conn)?;
    if app_id != APPLICATION_ID && (app_id != 0 || current != 0 || has_tables(conn)?) {
        return Err(Error::ForeignDatabase);
    }
    if current > latest_version() {
        return Err(Error::SchemaTooNew {
            found: current,
            supported: latest_version(),
        });
    }
    Ok(current)
}

fn has_tables(conn: &Connection) -> Result<bool, Error> {
    Ok(conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_schema WHERE type = 'table')",
        [],
        |row| row.get(0),
    )?)
}
