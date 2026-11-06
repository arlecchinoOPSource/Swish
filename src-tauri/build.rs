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
        ]),
    ))
    .expect("failed to run tauri-build");
}
