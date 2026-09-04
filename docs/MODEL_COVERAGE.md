# AI Task MCP model coverage

Source boundary: [AI Task MCP docs v3.3](https://ai-mcp.wuread.cn/docs.html#models), captured
2026-08-28. The authoritative executable catalog is `src/shared/modelCatalog.ts`.

| Category | Count | Protocol |
|---|---:|---|
| Video generation/editing | 31 | asynchronous HTTP; 8 IDs also support model routing |
| Image generation/editing | 19 | asynchronous HTTP |
| Text / multimodal | 12 | legacy async, Chat Completions, or Responses |
| Audio / voice | 5 | asynchronous TTS and voice clone |
| Video enhancement / processing | 9 | asynchronous HTTP |
| **Total public model IDs** | **76** | |

## Video — 31

`seedance`, `seedance-fast`, `seedance-2.0-mini`, `seedance-2.5`,
`yunduan-seedance-2.0`, `pake-seedance-2.0`, `pake-seedance-2.0-fast`,
`pake-seedance-2.0-mini`, `pake-seedance-2.5`, `wan3.0`, `wan3.0-prime`,
`dreamina`, `dreamina-fast`, `dreamina-mini`, `MiniMax-H3`,
`MiniMax-H3-Overseas`, `dreamina-2.5`, `nova-video-2.0`,
`nova-video-2.0-fast`, `nova-video-2.0-mini`, `vidu`, `vidu-q3`, `kling`,
`kling-o3`, `hh1.1-t2v`, `hh1.1-i2v`, `hh1.1-r2v`, `hh1-t2v`, `hh1-i2v`,
`hh1-r2v`, `hh1-video-edit`.

Video route IDs: `seedance-2.0`, `seedance-2.0-fast`, `seedance-2.0-mini`,
`seedance-2.5`, `dreamina-2.0`, `dreamina-2.0-fast`, `dreamina-2.0-mini`,
`dreamina-2.5`.

## Image — 19

`seedream-4.5`, `seedream-5-lite`, `dola-seedream-5-lite`, `seedream-5-pro`,
`dola-seedream-5-pro`, `dola-seedream-4.0`, `jimeng-4.0`, `ali-mj-v7`,
`ali-mj-niji7`, `ali-mj-v8.1`, `ali-mj-v8.2-preview`, `ali-mj-v8.2`,
`canvas-20`, `g3.1-flash-image-preview`, `g3-pro-image-preview`, `gpt-image-2`,
`gpt-image-2-high`, `vidu/vidu-image_reference2image`,
`vidu/vidu-image-pro_reference2image`.

## Text / multimodal — 12

`doubao-seed-2.0`, `doubao-seed-2.0-lite`, `gemini-3.0-flash-preview`,
`gemini-3.1-pro-preview`, `openai/gpt-5.4`, `openai/gpt-5.5`,
`openai/gpt-5.5-cache`, `tokenlab/gpt-5.5`, `qwen3.6-plus`, `qwen3.7-plus`,
`deepseek-v4-pro`, `deepseek-v4-flash`.

## Audio — 5

`bd-voice-clone-tts`, `seed-tts-2.0`, `seed-icl-2.0`,
`MiniMax/speech-2.8-hd`, `MiniMax/speech-2.8-turbo`.

## Video enhancement / processing — 9

`vod-enhance`, `aliyun-video-super-resolution`, `volcengine-video-enhance-llm`,
`volcengine-video-enhance-standard`, `volcengine-video-enhance-professional`,
`video-detext`, `ark-subtitle-erase`, `mediakit-subtitle-erase-pro`,
`mediakit-subtitle-erase-standard`.

## Verification boundary

Automated tests assert the total, category counts, unique IDs, protocol presence, status routes and
eight route IDs. This build deliberately did not perform a paid generation call; live availability,
quota, price and output quality depend on the configured platform account at call time.
