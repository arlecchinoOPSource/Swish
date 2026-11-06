# Architecture

Swish owns its React/TypeScript/Vite frontend, planned Tauri 2 host and Rust/SQLite storage. Core supplies shared UI. `vendor/arlecchino-core` is a Git submodule pinned to a commit; `package.json` imports its suite-ui package via a local file dependency. This implements the owner's two-repository request while keeping one source of shared behavior.

Current `src/App.tsx` is a small composition preview using Core AppShell, Rail, IdentityStrip, StatusBar, IconButton, and styles. It is not the reminder implementation. A minimal Tauri host now uses com.arlecchino.swish, no privileged frontend commands, and a restrictive bundled-content policy. Domain and persistence live in `src-tauri/data` (`swish-data`, no Tauri dependency, so `cargo test -p swish-data` runs anywhere). `src-tauri/src/main.rs` owns the data path and exposes app commands; each command is declared in `build.rs` and granted individually in `capabilities/main.json`, so anything not granted is denied. The frontend reaches storage only through `src/storage.ts` (native `invoke`, or the in-memory browser preview adapter). SQLite files and preferences must use a Swish-specific application data directory and unique app identifier.

Upgrade Core in its own PR, then advance this submodule pin in a focused Swish PR, regenerate package-lock.json, and run typecheck, build, and affected regression checks. Review screenshots/audio before accepting shared behavior changes. Never edit the submodule as an unrecorded app-local patch. Do not use moving remote branch imports.

For private-repository CI, the default GITHUB_TOKEN cannot read a second private repository. The workflow requires a read-only deploy key secret `CORE_READ_KEY` for Core and checks out only the pinned submodule. No credential is committed. See docs/CI.md. Local builds use the developer's GitHub authentication.

Tauri capabilities, notifications, file dialogs, persistence, and native lifecycle belong to app adapters; Core receives explicit callbacks and settings. No shared database with Terminal or Ember. v2 iOS needs separate platform evidence and has no implicit sync with desktop.
