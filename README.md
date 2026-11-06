# Swish

A blue Arlecchino desktop app for projects and reminders. Build the identity first: UI, logo, sounds, and animations; then make the reminder system reliable. Version 2 brings the same experience to iPhone.

**Status: pre-release desktop build.** Not a released app. Shell/theme/motion/audio primitives come from a pinned [Arlecchino Core](https://github.com/arlecchinoOPSource/Arlecchino-Core) submodule. Projects and reminders can be created, edited, completed, deleted (with confirmation or undo), searched, and backed up to a file you choose; they are stored in local SQLite in the native app (see implementation notes for [7–10](docs/IMPLEMENTATION-7-10.md) and [11–14](docs/IMPLEMENTATION-11-14.md)). Release installers remain later work. The browser preview (`npm run dev:web`) keeps data in memory only and says so.

## Product and implementation guidance

- [Vision and v1 scope](docs/VISION.md) · [UI specification](docs/DESIGN.md) · [Architecture](docs/ARCHITECTURE.md)
- [Data contract](docs/DATA.md) · [Numbered roadmap](docs/ROADMAP.md) · [Source decisions](docs/SOURCE-DECISIONS.md)
- [Release checklist](docs/RELEASE.md) · [Contribution guide](CONTRIBUTING.md) · [Agent instructions](AGENTS.md)

## Development preview

```sh
git clone --recurse-submodules https://github.com/arlecchinoOPSource/Swish.git
cd Swish
npm ci
npm run dev
```

For an existing clone: `git submodule update --init --recursive` before installing. Private repository access is required. Use Node 24. Run `npm run check` for strict typechecking and a production web build. Run `cargo test --manifest-path src-tauri/Cargo.toml -p swish-data` for the storage tests. Use `npm run dev:web` for browser-only preview, `npm run dev` for Tauri, and `npm run build:native` for a native binary.

Shared UI changes belong in Core. See the [integration contract](docs/ARCHITECTURE.md); do not fork shared styling inside this repository.

Automated consumer CI runs on pushes and pull requests with read-only Core access; see [CI setup](docs/CI.md). Local typecheck/build and Core contract tests pass.
