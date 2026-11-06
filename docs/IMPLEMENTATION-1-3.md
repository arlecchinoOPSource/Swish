# Issues 1–3 implementation

Core dependency advances from 21bb473 to b928bb1 (suite-ui 0.3.0). Toolbar-free layout is now a public Core option; no app override. Core audit records source ownership and pending extractions.

Implemented: Tauri desktop host, unique identifier, empty privilege allowlist, bundled-content CSP, five keyboard-accessible navigation panels with Escape/focus return, session-only theme selection, blue wordmark and native icon assets. Reminder and sound controls remain explicitly unavailable pending their scoped issues.

Validation: strict TypeScript and Vite build; native macOS release binary and ad-hoc .app bundle; native launch observed at tauri://localhost with all five navigation controls; 4 Chromium/WebKit interaction/layout tests; 11 Core contracts. Screenshots in docs/screenshots show desktop and minimum window. Windows native CI is configured; its outcome is recorded in the PR. Installed Windows icon remains unverified.

Tauri configuration reference: https://v2.tauri.app/reference/config/ . No release publication or data migration performed.
