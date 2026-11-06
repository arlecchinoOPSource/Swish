# Release gates

## v1.0.0

- Core visual/sensory gate complete, with source comparisons and owner review evidence recorded.
- All sidebar actions and settings implemented; no dead preview controls or mock save status.
- Projects and reminders create/edit/search/complete/delete correctly; safe deletion tested.
- SQLite persists across restart; failed writes, migrations, and backups tested with synthetic data.
- Keyboard, focus, text scaling, reduced motion, mute, and small-window layouts verified.
- macOS and Windows installers built and exercised on the actual platform, including install, launch, restart, and uninstall behavior.
- Asset licenses retained; version/changelog correct; signing status and remaining platform limits reported accurately.

## v2.0.0

Real iPhone evidence for portrait/landscape, keyboard, safe areas, persistence, lifecycle, notifications/permissions if shipped, accessibility, and distribution. Record signing and account requirements at release time. Passing simulator tests alone does not complete the release gate. Cross-device sync remains separately scoped.

Publishing a release is separate from repository setup. Never mark these gates satisfied by the initial preview build.
