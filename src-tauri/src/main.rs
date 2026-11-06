#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup_commands;

use std::sync::Mutex;

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

/// Builds the main window from tauri.conf.json (where it is `create: false`).
fn create_main_window(app: &tauri::App) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .expect("tauri.conf.json defines the main window");
    #[allow(unused_mut)]
    let mut builder = tauri::WebviewWindowBuilder::from_config(app, &config)?;
    #[cfg(debug_assertions)]
    {
        builder = webdriver_overrides(builder);
    }
    builder.build()?;
    Ok(())
}

/// Debug builds only: when Microsoft Edge WebDriver launches the app, it passes its
/// debugging port and data folder through WebView2 environment variables. Tauri always
/// sets WebView2's browser arguments (and its own data folder) explicitly, so apply the
/// driver's values on top of Tauri's defaults. Normal launches set neither variable.
#[cfg(debug_assertions)]
fn webdriver_overrides<'a>(
    mut builder: tauri::WebviewWindowBuilder<'a, tauri::Wry, tauri::App>,
) -> tauri::WebviewWindowBuilder<'a, tauri::Wry, tauri::App> {
    if let Ok(extra) = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") {
        // Tauri's (wry's) defaults, kept so the app behaves as in a normal launch.
        let defaults = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
        builder = builder.additional_browser_args(&format!("{defaults} {extra}"));
    }
    if let Some(folder) = std::env::var_os("WEBVIEW2_USER_DATA_FOLDER") {
        builder = builder.data_directory(std::path::PathBuf::from(folder));
    }
    builder
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(backup_commands::PendingRestore::default())
        .manage(backup_commands::LastSafetyCopy::default())
        .setup(|app| {
            let store = open_store(app);
            app.manage(Storage(Mutex::new(store)));
            create_main_window(app)?;
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
            backup_commands::undo_restore
        ])
        .run(tauri::generate_context!())
        .expect("Swish could not start");
}
