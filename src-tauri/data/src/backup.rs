//! Versioned JSON backups. Export is a consistent snapshot; restore validates the
//! whole file (shape, version, every field, unique IDs, references) before a single
//! transaction replaces all data, so a bad file or failure changes nothing.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::{TransactionBehavior, params};
use serde::{Deserialize, Serialize};

use crate::date::{is_timestamp, now_timestamp};
use crate::error::{Error, Field};
use crate::migrations;
use crate::model::{Project, ProjectInput, Reminder, ReminderInput, validate_id};
use crate::store::{PROJECT_COLUMNS, REMINDER_COLUMNS, Store, project_from_row, reminder_from_row};

pub const BACKUP_FORMAT: &str = "swish-backup";
pub const BACKUP_VERSION: u32 = 1;
/// Larger files are refused before parsing.
pub const MAX_BACKUP_BYTES: u64 = 20 * 1024 * 1024;
const MAX_PROJECTS: usize = 10_000;
const MAX_REMINDERS: usize = 100_000;
/// Safety copies kept in the app data directory; older ones are removed.
pub const SAFETY_COPIES_KEPT: usize = 5;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    pub format: String,
    pub version: u32,
    pub schema_version: i64,
    pub exported_at: String,
    pub projects: Vec<Project>,
    pub reminders: Vec<Reminder>,
}

/// A backup that passed every check and may be restored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidBackup(Backup);

impl ValidBackup {
    pub fn backup(&self) -> &Backup {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub projects: usize,
    pub reminders: usize,
}

fn invalid(message: impl Into<String>) -> Error {
    Error::InvalidBackup {
        message: message.into(),
    }
}

impl Backup {
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).expect("backup serializes")
    }

    pub fn counts(&self) -> Counts {
        Counts {
            projects: self.projects.len(),
            reminders: self.reminders.len(),
        }
    }
}

/// Parses and fully validates backup text. Never touches storage.
pub fn parse_backup(text: &str) -> Result<ValidBackup, Error> {
    if text.len() as u64 > MAX_BACKUP_BYTES {
        return Err(invalid("The file is too large to be a Swish backup."));
    }
    // Read the envelope first so version problems get a clear message.
    #[derive(Deserialize)]
    struct Envelope {
        format: Option<String>,
        version: Option<u32>,
    }
    let envelope: Envelope = serde_json::from_str(text)
        .map_err(|_| invalid("The file is not a readable Swish backup."))?;
    if envelope.format.as_deref() != Some(BACKUP_FORMAT) {
        return Err(invalid("The file is not a Swish backup."));
    }
    match envelope.version {
        Some(BACKUP_VERSION) => {}
        Some(v) if v > BACKUP_VERSION => {
            return Err(invalid(format!(
                "This backup was made by a newer version of Swish (backup format {v}). Update Swish to restore it."
            )));
        }
        _ => {
            return Err(invalid(
                "This backup format is not supported by this version of Swish.",
            ));
        }
    }
    let backup: Backup = serde_json::from_str(text).map_err(|e| {
        invalid(format!(
            "The backup is damaged or incomplete ({}).",
            short_serde(&e)
        ))
    })?;
    validate(backup).map(ValidBackup)
}

fn short_serde(error: &serde_json::Error) -> String {
    let text = error.to_string();
    // Drop line/column noise and anything that could echo long content.
    let first = text
        .split(" at line")
        .next()
        .unwrap_or("unexpected content");
    first.chars().take(120).collect()
}

fn validate(mut backup: Backup) -> Result<Backup, Error> {
    if backup.schema_version < 1 || backup.schema_version > migrations::latest_version() {
        return Err(invalid(format!(
            "This backup lists data schema {}, which this version of Swish cannot restore.",
            backup.schema_version
        )));
    }
    if !is_timestamp(&backup.exported_at) {
        return Err(invalid("The backup's export time is unreadable."));
    }
    if backup.projects.len() > MAX_PROJECTS || backup.reminders.len() > MAX_REMINDERS {
        return Err(invalid(
            "The backup contains more items than Swish supports.",
        ));
    }
    let mut project_ids = HashSet::new();
    for (index, p) in backup.projects.iter_mut().enumerate() {
        let at = |what: &str| invalid(format!("Project {} {what}.", index + 1));
        validate_id(&p.id, Field::Id).map_err(|_| at("has an invalid identifier"))?;
        if !project_ids.insert(p.id.clone()) {
            return Err(at("repeats an identifier used by another project"));
        }
        let valid = ProjectInput {
            name: p.name.clone(),
            description: p.description.clone(),
            deadline: p.deadline.clone(),
        }
        .validate()
        .map_err(|e| at(&format!("is invalid: {e}")))?;
        if !is_timestamp(&p.created_at) || !is_timestamp(&p.updated_at) {
            return Err(at("has an unreadable timestamp"));
        }
        (p.name, p.description, p.deadline) = (valid.name, valid.description, valid.deadline);
    }
    let mut reminder_ids = HashSet::new();
    for (index, r) in backup.reminders.iter_mut().enumerate() {
        let at = |what: &str| invalid(format!("Reminder {} {what}.", index + 1));
        validate_id(&r.id, Field::Id).map_err(|_| at("has an invalid identifier"))?;
        if !reminder_ids.insert(r.id.clone()) {
            return Err(at("repeats an identifier used by another reminder"));
        }
        let valid = ReminderInput {
            project_id: r.project_id.clone(),
            title: r.title.clone(),
            text: r.text.clone(),
            due_date: r.due_date.clone(),
        }
        .validate()
        .map_err(|e| at(&format!("is invalid: {e}")))?;
        if let Some(project) = &valid.project_id
            && !project_ids.contains(project)
        {
            return Err(at("belongs to a project that is not in the backup"));
        }
        if !is_timestamp(&r.created_at)
            || !is_timestamp(&r.updated_at)
            || r.completed_at.as_deref().is_some_and(|t| !is_timestamp(t))
        {
            return Err(at("has an unreadable timestamp"));
        }
        (r.project_id, r.title, r.text, r.due_date) =
            (valid.project_id, valid.title, valid.text, valid.due_date);
    }
    Ok(backup)
}

impl Store {
    /// A consistent snapshot of everything, read inside one transaction.
    pub fn export_backup(&mut self) -> Result<Backup, Error> {
        let schema_version = self.schema_version()?;
        let tx = self
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Deferred)?;
        let projects = tx
            .prepare(&format!(
                "SELECT {PROJECT_COLUMNS} FROM projects ORDER BY deadline, created_at, id"
            ))?
            .query_map([], project_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        let reminders = tx
            .prepare(&format!(
                "SELECT {REMINDER_COLUMNS} FROM reminders ORDER BY created_at, id"
            ))?
            .query_map([], reminder_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        tx.commit()?;
        Ok(Backup {
            format: BACKUP_FORMAT.into(),
            version: BACKUP_VERSION,
            schema_version,
            exported_at: now_timestamp(),
            projects,
            reminders,
        })
    }

    pub fn counts(&self) -> Result<Counts, Error> {
        let count = |table: &str| -> Result<usize, Error> {
            Ok(self
                .connection()
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| {
                    r.get::<_, i64>(0)
                })? as usize)
        };
        Ok(Counts {
            projects: count("projects")?,
            reminders: count("reminders")?,
        })
    }

    /// Replaces all projects and reminders with the backup in one transaction.
    pub fn restore_backup(&mut self, backup: &ValidBackup) -> Result<Counts, Error> {
        let b = backup.backup();
        self.write(|tx| {
            tx.execute("DELETE FROM reminders", [])?;
            tx.execute("DELETE FROM projects", [])?;
            for p in &b.projects {
                tx.execute(
                    "INSERT INTO projects (id, name, description, deadline, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![p.id, p.name, p.description, p.deadline, p.created_at, p.updated_at],
                )?;
            }
            for r in &b.reminders {
                tx.execute(
                    "INSERT INTO reminders (id, project_id, title, text, due_date, completed_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![r.id, r.project_id, r.title, r.text, r.due_date, r.completed_at, r.created_at, r.updated_at],
                )?;
            }
            Ok(b.counts())
        })
    }
}

/// Writes `contents` to `path` via a temporary file and rename, so a crash never
/// leaves a half-written backup under the final name.
pub fn write_atomically(path: &Path, contents: &str) -> Result<(), Error> {
    write_file(path, contents, false)
}

/// Writes a file that only its owner may read (restore's safety copies hold everything that was replaced).
fn write_private(path: &Path, contents: &str) -> Result<(), Error> {
    write_file(path, contents, true)
}

fn write_file(path: &Path, contents: &str, private: bool) -> Result<(), Error> {
    use std::io::Write;
    let parent = path
        .parent()
        .ok_or_else(|| Error::Io(std::io::Error::other("no parent directory")))?;
    std::fs::create_dir_all(parent)?;
    if private {
        crate::store::restrict_to_owner(parent)?;
    }
    let temp = parent.join(format!(
        ".{}.partial",
        path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("swish-backup")
    ));
    {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        if private {
            std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        }
        let mut file = options.open(&temp)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
    }
    std::fs::rename(&temp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&temp);
    })?;
    Ok(())
}

/// Reads a backup file with a size limit before parsing.
pub fn read_backup_file(path: &Path) -> Result<ValidBackup, Error> {
    let size = std::fs::metadata(path)?.len();
    if size > MAX_BACKUP_BYTES {
        return Err(invalid("The file is too large to be a Swish backup."));
    }
    let text = std::fs::read_to_string(path)
        .map_err(|_| invalid("The file could not be read as text."))?;
    parse_backup(&text)
}

/// Saves the current data as a safety copy in `dir` before a restore and keeps only
/// the newest few. Returns the copy's path.
pub fn write_safety_copy(dir: &Path, backup: &Backup) -> Result<PathBuf, Error> {
    let stamp = backup.exported_at.replace([':', '.'], "-");
    let path = dir.join(format!("before-restore-{stamp}.json"));
    write_private(&path, &backup.to_json())?;
    let mut copies: Vec<PathBuf> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("before-restore-") && n.ends_with(".json"))
        })
        .collect();
    copies.sort();
    let excess = copies.len().saturating_sub(SAFETY_COPIES_KEPT);
    for old in copies.into_iter().take(excess) {
        let _ = std::fs::remove_file(old);
    }
    Ok(path)
}

/// Suggested export file name, e.g. `swish-backup-2026-11-06.json`.
pub fn suggested_file_name(exported_at: &str) -> String {
    format!(
        "swish-backup-{}.json",
        exported_at.get(..10).unwrap_or("export")
    )
}
