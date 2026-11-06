# Issues 3–6: visual and sensory foundation

Prior Core PR #14 and Swish PR #21 were approved, merged and pulled. The accepted icon/wordmark remain unchanged. This phase consumes Core 0.4.0 for completion controls, sound catalogue/manager, theme/sound/motion panels and readiness-based startup.

Canvas includes an opt-in, explicitly unsaved sample project and standalone reminder. Headers, descriptions, independent dates, completion labels, large right-side checkboxes, progress and scrollable project content are present. Red delete controls are disabled pending safe deletion and SQLite work. No mock data is silently persisted.

Swish preferences use the app-specific swish.preferences.v1 key; theme, font, text size, motion, startup and sound options survive reload. Invalid values fall back safely. Failed writes show an error and retry; reminders never claim Saved. OS reduced motion overrides app motion and updates live.

Audio defaults are quiet. Explicit previews respect mute and zero volume. Shared playback limits overlap, throttles repeated cues, handles failures and stops on backgrounding. Assets are bundled locally; provenance is in Core. Closing-window audio is not wired in this phase. Real native device output/system mute still needs manual verification; browser playback is not that evidence.

Validation: Core tests, strict TypeScript/Vite build, native macOS build, Chromium/WebKit UI tests covering panels, keyboard completion, sample reset, persistent settings, OS motion override and audio decoding. Screenshots are in docs/screenshots. Final sensory acceptance remains open pending owner review and native sound/lifecycle evidence. No v1 release, reminder CRUD or storage migration is claimed.
