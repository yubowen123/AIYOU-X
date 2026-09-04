# AIYOU Provider coverage

Snapshot: 2026-08-30
Registry: `src/shared/providerCatalog.ts`

AIYOU 0.3.2 contains 30 provider definitions and 123 built-in model seeds. It keeps the 76-model
AI Task MCP catalog and adds first-party credential schemas, authentication headers, endpoints and
model IDs for official platforms. After a key is configured, providers with a read-only model API
can replace their seed list with the account's live official catalog.

`Native` means AIYOU can build authentication and dispatch the documented HTTP request. `Config`
means the provider requires a vendor signing protocol or deployment-specific setup; AIYOU stores the
right fields securely but does not claim that an unsigned connection test succeeded.

| Provider | Type | LLM | Image | Audio | Video | Level |
|---|---|:---:|:---:|:---:|:---:|---|
| AI Task MCP | Aggregator | ✓ | ✓ | ✓ | ✓ | Native |
| OpenAI | Official | ✓ | ✓ | ✓ | ✓ | Native |
| Anthropic Claude | Official | ✓ |  |  |  | Native |
| Google Gemini | Official | ✓ | ✓ | ✓ | ✓ | Native |
| xAI | Official | ✓ |  |  |  | Native |
| DeepSeek | Official | ✓ |  |  |  | Native |
| Mistral AI | Official | ✓ |  | ✓ |  | Native |
| Cohere | Official | ✓ |  |  |  | Native |
| Moonshot AI | Official | ✓ |  |  |  | Native |
| 智谱 BigModel | Official | ✓ | ✓ |  | ✓ | Native |
| MiniMax | Official | ✓ | ✓ | ✓ | ✓ | Native |
| 阿里云百炼 | Official cloud | ✓ | ✓ | ✓ | ✓ | Native |
| 火山方舟 | Official cloud | ✓ | ✓ | ✓ | ✓ | Native |
| 腾讯混元 | Official cloud | ✓ | ✓ |  | ✓ | Config (TC3 signing) |
| 百度千帆 | Official cloud | ✓ | ✓ |  |  | Config (AK/SK) |
| Azure AI Foundry | Official cloud | ✓ | ✓ | ✓ | ✓ | Config (resource/deployment) |
| Amazon Bedrock | Official cloud | ✓ | ✓ | ✓ | ✓ | Config (SigV4) |
| Stability AI | Official |  | ✓ | ✓ |  | Native |
| ElevenLabs | Official |  |  | ✓ |  | Native |
| Deepgram | Official |  |  | ✓ |  | Native |
| Runway | Official |  | ✓ |  | ✓ | Native |
| Luma AI | Official |  | ✓ |  | ✓ | Native |
| 可灵 Kling AI | Official |  | ✓ |  | ✓ | Config (AK/SK JWT) |
| Vidu | Official |  | ✓ |  | ✓ | Native |
| Black Forest Labs | Official |  | ✓ |  |  | Native |
| Recraft | Official |  | ✓ |  |  | Native |
| GroqCloud | Official cloud | ✓ |  |  |  | Native |
| OpenRouter | Aggregator | ✓ |  |  |  | Native |
| SiliconFlow | Aggregator | ✓ | ✓ | ✓ | ✓ | Native |
| Custom OpenAI-compatible | Compatible | ✓ |  |  |  | Native |

Coverage by modality is provider-level, not a promise that every model supports every operation.
The settings UI links each entry to its vendor documentation and reports live model counts only
when the vendor's read-only endpoint returns successfully.

Streaming LLMs using Responses, Chat Completions, Anthropic Messages or Gemini Generate enter the
same Codex Agent Runtime through AIYOU's loopback Responses gateway. Other models are intentionally
excluded from the conversation picker and routed through persistent generation Tasks. Dynamically
synced models inherit their provider's native protocol and endpoint family; custom OpenAI-compatible
model IDs can be entered as a comma/newline list when `/v1/models` is unavailable.

## Security boundary

- Every provider has its own encrypted credential record under Electron user data.
- `safeStorage` is mandatory for secret fields; there is no plaintext fallback.
- The renderer receives only field-level configured flags, never decrypted values.
- Existing `ai-task-key.json` ciphertext is copied into the versioned provider vault on first use.
- Connection tests use model/user metadata endpoints where available and never submit generation.
- Credentials for signing-only providers are stored but not sent until their native signer exists.
