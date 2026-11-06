# Development instructions

Read README.md, docs/VISION.md, docs/DESIGN.md, docs/ARCHITECTURE.md, docs/ROADMAP.md, and the assigned GitHub issue before implementation.

- Preserve the owner's Main chat requirements recorded in docs/SOURCE-DECISIONS.md. Later explicit owner decisions override earlier proposals. UI, sound, animation, and identity are the first milestone gate.
- Reuse Arlecchino Core for shared shell, theme tokens, motion, audio, settings primitives, and checkbox styling. Keep application data and behavior outside Core. Do not copy shared implementations into Swish.
- Keep Terminal and Ember unchanged unless explicitly assigned a migration task. Inspect their current source and preserve user edits before any extraction or migration.
- Target React/TypeScript/Vite with Tauri 2 and Rust/local SQLite for the planned native app. Use strict types and minimal dependencies. No Tiptap or journal editor in Swish.
- No runtime accounts, telemetry, cloud dependency, or automatic data sharing. Bundle approved assets and retain licenses. Never commit real user data, credentials, signing keys, or backups.
- Use parameterized SQL, boundary validation, transactional mutations, and versioned migrations. Show Saved only after persistence succeeds; preserve dirty data on failures.
- Support keyboard interaction, focus visibility, text scaling, reduced motion, and optional audio. Completion, deletion, and overdue states must not rely on color alone.
- Work in focused issue branches. Check current git state; never reset unrelated work. Keep lockfiles, Core provenance, and upgrade notes current.
- Verify platform behavior on that platform. Do not claim native storage, installation, background notifications, iOS readiness, or release signing from web tests.
- The current repository setup is a foundation, not a completed v1 app. Follow the roadmap; do not silently add future utilities or sync.
