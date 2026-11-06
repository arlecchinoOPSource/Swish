#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use swish_data::{
    ApiError, DATABASE_FILE, Error, Project, ProjectInput, Reminder, ReminderInput, Store,
    Workspace,
};
use tauri::{Manager, State};

/// The open store, or the reason it could not be opened. The window still starts so
/// the UI can explain the failure instead of crashing.
struct Storage(Mutex<Result<Store, ApiError>>);

impl Storage {
    fn with<T>(&self, work: impl FnOnce(&mut Store) -> Result<T, Error>) -> Result<T, ApiError> {
        // A panic mid-write already rolled its transaction back; the connection stays usable.
        let mut guard = self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match guard.as_mut() {
            Ok(store) => work(store).map_err(ApiError::from),
            Err(error) => Err(error.clone()),
        }
    }
}

fn open_store(app: &tauri::App) -> Result<Store, ApiError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| ApiError::from(Error::Io(std::io::Error::other("no app data directory"))))?;
    Store::open(&dir.join(DATABASE_FILE)).map_err(ApiError::from)
}

#[tauri::command]
fn load_workspace(storage: State<'_, Storage>) -> Result<Workspace, ApiError> {
    storage.with(|store| store.workspace())
}

#[tauri::command]
fn create_project(storage: State<'_, Storage>, input: ProjectInput) -> Result<Project, ApiError> {
    storage.with(|store| store.create_project(&input))
}

#[tauri::command]
fn update_project(
    storage: State<'_, Storage>,
    id: String,
    input: ProjectInput,
) -> Result<Project, ApiError> {
    storage.with(|store| store.update_project(&id, &input))
}

#[tauri::command]
fn create_reminder(
    storage: State<'_, Storage>,
    input: ReminderInput,
) -> Result<Reminder, ApiError> {
    storage.with(|store| store.create_reminder(&input))
}

#[tauri::command]
fn update_reminder(
    storage: State<'_, Storage>,
    id: String,
    input: ReminderInput,
) -> Result<Reminder, ApiError> {
    storage.with(|store| store.update_reminder(&id, &input))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let store = open_store(app);
            app.manage(Storage(Mutex::new(store)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            create_project,
            update_project,
            create_reminder,
            update_reminder
        ])
        .run(tauri::generate_context!())
        .expect("Swish could not start");
}
