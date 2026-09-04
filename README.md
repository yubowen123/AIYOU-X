# AIYOU

AIYOU 是一个面向本地工作区的桌面 Agent 系统。它使用 Codex `app-server`
作为本地 Harness，并把官方原生、官方云、聚合平台和 OpenAI 兼容模型放进同一个
LLM / Image / Audio / Video 工作台。

当前交付为 macOS Apple Silicon 安装包；Windows NSIS 构建配置已提供，但尚未
在 Windows 主机上生成和验收。

## 已实现

- Codex 风格三栏工作台：任务、对话/编辑区、上下文与运行面板。
- Codex 左侧项目导航：快捷模块、项目/最近/中断筛选、真实工作区标签和线程任务卡。
- 统一 Agent Runtime：Codex 默认模型与第三方流式 LLM 都经由同一个 Codex App Server；
  不存在绕过 Thread/Turn 的“直接文本聊天”旁路。
- SQLite-backed 持久化 Task/Thread/Turn：真实 Thread/Turn ID、恢复、停止、重试、置顶、
  归档/恢复和跨重启历史读取。
- 实时时间线：推理摘要、Agent 正文、命令输出、工具调用、审批请求/结果、文件变更、
  执行计划、错误和阶段状态统一进入 Item 流。
- 本地工作区、附件、任务搜索和项目筛选均接入真实生命周期。
- 菜单插件：内置入口可开关，兼容声明式 JSON，并可安装含
  `.codex-plugin/plugin.json` 的本地插件目录；插件 Skills 通过 App Server extra roots 加载。
- 原生 Skills 生命周期：按工作区发现与分组、搜索/来源筛选、加载错误、启停、任务内多选，
  并以 `{type: "skill", name, path}` 进入 Turn；调用状态随权威 Turn 在时间线更新。
- AI Task MCP 文档 v3.3 的 76 个公开模型：31 视频、19 图片、12 文本/多模态、
  5 音频、9 视频增强/处理；另含 8 个视频模型路由 ID。
- 30 个模型平台配置：26 个官方/官方云、3 个聚合平台、1 个自定义兼容端点；
  123 个内置模型种子，并可从官方只读模型目录动态同步。
- 异步生成 Task 持久化、恢复轮询、状态查询、本地取消、结果链接；支持图片、音频、
  视频、处理模型路由。生成模型不会出现在 LLM 对话选择器中。
- 本地 Responses-compatible Gateway 将 OpenAI Chat Completions、Responses、Anthropic
  Messages 与 Gemini SSE 适配进同一个 Codex Agent Runtime，并保留函数工具调用。
- 每个平台的凭证仅通过设置页录入，并使用 Electron `safeStorage` 分平台加密后写入
  用户数据目录；渲染进程只能看到字段是否已配置，不能读取明文。
- macOS arm64 包内附 Codex CLI 0.144.1，因此从 Finder 启动时无需依赖 shell PATH。

## 安装与使用

1. 打开 `AIYOU-0.3.2-arm64.dmg`，将 AIYOU 拖到 Applications。
2. 启动 AIYOU，点击左下角“设置”。
3. 在“模型平台”按 LLM、图片、音频或视频筛选，选择官方平台并填写该平台凭证，
   然后点击“保存并验证”。AI Task MCP 仍作为一次覆盖多模型的聚合选项保留。
4. 选择本地工作区。默认使用设置中唯一的默认 LLM；切换到第三方 LLM 后，消息仍进入
   同一套 Agent 工具、审批与持久化时间线。
5. 图片、音频、视频和媒体处理任务在独立生成工作台确认后才会提交。提交可能产生平台
   费用；AIYOU 会保存并轮询已提交的异步任务，但不会自动重新提交失败任务。

本地验收包使用 ad-hoc 签名，尚未使用 Apple Developer ID 公证。若另一台 Mac
首次启动时出现来源提示，请在 Finder 中右键 AIYOU 后选择“打开”。面向公众分发前
仍应补做 Developer ID 签名与 notarization。

本地 Codex Agent 仍使用当前用户已有的 Codex 登录与配置；各模型平台凭证只用于
对应 Provider 的官方接口。

## 开发

```bash
npm install
npm run dev
```

验证与构建：

```bash
npm run verify
npm run capture
npm run capture:settings
npm run capture:models
npm run capture:skills
npm run dist:mac
```

macOS 安装包构建前，需要将与目标架构匹配的 Codex CLI 可执行文件放到
`vendor/codex-darwin-arm64/codex`。该本地二进制不进入 Git 仓库；开发模式会优先使用
当前系统 `PATH` 中已安装的 Codex CLI。

如果 Electron 下载在网络环境中超时，可临时设置可信镜像后重新安装依赖；不要把
任何 Key 写入 `.env`、源码、测试、日志或安装包。

## 关键文件

- `src/main/codexBridge.ts`：Codex app-server JSONL 桥接。
- `src/main/responsesGateway.ts`：第三方 LLM 到 Codex Responses 线协议的本地网关。
- `src/main/generationTaskStore.ts`：异步生成 Task 持久化与状态机。
- `src/main/aiTaskClient.ts`：平台鉴权和 HTTP 客户端。
- `src/main/providerClient.ts`：原生 Provider 鉴权、目录同步与请求适配。
- `src/shared/providerCatalog.ts`：Provider、凭证字段和模型种子注册表。
- `src/shared/modelCatalog.ts`：文档版本化模型目录。
- `src/shared/requestRouter.ts`：模型协议、提交和状态路由。
- `src/main/settingsStore.ts`：设置、插件与系统加密密钥存储。
- `docs/MODEL_COVERAGE.md`：全量模型覆盖。
- `docs/PROVIDER_COVERAGE.md`：官方/云/聚合平台覆盖与实现等级。
- `docs/PLUGIN_MANIFEST.md`：菜单插件清单协议。
- `docs/ARCHITECTURE.md`：架构和信任边界。
- `docs/VERIFICATION.md`：本次构建验收记录。

AIYOU 是独立产品，不是 OpenAI 官方应用。随 macOS 包分发的 Codex 运行时及其许可
信息见 `THIRD_PARTY_NOTICES.md`。
