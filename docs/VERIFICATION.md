# AIYOU verification record

Date: 2026-08-31
Host: macOS arm64
Product version: 0.3.2
Bundle identifier: `cn.aiyou.desktop`
Codex runtime: 0.144.1

## Executed checks

- `npm run verify` (`typecheck`, Vitest and production renderer/Electron build)
- `npm run smoke:runtime` against the bundled Codex app-server and a local mock Responses gateway
- Production dependency audit with `npm audit --omit=dev`
- Synthetic Skills drawer capture and direct image inspection
- Packaged macOS app launch and installed-app source/version readback
- Deep code-signature validation, DMG checksum validation, binary architecture and artifact SHA-256

Results:

- TypeScript: passed.
- Vitest: 12 files passed, 43 tests passed.
- Renderer + Electron production build: passed.
- Production dependency audit: 0 low / moderate / high / critical findings.
- Agent runtime smoke: the bundled Codex completed a third-party-provider Turn through the AIYOU
  gateway with 22 runtime tools. A temporary repo Skill was found by native `skills/list`, preserved
  in the authoritative `userMessage` Item, expanded into the model request, and completed normally.
- Negative runtime smoke: a local upstream `response.failed` event closed the real Codex Turn as
  `failed`; AIYOU treats it as terminal and retryable rather than leaving an infinite running state.
- DeepSeek v4 Pro: packaged catalog and installed `app.asar` both resolve to
  `/v1/chat/completions`; developer messages, tool schemas, `max_completion_tokens`, usage options,
  reasoning deltas, non-2xx errors and mid-stream SSE errors have contract tests.
- App bundle: ad-hoc signature is valid on disk and satisfies its designated requirement.
- App and bundled Codex binaries: Mach-O arm64.
- Bundled Codex: `codex-cli 0.144.1`; packaged binary SHA-256
  `a5ed165ddcd0c0e7e4bd7f0e0a2a1c266b8a3c013fda89db1a464b7ef4d9928f`.
- DMG: `hdiutil verify` reports a valid checksum.
- DMG: `AIYOU-0.3.2-arm64.dmg`, 211,267,628 bytes, SHA-256
  `d515623315c0624a944266e7be4dfa5d9e4d2ca69af2d612eb352d21288428f4`.
- ZIP: `AIYOU-0.3.2-arm64.zip`, 210,412,691 bytes, SHA-256
  `8d5aca509a9b6de36dbd1cda6a0e2b017b1c15ff7e59543a6d3e8fe0ed638179`.
- Selected logo: packaged `icon.icns` exactly matches the build source SHA-256
  `787d5bc388e8abf12b3fa30a6b0496df58b099fa0361715d8dc316e3c76c8f19`.
- Installed `/Applications/AIYOU.app`: version 0.3.2; bundled Renderer and Codex app-server launched.
  The previous 0.3.1 app was moved to Trash as a recoverable backup.

## Visual evidence

- `artifacts/ui-skills-runtime-v0.3.2.png`
- `artifacts/ui-main-v0.3.1.png`
- `artifacts/ui-streaming-v0.3.png`
- `artifacts/ui-defaults-v0.3.png`
- `artifacts/ui-settings-v0.3.png`
- `artifacts/ui-models-v0.3.png`
- `artifacts/ui-plugins-v0.3.png`

The 0.3.2 Skills capture verifies a visible non-modal right drawer, workspace grouping, source and
status filters, discovery errors, metadata/dependencies, enable/disable, reveal and “use in current
task”. Capture mode uses synthetic content and never renders configured credential values.

## Verified behavior

- Codex and third-party LLMs share the same Agent Runtime and persistent Thread/Turn/Item model.
- Start, stop, resume and retry are attached to real Thread and Turn identifiers.
- Reasoning, assistant deltas, commands, tools, approvals, file changes, plans, errors and Turn state
  enter one ordered timeline.
- Skills use native App Server discovery, invalidation, config and typed Turn input. Selection,
  running, completed and failed states are derived from the authoritative Turn, not a toast.
- Menu workspaces open as visible non-modal right drawers while the current conversation stays
  mounted.
- Projects, attachments, pinning, archiving, search, local plugin bundles and asynchronous generation
  tasks have explicit persisted state and lifecycle controls.
- Only LLM-capable models appear in the conversation model picker. Image, audio and video models are
  routed through generation tasks, with exactly one default allowed for each type.

## Intentional non-tests and boundaries

No paid live third-party request was submitted. Protocol translation, streaming, tools, typed Skill
input and failure closure are covered by unit tests plus the local app-server smoke. Each external
account remains an operator acceptance check after its credentials are entered.

The local package is ad-hoc signed and not notarized because no Apple Developer ID credentials were
supplied. Public distribution requires Developer ID signing and Apple notarization. The Windows NSIS
configuration is present but was not built or tested on this Mac.
