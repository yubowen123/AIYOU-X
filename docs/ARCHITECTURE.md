# AIYOU architecture

## Process boundary

```text
React renderer
  | typed IPC exposed by context-isolated preload
Electron main
  |-- SettingsStore / ProviderStore -> userData JSON + system safeStorage
  |-- PluginStore -> validated menu manifests + local Codex plugin bundles
  |-- GenerationTaskStore -> persistent async generation lifecycle
  |-- CodexBridge -> bundled codex app-server over JSONL stdio
  |       `-- modelProvider=aiyou -> loopback Responses Gateway
  |                                   `-- ProviderClient protocol adapters
  |-- AiTaskClient -> HTTPS AI Task MCP API
  `-- ProviderClient -> official/provider-native HTTPS APIs
```

The renderer has no Node integration and never receives the platform Key. External links are
restricted to HTTP/HTTPS and opened by the operating system. Workspace operations remain under
the approval policy and sandbox selected for each Codex thread.

## Codex harness contract

AIYOU initializes one local app-server for every conversation model. Third-party LLMs are not
called by the renderer: Codex calls a loopback-only `/v1/responses` gateway using
`modelProvider=aiyou`, while App Server continues to own Thread, Turn, Item, tools, approvals and
persistence. The gateway translates only the upstream model wire protocol.

The runtime uses the public thread/turn protocol:

- `initialize` + `initialized`
- `thread/list`, `thread/read`, `thread/start`, `thread/resume`
- `thread/archive`, `thread/unarchive`, `thread/metadata/update`, `thread/name/set`
- `turn/start`, `turn/steer`, `turn/interrupt`
- server notifications for turn/item/diff/plan/token events
- server-initiated approval requests and request-ID based decisions
- `skills/list`, `skills/extraRoots/set`, `skills/config/write`, `skills/changed`
- typed Skill Turn input (`{type: "skill", name, path}`), `mcpServerStatus/list`, `app/list`

The local gateway supports native Responses passthrough and translates OpenAI-compatible Chat
Completions, Anthropic Messages and Gemini streaming responses into ordered Responses SSE events.
Text, explicit reasoning summaries, image input, function schemas, function calls and tool results
are preserved. Non-LLM image/audio/video models never enter the conversation selector; they remain
explicit generation tasks.

The Agent-facing protocol and provider transport are intentionally separate. Codex always talks to
the loopback Responses gateway. Each model selects a provider transport using its verified contract.
For example, AI Task MCP documents both protocols for `deepseek-v4-pro`, while AIYOU prefers Chat
Completions for Agent turns and translates the stream locally. This avoids depending on the failed
Responses-to-Bailian path without creating a second chat runtime or an automatic cross-protocol
retry that could duplicate a billable request.

The bundled macOS runtime is pinned to Codex CLI 0.144.1. An absolute custom Codex command can
be configured for development or a different runtime.

## AI Task MCP contract

| Capability | Submit | Status / response |
|---|---|---|
| Video | `/api/v1/video/generate` | `/api/v1/video/status/{taskId}` |
| Video route | `/api/v1/model-route/video/generate` | `/api/v1/model-route/video/status/{taskId}` |
| Image | `/api/v1/image/generate` | `/api/v1/image/status/{taskId}` |
| Legacy LLM | `/api/v1/llm/generate` | `/api/v1/llm/status/{taskId}` |
| Chat models | `/v1/chat/completions` | synchronous or SSE response |
| Agent-capable LLM transport | model-specific `/v1/chat/completions` or `/v1/responses` | SSE adapted into the local Responses runtime |
| Voice clone | `/api/v1/audio/voice/clone` | `/api/v1/audio/voice/clone/status/{taskId}` |
| TTS | `/api/v1/audio/tts` | `/api/v1/audio/tts/status/{taskId}` |
| Enhance / erase | model-specific `/api/v1/video/...` | matching `{taskId}` endpoint |

The stable local catalog is sourced from the platform documentation. A live refresh augments
video metadata without deleting documented models if the platform metadata endpoint is
temporarily unavailable. Advanced JSON exposes model-specific fields while the main form covers
common prompt, media, duration, resolution, aspect, voice and processing fields.

## Provider and credential handling

1. Credentials are entered in a provider-specific form and sent over a one-way IPC save call.
2. Electron `safeStorage.encryptString` encrypts every secret field separately.
3. Ciphertext and non-secret profiles are stored separately with mode `0600`.
4. The renderer receives field-level booleans, not decrypted values.
5. `ProviderClient` applies Bearer, `x-api-key`, `x-goog-api-key`, Anthropic version headers, or
   the provider's declared native scheme. It never logs request headers.
6. SigV4/TC3/JWT providers are marked configuration-only until a native signer is present.
7. Saving is rejected if system encryption is unavailable. No plaintext fallback exists.

## Menu plugin boundary

`PluginStore` merges built-in commands, validated legacy JSON manifests and copied local Codex
plugin bundles. A bundle must contain `.codex-plugin/plugin.json`; paths are constrained to the
bundle root, installation is copied into user data, and uninstall moves the bundle to Trash.
Enabled standalone Skill roots are registered through `skills/extraRoots/set`. AIYOU intentionally
does not call the App Server `plugin/list/install/uninstall` methods because the official protocol
marks those methods under development for production clients. Installed bundles cannot request or
read decrypted provider credentials.

## Persistent generation lifecycle

Submitting media first creates a local UUID Task in `generation-tasks.json` (mode `0600`). Provider
Task IDs, normalized queued/running/completed/failed/canceled states, result metadata and result URLs
are stored for up to 500 recent tasks. Running remote tasks resume status polling after the desktop
app restarts. “Cancel local task” stops AIYOU tracking; it does not claim to cancel a provider job
unless that provider exposes a future cancel endpoint.
