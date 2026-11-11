//! The standalone application: window, close handling, quitting and `run()`. A host that embeds Swish builds
//! this crate with `default-features = false` and never compiles any of this.

use std::sync::atomic::Ordering;

use swish_data::{ApiError, Error};
use tauri::Manager;

use crate::backup_commands;
use crate::closing;
use crate::commands::{self, Storage};

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

fn open_store(app: &tauri::App) -> Storage {
    match data_dir(app) {
        Ok(dir) => Storage::open(dir),
        Err(error) => Storage::unavailable(error),
    }
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

pub fn run() {
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
            app.manage(open_store(app));
            create_main_window(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_workspace,
            commands::create_project,
            commands::update_project,
            commands::create_reminder,
            commands::update_reminder,
            commands::set_reminder_completed,
            commands::delete_project,
            commands::delete_reminder,
            commands::restore_reminder,
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
