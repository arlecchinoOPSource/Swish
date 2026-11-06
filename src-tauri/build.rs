fn main() {
    // Every app command must be listed here and granted in capabilities/main.json;
    // anything not granted is denied to the webview.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "load_workspace",
            "create_project",
            "update_project",
            "create_reminder",
            "update_reminder",
            "set_reminder_completed",
            "delete_project",
            "delete_reminder",
            "restore_reminder",
            "export_backup",
            "inspect_backup",
            "cancel_restore",
            "restore_backup",
            "undo_restore",
            "finish_exit",
        ]),
    ))
    .expect("failed to run tauri-build");
}
