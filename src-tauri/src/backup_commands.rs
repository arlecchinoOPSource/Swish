//! Backup export and restore. Rust opens the native file dialogs itself, so the
//! webview never supplies a filesystem path and needs no file or dialog permissions.
//! Restore is two-step: `inspect_backup` validates a chosen file and holds it under a
//! one-time token; `restore_backup` saves a safety copy of the current data and then
//! replaces everything in one transaction.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use swish_data::backup::{self, Counts, ValidBackup};
use swish_data::model::new_id;
use swish_data::{ApiError, Error};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::commands::Storage;

/// A validated backup waiting for the user's confirmation.
#[derive(Default)]
pub struct PendingRestore(Mutex<Option<(String, ValidBackup)>>);

/// The safety copy written by the most recent restore in this session.
#[derive(Default)]
pub struct LastSafetyCopy(Mutex<Option<PathBuf>>);

fn io(message: &str) -> ApiError {
    ApiError::from(Error::Io(std::io::Error::other(message.to_owned())))
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn file_name(path: &std::path::Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("backup")
        .to_owned()
}

#[derive(Serialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ExportResult {
    Cancelled,
    Saved { file_name: String, counts: Counts },
}

#[tauri::command]
pub async fn export_backup(
    app: AppHandle,
    storage: State<'_, Storage>,
) -> Result<ExportResult, ApiError> {
    // Snapshot first, so the file matches what was on screen when Export was chosen.
    let snapshot = storage.with(|store| store.export_backup())?;
    let Some(choice) = app
        .dialog()
        .file()
        .set_title("Export Swish backup")
        .set_file_name(backup::suggested_file_name(&snapshot.exported_at))
        .add_filter("Swish backup", &["json"])
        .blocking_save_file()
    else {
        return Ok(ExportResult::Cancelled);
    };
    let path = choice
        .into_path()
        .map_err(|_| io("That location cannot be written to."))?;
    backup::write_atomically(&path, &snapshot.to_json()).map_err(ApiError::from)?;
    Ok(ExportResult::Saved {
        file_name: file_name(&path),
        counts: snapshot.counts(),
    })
}

#[derive(Serialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum InspectResult {
    Cancelled,
    Ready {
        token: String,
        file_name: String,
        exported_at: String,
        backup: Counts,
        current: Counts,
    },
}

#[tauri::command]
pub async fn inspect_backup(
    app: AppHandle,
    storage: State<'_, Storage>,
    pending: State<'_, PendingRestore>,
) -> Result<InspectResult, ApiError> {
    *lock(&pending.0) = None;
    let Some(choice) = app
        .dialog()
        .file()
        .set_title("Choose a Swish backup to restore")
        .add_filter("Swish backup", &["json"])
        .blocking_pick_file()
    else {
        return Ok(InspectResult::Cancelled);
    };
    let path = choice
        .into_path()
        .map_err(|_| io("That file cannot be read."))?;
    let valid = backup::read_backup_file(&path).map_err(ApiError::from)?;
    let current = storage.with(|store| store.counts())?;
    let token = new_id();
    let result = InspectResult::Ready {
        token: token.clone(),
        file_name: file_name(&path),
        exported_at: valid.backup().exported_at.clone(),
        backup: valid.backup().counts(),
        current,
    };
    *lock(&pending.0) = Some((token, valid));
    Ok(result)
}

#[tauri::command]
pub fn cancel_restore(pending: State<'_, PendingRestore>) {
    *lock(&pending.0) = None;
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    restored: Counts,
    safety_copy: String,
}

#[tauri::command]
pub fn restore_backup(
    token: String,
    storage: State<'_, Storage>,
    pending: State<'_, PendingRestore>,
    last: State<'_, LastSafetyCopy>,
) -> Result<RestoreResult, ApiError> {
    // Hold the selection until the restore succeeds, so a failure can be retried.
    let mut held = lock(&pending.0);
    let valid = match held.as_ref() {
        Some((token_held, valid)) if *token_held == token => valid,
        _ => {
            return Err(ApiError::from(Error::Changed {
                message: "That backup is no longer selected. Choose the file again.".into(),
            }));
        }
    };
    let dir = storage.data_dir().join("backups");
    let (restored, copy) = storage.with(|store| {
        // The safety copy must exist before anything is replaced.
        let copy = backup::write_safety_copy(&dir, &store.export_backup()?)?;
        Ok((store.restore_backup(valid)?, copy))
    })?;
    *held = None;
    drop(held);
    let safety_copy = file_name(&copy);
    *lock(&last.0) = Some(copy);
    Ok(RestoreResult {
        restored,
        safety_copy,
    })
}

/// Puts back the data that was replaced by this session's last restore.
#[tauri::command]
pub fn undo_restore(
    storage: State<'_, Storage>,
    last: State<'_, LastSafetyCopy>,
) -> Result<Counts, ApiError> {
    let Some(path) = lock(&last.0).clone() else {
        return Err(ApiError::from(Error::Changed {
            message: "There is no restore to undo.".into(),
        }));
    };
    let counts = storage.with(|store| {
        let previous = backup::read_backup_file(&path)?;
        store.restore_backup(&previous)
    })?;
    *lock(&last.0) = None;
    Ok(counts)
}
