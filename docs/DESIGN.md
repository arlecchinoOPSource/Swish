# UI and interaction specification

## Identity and shared frame

Terminal's blue mode is the starting point. Use Core tokens, its frame, header position, wordmark treatment, rail dimensions, transitions, and bottom save-status style. Replace the header text with **Swish** in the same location and blue color. The conceptual S> mark is not a substitute for the requested wordmark. A small s> rail mark is provisional; final external icon design is S-03.

Remove the entire typesetting toolbar. Put font, size, and relevant text presentation preferences in Settings. Do not recreate the journal editor or leave an empty toolbar row. Use locally bundled fonts and shared theme settings. Preserve readable plain task content without decorative overlays.

## Left rail

1. Search: find project names, reminder headers, and text.
2. Plug/Add: create a project or reminder; accessible name and tooltip “Create Project / Reminder”. The owner wrote “Plug sign”; use a plug glyph as the provisional interpretation and retain the create action regardless of final glyph review.
3. Themes: shared theme selector, blue by default.
4. Sounds: shared mute, volume, and playback preferences.
5. Settings: anchored at the bottom; includes typography and motion.

No archives or typesetting buttons. Every icon action needs keyboard focus, a label, and a visible open state. Popovers/dialogs close predictably and return focus.

## Canvas and cards

Projects appear above a separate Regular Reminders section. Each project is a large framed panel with header/name and independent deadline, optional text, and its own reminder collection. Projects and long reminder collections must be scrollable without trapping the pointer or keyboard. Long content wraps; no clipped dates or overlapping controls.

Each reminder has a header and text, due date when supplied, and a large square completion control on the right matching Ember. Completed state remains visible and stored. Provide a red Delete Reminder button below every reminder, plus a red Delete Project button below every project. The sketch omits some repeated delete controls; the owner's explicit text requires both.

Project deletion requires confirmation naming the project and affected reminder count; choose cascade deletion as the initial policy and use one transaction. Reminder deletion gets a reversible undo window before final removal, or explicit confirmation until undo exists. Do not silently orphan reminders. These safety policies are implementation defaults, not verbatim owner requirements.

Empty, loading, saving, saved, and failure states are real UI states. Never show Saved when data has not reached storage. Overdue state includes a text cue, not only red. Search results preserve project context and allow returning to the matching item.

## Sensory gate

Compare the shell against Terminal blue and the completion control against Ember. Verify startup/logo, hover/press, panel transitions, theme changes, completion feedback, and mute/volume behavior. Shared sounds must come through Core, with licensed asset provenance. Support reduced motion and nonblocking startup. The main UI stays usable if audio fails.

The Main chat reference images are stored in `docs/references/`. They are design evidence, not a finished pixel-perfect implementation. The scaffold is deliberately identified as a preview; final visual acceptance belongs to milestone 1.
