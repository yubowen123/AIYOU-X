import {
  Bot,
  Check,
  ChevronRight,
  Circle,
  FileCode2,
  Image as ImageIcon,
  Library,
  Network,
  RefreshCw,
  Search,
  Sparkles,
  TerminalSquare,
  Users,
  Wrench,
} from "lucide-react";
import { Fragment } from "react";
import type { CodexItem, CodexThread, CodexTurn } from "../../shared/types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join("\n");
  const item = record(value);
  return typeof item.text === "string" ? item.text : typeof item.content === "string" ? item.content : "";
}

function UserContent({ content }: { content: unknown }) {
  if (!Array.isArray(content)) return null;
  return <>{content.map((item, index) => {
    const value = record(item);
    if (value.type === "text") return <span className="user-content-text" key={index}>{String(value.text ?? "")}</span>;
    if (value.type === "localImage") return <span className="user-content-attachment" key={index}>📎 {String(value.path ?? "本地图片")}</span>;
    if (value.type === "image") return <span className="user-content-attachment" key={index}>🖼 {String(value.url ?? "图片")}</span>;
    if (value.type === "skill") return <span className="user-content-skill" key={index}><Library size={12} />{String(value.displayName ?? value.name ?? "Skill")}</span>;
    if (value.type === "mention") return <span className="user-content-skill mention" key={index}>@{String(value.name ?? "mention")}</span>;
    return null;
  })}</>;
}

function SkillLifecycle({ item, status, active }: { item: CodexItem; status: string; active: boolean }) {
  if (!Array.isArray(item.content)) return null;
  const skills = item.content.flatMap((part) => {
    const value = record(part);
    return value.type === "skill" ? [value] : [];
  });
  if (!skills.length) return null;
  const lifecycleStatus = active ? "inProgress" : status;
  return <>{skills.map((skill, index) => <div className="timeline-card tool skill-call skill-lifecycle" key={`${String(skill.path ?? skill.name)}-${index}`}>
    <Library size={14} />
    <span><strong>调用技能 · {String(skill.displayName ?? skill.name ?? "Skill")}</strong><small>Codex 原生 Skill 输入</small></span>
    <code>{statusLabel(lifecycleStatus)}</code>
  </div>)}</>;
}

function statusLabel(status: unknown) {
  const value = String(status ?? "");
  if (/in.?progress|running|started/i.test(value)) return "执行中";
  if (/complete|success/i.test(value)) return "已完成";
  if (/interrupt|cancel|aborted/i.test(value)) return "已中断";
  if (/fail|error/i.test(value)) return "失败";
  return value || "已记录";
}

function json(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function Item({ item, active }: { item: CodexItem; active: boolean }) {
  if (item.type === "userMessage") {
    return <div className="message-row user"><div className="message-bubble"><UserContent content={item.content} /></div></div>;
  }
  if (item.type === "agentMessage") {
    return <div className="message-row agent"><div className="agent-avatar">AI</div><div className="agent-copy assistant-answer">{String(item.text ?? "")}{active && <span className="typing-caret" />}</div></div>;
  }
  if (item.type === "reasoning") {
    const summary = textValue(item.summary) || textValue(item.content) || "模型正在推理，尚未返回可展示的摘要。";
    return <details className="timeline-card reasoning" open={active}><summary><Sparkles size={13} />思考摘要 <code>{active ? "实时" : "已记录"}</code></summary><p>{summary}</p></details>;
  }
  if (item.type === "commandExecution") {
    return (
      <details className="timeline-card command" open={active || item.status === "inProgress"}>
        <summary><TerminalSquare size={14} /><span>{String(item.command ?? "终端命令")}</span><code>{statusLabel(item.status)}</code><ChevronRight size={13} /></summary>
        {Boolean(item.cwd) && <small className="timeline-meta">{String(item.cwd)}</small>}
        {typeof item.aggregatedOutput === "string" && item.aggregatedOutput && <pre>{item.aggregatedOutput}</pre>}
        {item.exitCode !== undefined && <div className="timeline-result">退出码 <code>{String(item.exitCode)}</code></div>}
      </details>
    );
  }
  if (item.type === "fileChange") {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    return <details className="timeline-card file" open={active}>
      <summary><FileCode2 size={14} /><span>文件变更 · {changes.length} 项</span><code>{statusLabel(item.status)}</code><ChevronRight size={13} /></summary>
      <div className="file-change-list">{changes.map((change, index) => {
        const value = record(change);
        return <div key={`${String(value.path ?? "file")}-${index}`}><strong>{String(value.path ?? "未命名文件")}</strong><small>{String(value.kind ?? value.type ?? "changed")}</small>{typeof value.diff === "string" && <pre>{value.diff}</pre>}</div>;
      })}</div>
    </details>;
  }
  if (item.type === "diff") {
    return <details className="timeline-card file"><summary><FileCode2 size={14} /><span>本轮文件差异</span><code>实时</code><ChevronRight size={13} /></summary><pre>{String(item.diff ?? "")}</pre></details>;
  }
  if (item.type === "mcpToolCall" || item.type === "dynamicToolCall") {
    const tool = String(item.tool ?? item.name ?? item.server ?? "工具调用");
    const skillLabels: Record<string, string> = {
      use_skill: "调用技能",
      search_skills: "搜索技能",
      find_market_skills: "查找技能市场",
      install_skill: "安装技能",
    };
    const normalized = tool.toLowerCase().replace(/[.\/-]/g, "_");
    const skillCall = Boolean(skillLabels[normalized] || /skill/i.test(tool));
    const label = skillLabels[normalized] ?? tool;
    return <details className={`timeline-card tool${skillCall ? " skill-call" : ""}`} open={active || item.status === "inProgress"}>
      <summary>{skillCall ? <Library size={14} /> : <Wrench size={14} />}<span>{label}</span><code>{statusLabel(item.status)}</code><ChevronRight size={13} /></summary>
      {Boolean(item.arguments || item.input) && <pre>{json(item.arguments ?? item.input)}</pre>}
      {Boolean(item.result || item.output) && <pre>{json(item.result ?? item.output)}</pre>}
      {Boolean(item.error) && <div className="timeline-error">{textValue(item.error) || json(item.error)}</div>}
    </details>;
  }
  if (item.type === "collabAgentToolCall") {
    return <details className="timeline-card tool" open={active}><summary><Users size={14} /><span>{String(item.tool ?? "协作 Agent")}</span><code>{statusLabel(item.status)}</code><ChevronRight size={13} /></summary><pre>{json(item)}</pre></details>;
  }
  if (item.type === "webSearch") {
    return <div className="timeline-card tool"><Search size={14} /><span>网络搜索 · {String(item.query ?? item.searchQuery ?? "")}</span><code>{statusLabel(item.status)}</code></div>;
  }
  if (item.type === "imageGeneration") {
    return <details className="timeline-card tool"><summary><ImageIcon size={14} /><span>图片生成</span><code>{statusLabel(item.status)}</code><ChevronRight size={13} /></summary><pre>{json(item.result ?? item)}</pre></details>;
  }
  if (item.type === "plan") {
    return <div className="timeline-card plan"><Check size={14} /><pre>{String(item.text ?? "计划已更新")}</pre></div>;
  }
  if (item.type === "approval") {
    return <details className="timeline-card tool" open={item.status === "awaiting"}><summary><Circle size={13} /><span>等待审批 · {String(item.method ?? "Agent 请求")}</span><code>{String(item.status ?? "awaiting")}</code><ChevronRight size={13} /></summary>{Boolean(item.details) && <pre>{json(item.details)}</pre>}</details>;
  }
  if (item.type === "error") {
    return <div className="timeline-card timeline-error" role="alert"><Circle size={13} /><span>{String(item.message ?? "Agent 执行失败")}</span></div>;
  }
  if (/context|compaction/i.test(item.type)) {
    return <div className="timeline-card tool"><Network size={14} /><span>{item.type === "contextCompaction" ? "上下文已压缩" : item.type}</span><code>{statusLabel(item.status)}</code></div>;
  }
  return <details className="timeline-card tool"><summary><Bot size={14} /><span>{item.type}</span><code>{statusLabel(item.status)}</code><ChevronRight size={13} /></summary><pre>{json(item)}</pre></details>;
}

function isRunningStatus(status: string) {
  return /in.?progress|running|started/i.test(status);
}

function TurnBlock({ turn, activeTurnId, onRetry }: { turn: CodexTurn; activeTurnId?: string; onRetry: (turnId: string) => void }) {
  const active = activeTurnId === turn.id || isRunningStatus(turn.status);
  const retryable = /interrupt|cancel|aborted|fail|error/i.test(String(turn.status)) || Boolean(turn.error);
  return <section className={`turn-block ${active ? "active" : ""}`} aria-label={`Turn ${turn.id}`}>
    <header className="turn-header"><span className={`progress-dot ${active ? "streaming" : retryable ? "error" : "complete"}`} /><strong>{statusLabel(turn.status)}</strong><code title={turn.id}>{turn.id}</code>{active && <span className="turn-live">实时</span>}</header>
    {(turn.items ?? []).map((item, index) => <Fragment key={item.id ?? `${item.type}-${index}`}><Item item={item} active={active} />{item.type === "userMessage" && <SkillLifecycle item={item} status={turn.status} active={active} />}</Fragment>)}
    {Boolean(turn.error) && <div className="timeline-card timeline-error" role="alert">{textValue(turn.error) || json(turn.error)}</div>}
    {retryable && <button className="retry-button" onClick={() => onRetry(turn.id)}><RefreshCw size={12} />用相同输入重试</button>}
  </section>;
}

export function ThreadContent({
  thread,
  activeTurnId,
  onRetry,
  onStarter,
}: {
  thread: CodexThread | null;
  activeTurnId?: string;
  onRetry: (turnId: string) => void;
  onStarter: (value: string) => void;
}) {
  const turns = thread?.turns ?? [];
  const hasItems = turns.some((turn) => turn.items?.length);
  if (!thread || !hasItems) {
    return (
      <div className="empty-conversation">
        <div className="empty-orbit"><span /><i /><b /></div>
        <h1>和 AIYOU 一起构建</h1>
        <p>选择工作区，描述目标。无论使用 Codex 还是第三方 LLM，任务都进入同一套 Agent Runtime、工具与持久化时间线。</p>
        <div className="starter-grid">
          {["分析这个项目并给出下一步", "修复当前测试失败", "检查文件改动并准备验收", "列出可用 Skills、MCP 与 Apps"].map((value) => <button key={value} onClick={() => onStarter(value)}>{value}</button>)}
        </div>
      </div>
    );
  }
  return <div className="thread-content" aria-live="polite" aria-relevant="additions text">{turns.map((turn) => <TurnBlock key={turn.id} turn={turn} activeTurnId={activeTurnId} onRetry={onRetry} />)}</div>;
}
