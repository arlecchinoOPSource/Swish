# Source decisions — November 6, 2026

Primary reference: Swish project “Main chat”, https://chatgpt.com/c/6aed68a2-8990-83ec-80ac-97d175ce814e . Requirements are distilled below; unrelated conversation material is not copied.

## Owner requirements

- v1: UI, sounds, animations, and logo first; reminders/to-do only initially.
- v2: first iOS port.
- Terminal blue as visual starting point; same header position and color, saying Swish.
- Rail: Search, Plug/Add, Themes, Sounds, Settings.
- Remove typesetting toolbar; presentation settings move into Settings.
- Projects provide larger context with deadlines; separate regular reminders.
- Reminder header and text; large Ember-style check widget; scrollable projects; red delete controls below each project and reminder.
- Avoid repeating the manual recreation of Terminal UI/audio/motion that happened for Ember.
- Current request: establish the framework repository first, then a separate Swish repository using it, with numbered issues, milestones, and vision/instructions.

## Adopted implementation defaults

Name the framework Arlecchino Core, following the Main chat proposal. Use a package workspace with a commit-pinned consumer in the separate Swish repository. Private repositories are a conservative setup default, not a claim that earlier apps are private. Shared shell comes from the existing Ember suite-ui extraction; verify against Terminal before declaring visual parity. Keep native data and permissions isolated. Use one reminder model with nullable projectId. Date-only deadlines, safe deletion, and no automatic updates to installed consumers are documented defaults.

## Proposals not promoted to mandatory v1 scope

Today/Upcoming views, priorities, collapsible projects, background alarms, additional utilities, sync, and a full-suite app monorepo were assistant suggestions. They do not override the owner's narrower design and explicit two-repository request. Backup/restore remains a scoped hardening task. iOS notifications are a v2 design/implementation task, not a promised existing capability.
