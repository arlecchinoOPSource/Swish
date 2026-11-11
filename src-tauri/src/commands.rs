//! Swish's data commands and storage state, shared by the standalone app and by a host that embeds Swish
//! (Unhollowed). Nothing here knows about windows, closing or quitting.

use std::path::PathBuf;
use std::sync::Mutex;

use swish_data::{
    ApiError, DATABASE_FILE, DeletedProject, Error, Project, ProjectInput, Reminder, ReminderInput,
    Store, Workspace,
};
use tauri::State;

/// The open store, or the reason it could not be opened. The window still starts so
/// the UI can explain the failure instead of crashing.
pub struct Storage {
    store: Mutex<Result<Store, ApiError>>,
    data_dir: PathBuf,
}

impl Storage {
    /// Opens Swish's database inside `data_dir` (creating nothing else). The folder is kept so features that
    /// write beside the database (restore's safety copies) use the same one, wherever the owner of the window
    /// put it: Swish's own folder when standalone, a folder chosen by the host when embedded.
    pub fn open(data_dir: PathBuf) -> Self {
        let store = Store::open(&data_dir.join(DATABASE_FILE)).map_err(ApiError::from);
        Self {
            store: Mutex::new(store),
            data_dir,
        }
    }

    /// Storage that could not be set up; every command reports `error`, so the UI can explain it.
    pub fn unavailable(error: ApiError) -> Self {
        Self {
            store: Mutex::new(Err(error)),
            data_dir: PathBuf::new(),
        }
    }

    pub fn data_dir(&self) -> &std::path::Path {
        &self.data_dir
    }

    pub fn with<T>(
        &self,
        work: impl FnOnce(&mut Store) -> Result<T, Error>,
    ) -> Result<T, ApiError> {
        // A panic mid-write already rolled its transaction back; the connection stays usable.
        let mut guard = self
            .store
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match guard.as_mut() {
            Ok(store) => work(store).map_err(ApiError::from),
            Err(error) => Err(error.clone()),
        }
    }
}

#[tauri::command]
pub fn load_workspace(storage: State<'_, Storage>) -> Result<Workspace, ApiError> {
    storage.with(|store| store.workspace())
}

#[tauri::command]
pub fn create_project(
    storage: State<'_, Storage>,
    input: ProjectInput,
) -> Result<Project, ApiError> {
    storage.with(|store| store.create_project(&input))
}

#[tauri::command]
pub fn update_project(
    storage: State<'_, Storage>,
    id: String,
    input: ProjectInput,
) -> Result<Project, ApiError> {
    storage.with(|store| store.update_project(&id, &input))
}

#[tauri::command]
pub fn create_reminder(
    storage: State<'_, Storage>,
    input: ReminderInput,
) -> Result<Reminder, ApiError> {
    storage.with(|store| store.create_reminder(&input))
}

#[tauri::command]
pub fn update_reminder(
    storage: State<'_, Storage>,
    id: String,
    input: ReminderInput,
) -> Result<Reminder, ApiError> {
    storage.with(|store| store.update_reminder(&id, &input))
}

#[tauri::command]
pub fn set_reminder_completed(
    storage: State<'_, Storage>,
    id: String,
    completed: bool,
) -> Result<Reminder, ApiError> {
    storage.with(|store| store.set_completed(&id, completed))
}

#[tauri::command]
pub fn delete_project(
    storage: State<'_, Storage>,
    id: String,
    expected_reminders: u32,
) -> Result<DeletedProject, ApiError> {
    storage.with(|store| store.delete_project(&id, expected_reminders))
}

#[tauri::command]
pub fn delete_reminder(storage: State<'_, Storage>, id: String) -> Result<Reminder, ApiError> {
    storage.with(|store| store.delete_reminder(&id))
}

#[tauri::command]
pub fn restore_reminder(
    storage: State<'_, Storage>,
    reminder: Reminder,
) -> Result<Reminder, ApiError> {
    storage.with(|store| store.restore_reminder(&reminder))
}
