# WorkRally parity baseline for AIYOU

Date: 2026-08-31

This is an implementation baseline, not a claim that two products are identical. It separates
what was observed in the running WorkRally 0.7.12 application from what AIYOU must implement on
top of the Codex App Server.

## Observed interaction contract

- A Skill is selectable from the task composer. It is not only an entry in a settings inventory.
- A selected Skill becomes part of the current task input, while the conversation remains visible.
- Skill and tool execution appear in the Turn timeline with running, completed or failed state.
- Commands, tool calls, file changes and grouped execution details share that same timeline.
- Task and project association survives navigation. The right panel can show an App, file or result
  without replacing the task conversation.
- The capability area distinguishes plugins, Skills, MCP and Apps instead of presenting one flat
  feature count.
- Media/canvas work has its own asynchronous lifecycle; a node or loading state is not treated as a
  finished result.

## AIYOU runtime mapping

| WorkRally behavior | Codex-native AIYOU implementation | Acceptance evidence |
|---|---|---|
| Skill selection in composer | `turn/start.input[]` item `{type: "skill", name, path}` | persisted user Turn contains the Skill item |
| Skill discovery | `skills/list` by cwd, retaining scope, metadata and discovery errors | searchable grouped catalog and visible error count |
| Skill enable/disable | `skills/config/write` using the exact Skill path | refreshed list reports `effectiveEnabled` |
| Runtime invalidation | listen for `skills/changed`, then re-run the current `skills/list` | UI refreshes without an app restart |
| Skill invocation state | render the persisted Skill input against authoritative Turn state | selected/running/completed/failed is not inferred from a toast |
| Tool execution | existing Codex Item events and function-call round trips | arguments, status, result/error in timeline |
| Plugin-provided Skills | enabled plugin roots via `skills/extraRoots/set` plus source/path metadata | plugin and Skill remain visibly associated |
| Right-side work surface | non-destructive task inspector/App/result panel | conversation and current Thread remain mounted |

## Product boundary

AIYOU should copy the lifecycle contract, not WorkRally branding or private implementation. The
Codex App Server remains the source of truth for Thread, Turn, Skill metadata, tools and approvals.
Provider adapters only translate model wire protocols. They must not create a second text-chat
state or a second Skill registry.

Large Skill collections are loaded by metadata and selected on demand. AIYOU does not inject every
Skill body into model context. A Skill is read by the Agent Runtime only after trigger matching or a
typed explicit selection.

## Non-acceptance conditions

- Showing a count or the first N Skill names is not Skills support.
- Adding `$skill` text without a native Skill input item is not explicit task activation.
- Saying a menu item is open without a visible panel is not navigation.
- A platform directory check is not proof that every billable model transport is healthy.
- A selected Skill is not marked completed until the authoritative Turn reaches a terminal state.
