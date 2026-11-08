# Centered popups and canvas width

The November 7 UI follow-up builds on the merged Terminal parity work (Swish #27 and Core #16), retaining subsequent fixes on main.

The project canvas is centered with an 880px maximum width, shrinking to the available space on small windows. Search, Create, Themes, Sounds, and New Project use a centered native modal with a dim backdrop, inert background, contained keyboard focus, Escape/close dismissal, and focus restoration. Settings retains its anchored panel. Project edit forms retain their existing layout.

Shared modal behavior comes from Core suite-ui 0.5.1, pinned at `3a25f31`. Application forms and data remain in Swish. Update the submodule recursively before installing dependencies. No data migration is needed.

Visual examples are in `screenshots/modal-search.png`, `modal-new-project.png`, `modal-themes.png`, `modal-sounds.png`, and `narrower-canvas.png`, using synthetic browser-preview data. Browser checks do not establish native installer or SQLite behavior.

Validation: production build and 22 Core checks pass. All 136 functional Chromium/WebKit tests pass, including modal centering, keyboard containment, focus restoration, form recovery, and small-window layouts. Screenshots were inspected. The wider accessibility suite passed its WebKit audits, but the Chromium scanner timed out during analysis of the open search modal; full accessibility validation remains incomplete.

Startup pacing follow-up: Swish opts into a 2200ms minimum animated sequence plus the existing 220ms closing collapse. The frame opens over 660ms and the logo powers on over 1210ms. Reduced/off motion, startup disabled, initialization errors, and user skips do not wait for the branding sequence. Core keeps its immediate-ready default for other consumers. Ten startup browser checks and 23 Core checks pass; the production build passes.
