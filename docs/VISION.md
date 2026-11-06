# Swish vision

Swish is a focused, local-first project and reminder app in the Arlecchino family. Its interface should feel like Terminal's blue mode, with Ember's satisfying large completion controls. The product should be immediately recognizable before its reminder engine is built.

## v1.0.0: desktop

Top priority: correct UI, sounds, animations, and Swish wordmark. Then implement projects and regular reminders. A project provides a larger context and its own deadline; reminders have a title/header, text, optional due date, and a completion state. A reminder can belong to a project or stand alone. Show projects and a distinct Regular Reminders section in one scrollable canvas.

Support create/edit, persistent completion, safe deletion, search, local saving, and understandable errors. Completing is not deleting. A project deadline and each reminder's due date are independent. Baseline targets are macOS and Windows; actual installers require verification on each.

## v2.0.0: iOS

Port the established experience to iPhone. Adapt navigation and panels for touch, safe areas, keyboard, and lifecycle; verify storage and behavior on a real device. Notifications, haptics, and distribution have explicit implementation and verification tasks. They are not assumed to work because the desktop app builds.

## Outside v1

No calendar product, boards, analytics, priority engine, meditation utility, PDF tools, audio player, accounts, or cloud sync. Due dates do not promise background alarms. Later utility concepts remain future ideas rather than v1 obligations.
