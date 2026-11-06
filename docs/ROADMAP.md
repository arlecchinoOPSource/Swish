# Roadmap

No due dates are invented. Milestones are dependency gates, not calendar promises. All listed implementation work starts open; the initial scaffold does not satisfy these full acceptance criteria.

## S1 — v1 identity and Core integration

Complete UI, blue theme, logo, sounds, and animations before reminder integration.

- [S-01 / #1: Bootstrap the Tauri desktop host around the Core shell](https://github.com/arlecchinoOPSource/Swish/issues/1) — depends on None within this repository. Core #2 establishes the consumer contract.
- [S-02 / #2: Match Terminal blue shell and five-action navigation](https://github.com/arlecchinoOPSource/Swish/issues/2) — depends on #1
- [S-03 / #3: Finalize Swish wordmark and external app icon](https://github.com/arlecchinoOPSource/Swish/issues/3) — depends on #2
- [S-04 / #4: Implement projects and regular-reminders canvas design](https://github.com/arlecchinoOPSource/Swish/issues/4) — depends on #2 Core #4–#8 provide the shared sensory foundation; coordinate the relevant Core exports before completion.
- [S-05 / #5: Connect shared themes, sounds, and typography settings](https://github.com/arlecchinoOPSource/Swish/issues/5) — depends on #2 Core #4–#8 provide the shared sensory foundation; coordinate the relevant Core exports before completion.
- [S-06 / #6: Complete startup, motion, sound, and identity review](https://github.com/arlecchinoOPSource/Swish/issues/6) — depends on #3, #4, #5 Core #4–#8 provide the shared sensory foundation; coordinate the relevant Core exports before completion.

## S2 — v1 projects and reminders

Local SQLite, CRUD, completion, safe delete, search, and honest saving.

- [S-07 / #7: Implement project/reminder domain and SQLite migrations](https://github.com/arlecchinoOPSource/Swish/issues/7) — depends on #6
- [S-08 / #8: Create and edit projects with deadlines](https://github.com/arlecchinoOPSource/Swish/issues/8) — depends on #7
- [S-09 / #9: Create and edit standalone and project reminders](https://github.com/arlecchinoOPSource/Swish/issues/9) — depends on #7, #8
- [S-10 / #10: Persist completion and display project progress](https://github.com/arlecchinoOPSource/Swish/issues/10) — depends on #9
- [S-11 / #11: Implement safe reminder and project deletion](https://github.com/arlecchinoOPSource/Swish/issues/11) — depends on #9, #10
- [S-12 / #12: Search project names and reminder content](https://github.com/arlecchinoOPSource/Swish/issues/12) — depends on #9
- [S-13 / #13: Protect autosave, date handling, and recovery](https://github.com/arlecchinoOPSource/Swish/issues/13) — depends on #8, #9, #10, #11, #12

## S3 — v1.0.0 desktop release readiness

Backup, accessibility/reliability regressions, and verified macOS/Windows installers.

- [S-14 / #14: Add validated local backup and restore](https://github.com/arlecchinoOPSource/Swish/issues/14) — depends on #13
- [S-15 / #15: Run accessibility, UI, and native reliability regressions](https://github.com/arlecchinoOPSource/Swish/issues/15) — depends on #13, #14
- [S-16 / #16: Package and verify Swish 1.0.0 for macOS and Windows](https://github.com/arlecchinoOPSource/Swish/issues/16) — depends on #15

## S4 — v2.0.0 iOS

Real iPhone port, touch UI, native behavior, and verified distribution.

- [S-17 / #17: Bootstrap iOS target and prove on-device startup](https://github.com/arlecchinoOPSource/Swish/issues/17) — depends on #16
- [S-18 / #18: Adapt Swish layout, input, and accessibility for iPhone](https://github.com/arlecchinoOPSource/Swish/issues/18) — depends on #17
- [S-19 / #19: Implement iOS lifecycle, local notifications, and storage checks](https://github.com/arlecchinoOPSource/Swish/issues/19) — depends on #17, #18
- [S-20 / #20: Verify and distribute Swish 2.0.0 for iPhone](https://github.com/arlecchinoOPSource/Swish/issues/20) — depends on #19
