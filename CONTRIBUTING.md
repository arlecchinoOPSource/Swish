# Contributing

Read AGENTS.md, the product/design/architecture documents, and the assigned issue. Work on a focused branch; reference the issue in the PR. Keep shared UI changes in Core and app behavior in Swish. Do not bundle unrelated refactors.

Use synthetic fixtures. Run the documented checks; record exactly what passed and what remains unverified. Visual changes need comparison screenshots; audio changes need playback and mute checks; persistence needs native storage and restart tests. A browser build is not a native release test.

An issue is complete only when its acceptance criteria are met. Track remaining work explicitly. Never mark the whole roadmap complete because scaffolding builds. Do not publish installers, migrate existing apps, or change visibility without a task authorizing those actions.
