#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup_commands;
mod closing;

use std::sync::Mutex;
use std::sync::atomic::Ordering;

use swish_data::{
    ApiError, DATABASE_FILE, DeletedProject, Error, Project, ProjectInput, Reminder, ReminderInput,
    Store, Workspace,
};
use tauri::{Manager, State};

/// The open store, or the reason it could not be opened. The window still starts so
/// the UI can explain the failure instead of crashing.
pub struct Storage(Mutex<Result<Store, ApiError>>);

impl Storage {
    pub fn with<T>(
        &self,
        work: impl FnOnce(&mut Store) -> Result<T, Error>,
    ) -> Result<T, ApiError> {
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

/// Swish's own data directory (`com.arlecchino.swish`). Debug builds accept a
/// `SWISH_DATA_DIR` override so native tests use throwaway folders; release builds
/// ignore it.
pub fn data_dir<R: tauri::Runtime>(app: &impl Manager<R>) -> Result<std::path::PathBuf, ApiError> {
    #[cfg(debug_assertions)]
    if let Some(dir) = std::env::var_os("SWISH_DATA_DIR") {
        return Ok(dir.into());
    }
    app.path()
        .app_data_dir()
        .map_err(|_| ApiError::from(Error::Io(std::io::Error::other("no app data directory"))))
}

fn open_store(app: &tauri::App) -> Result<Store, ApiError> {
    Store::open(&data_dir(app)?.join(DATABASE_FILE)).map_err(ApiError::from)
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

#[tauri::command]
fn set_reminder_completed(
    storage: State<'_, Storage>,
    id: String,
    completed: bool,
) -> Result<Reminder, ApiError> {
    storage.with(|store| store.set_completed(&id, completed))
}

#[tauri::command]
fn delete_project(
    storage: State<'_, Storage>,
    id: String,
    expected_reminders: u32,
) -> Result<DeletedProject, ApiError> {
    storage.with(|store| store.delete_project(&id, expected_reminders))
}

#[tauri::command]
fn delete_reminder(storage: State<'_, Storage>, id: String) -> Result<Reminder, ApiError> {
    storage.with(|store| store.delete_reminder(&id))
}

#[tauri::command]
fn restore_reminder(storage: State<'_, Storage>, reminder: Reminder) -> Result<Reminder, ApiError> {
    storage.with(|store| store.restore_reminder(&reminder))
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(closing::ExitAllowed::default())
        .on_window_event(|window, event| {
            // Hold the close so the page can finish saving and play the close sound.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event
                && !window
                    .state::<closing::ExitAllowed>()
                    .0
                    .load(Ordering::SeqCst)
            {
                api.prevent_close();
                closing::request_close(window.app_handle());
            }
        })
        .manage(backup_commands::PendingRestore::default())
        .manage(backup_commands::LastSafetyCopy::default())
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
            update_reminder,
            set_reminder_completed,
            delete_project,
            delete_reminder,
            restore_reminder,
            backup_commands::export_backup,
            backup_commands::inspect_backup,
            backup_commands::cancel_restore,
            backup_commands::restore_backup,
            backup_commands::undo_restore,
            closing::finish_exit
        ])
        .build(tauri::generate_context!())
        .expect("Swish could not start");
    app.run(|app, event| {
        // Quit from the menu or keyboard (e.g. Cmd+Q) takes the same path as closing the window.
        if let tauri::RunEvent::ExitRequested { api, .. } = event
            && !app.state::<closing::ExitAllowed>().0.load(Ordering::SeqCst)
        {
            api.prevent_exit();
            closing::request_close(app);
        }
    });
}
