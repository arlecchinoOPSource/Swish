# Swish

A blue Arlecchino desktop app for projects and reminders. Build the identity first: UI, logo, sounds, and animations; then make the reminder system reliable. Version 2 brings the same experience to iPhone.

**Status: repository foundation and native desktop foundation preview.** This is not a released or functional reminder app. The preview imports real shell/theme/motion primitives from a pinned [Arlecchino Core](https://github.com/arlecchinoOPSource/Arlecchino-Core) submodule. Reminder CRUD, native SQLite, remain planned. Native host, shared audio/preferences, sample canvas, and generated icon assets are present; release installers remain later work.

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
