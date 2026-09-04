import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const temporaryWorkspace = await mkdtemp(join(tmpdir(), "aiyou-runtime-smoke-"));
const smokeSkillName = "aiyou-smoke-skill";
const smokeSkillMarker = "AIYOU_SKILL_RUNTIME_OK";
const smokeSkillPath = join(temporaryWorkspace, ".agents", "skills", smokeSkillName, "SKILL.md");
await mkdir(join(temporaryWorkspace, ".agents", "skills", smokeSkillName), { recursive: true });
await writeFile(smokeSkillPath, `---\nname: ${smokeSkillName}\ndescription: Verifies AIYOU native typed Skill execution.\n---\n\nWhen this Skill is selected, preserve the marker ${smokeSkillMarker} while completing the task.\n`, "utf8");
let requestBody;
let sequence = 0;
let responseCount = 0;

function responseObject(request, output, status = "completed", id = "resp_aiyou_smoke") {
  return {
    id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status,
    model: request.model,
    output,
    parallel_tool_calls: true,
    tool_choice: "auto",
    tools: request.tools ?? [],
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: {},
    usage: {
      input_tokens: 8,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 4,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 12,
    },
  };
}

function emit(target, event) {
  const payload = { ...event, sequence_number: sequence++ };
  target.write(`event: ${event.type}\n`);
  target.write(`data: ${JSON.stringify(payload)}\n\n`);
}

const gateway = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/responses") {
    response.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const responseId = `resp_aiyou_smoke_${++responseCount}`;
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  if (JSON.stringify(requestBody).includes("AIYOU_EXPECT_UPSTREAM_FAILURE")) {
    emit(response, { type: "response.created", response: responseObject(requestBody, [], "in_progress", responseId) });
    emit(response, {
      type: "response.failed",
      response: {
        ...responseObject(requestBody, [], "failed", responseId),
        error: { code: "upstream_error", message: "阿里云百炼上游连接失败", type: "server_error" },
      },
    });
    response.end();
    return;
  }
  const itemId = "msg_aiyou_smoke";
  const started = { id: itemId, type: "message", status: "in_progress", role: "assistant", content: [] };
  const part = { type: "output_text", text: "", annotations: [], logprobs: [] };
  emit(response, { type: "response.created", response: responseObject(requestBody, [], "in_progress", responseId) });
  emit(response, { type: "response.in_progress", response: responseObject(requestBody, [], "in_progress", responseId) });
  emit(response, { type: "response.output_item.added", output_index: 0, item: started });
  emit(response, { type: "response.content_part.added", item_id: itemId, output_index: 0, content_index: 0, part });
  emit(response, { type: "response.output_text.delta", item_id: itemId, output_index: 0, content_index: 0, delta: "AIYOU runtime ok", logprobs: [] });
  const finalPart = { ...part, text: "AIYOU runtime ok" };
  const finalItem = { ...started, status: "completed", content: [finalPart] };
  emit(response, { type: "response.output_text.done", item_id: itemId, output_index: 0, content_index: 0, text: "AIYOU runtime ok", logprobs: [] });
  emit(response, { type: "response.content_part.done", item_id: itemId, output_index: 0, content_index: 0, part: finalPart });
  emit(response, { type: "response.output_item.done", output_index: 0, item: finalItem });
  emit(response, { type: "response.completed", response: responseObject(requestBody, [finalItem], "completed", responseId) });
  response.end();
});

await new Promise((resolve, reject) => {
  gateway.once("error", reject);
  gateway.listen(0, "127.0.0.1", resolve);
});
const address = gateway.address();
if (!address || typeof address === "string") throw new Error("Smoke gateway failed to bind");

const codex = spawn(process.env.AIYOU_CODEX_COMMAND || "codex", [
  "-c", 'model_providers.aiyou.name="AIYOU Smoke Gateway"',
  "-c", `model_providers.aiyou.base_url="http://127.0.0.1:${address.port}/v1"`,
  "-c", 'model_providers.aiyou.wire_api="responses"',
  "app-server",
  "--stdio",
], {
  cwd: temporaryWorkspace,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, RUST_LOG: "error" },
});

let requestId = 1;
const pending = new Map();
const notifications = [];
const completionQueue = [];
const completionWaiters = [];

function nextCompletion() {
  if (completionQueue.length) return Promise.resolve(completionQueue.shift());
  return new Promise((resolve, reject) => {
    let waiter;
    const timer = setTimeout(() => {
      const index = completionWaiters.indexOf(waiter);
      if (index >= 0) completionWaiters.splice(index, 1);
      reject(new Error("Timed out waiting for turn/completed"));
    }, 30_000);
    waiter = {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    };
    completionWaiters.push(waiter);
  });
}

function rejectCompletionWaiters(error) {
  for (const waiter of completionWaiters.splice(0)) waiter.reject(error);
}

function send(message) {
  codex.stdin.write(`${JSON.stringify(message)}\n`);
}

function rpc(method, params = {}) {
  const id = requestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ id, method, params });
  });
}

createInterface({ input: codex.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id !== undefined && !message.method) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message ?? "App Server error"));
    else waiter.resolve(message.result);
    return;
  }
  if (!message.method || message.id !== undefined) return;
  notifications.push(message);
  if (message.method === "turn/completed") {
    const waiter = completionWaiters.shift();
    if (waiter) waiter.resolve(message);
    else completionQueue.push(message);
  }
});

codex.once("error", rejectCompletionWaiters);
codex.once("exit", (code) => {
  if (code && code !== 0) rejectCompletionWaiters(new Error(`Codex app-server exited with ${code}`));
});

try {
  await rpc("initialize", {
    clientInfo: { name: "aiyou-smoke", title: "AIYOU Smoke", version: "0.3.2" },
    capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: [] },
  });
  send({ method: "initialized", params: {} });
  const listedSkills = await rpc("skills/list", { cwds: [temporaryWorkspace], forceReload: true });
  const listedGroup = listedSkills?.data?.find((group) => group.cwd === temporaryWorkspace);
  const listedSkill = listedGroup?.skills?.find((skill) => skill.name === smokeSkillName);
  if (!listedSkill || listedSkill.enabled === false) {
    throw new Error(`Codex did not discover the temporary AIYOU smoke Skill: ${JSON.stringify(listedSkills).slice(0, 2_000)}`);
  }
  const started = await rpc("thread/start", {
    cwd: temporaryWorkspace,
    model: "custom-openai::smoke-model",
    modelProvider: "aiyou",
    approvalPolicy: "never",
    sandbox: "read-only",
    personality: "friendly",
    ephemeral: true,
  });
  const threadId = started.thread.id;
  const completed = nextCompletion();
  const turn = await rpc("turn/start", {
    threadId,
    input: [
      { type: "text", text: "Run the AIYOU runtime smoke check.", text_elements: [] },
      { type: "skill", name: listedSkill.name, path: listedSkill.path },
    ],
  });
  const completion = await completed;
  const successfulRequestBody = requestBody;
  const methods = notifications.map((item) => item.method);
  if (!successfulRequestBody || successfulRequestBody.model !== "custom-openai::smoke-model" || successfulRequestBody.stream !== true) {
    throw new Error("Codex did not send the expected Responses request");
  }
  if (!Array.isArray(successfulRequestBody.tools) || successfulRequestBody.tools.length === 0) {
    throw new Error("Codex Agent tools were not included in the model request");
  }
  if (!methods.includes("item/agentMessage/delta") || !methods.includes("item/completed")) {
    throw new Error("Agent Item events were not emitted");
  }
  if (completion.params?.turn?.status !== "completed") {
    throw new Error(`Unexpected Turn status: ${completion.params?.turn?.status}`);
  }
  const requestSerialized = JSON.stringify(successfulRequestBody);
  if (!requestSerialized.includes(smokeSkillMarker)) {
    throw new Error("Codex did not expand the selected Skill into the Agent request");
  }
  const authoritativeSkillItem = notifications
    .filter((item) => item.method === "item/started" || item.method === "item/completed")
    .map((item) => item.params?.item)
    .find((item) => item?.type === "userMessage")
    ?.content?.find((item) => item.type === "skill" && item.name === smokeSkillName && item.path === listedSkill.path);
  if (!authoritativeSkillItem) {
    throw new Error("Codex did not emit the typed Skill in the authoritative userMessage Item");
  }
  const failedCompletion = nextCompletion();
  const failedTurn = await rpc("turn/start", {
    threadId,
    input: [{ type: "text", text: "AIYOU_EXPECT_UPSTREAM_FAILURE", text_elements: [] }],
  });
  const failed = await failedCompletion;
  if (!/fail|error/i.test(String(failed.params?.turn?.status)) || !failed.params?.turn?.error) {
    throw new Error(`Codex did not close the failed upstream Turn: ${JSON.stringify(failed.params?.turn)}`);
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    threadId,
    turnId: turn.turn.id,
    turnStatus: completion.params.turn.status,
    modelProvider: started.thread.modelProvider,
    toolCount: successfulRequestBody.tools.length,
    skill: { name: smokeSkillName, discovered: true, authoritativeItem: true, expanded: true },
    failure: { turnId: failedTurn.turn.id, status: failed.params.turn.status, closed: true, retryable: true },
    observed: ["item/agentMessage/delta", "item/completed", "turn/completed"],
  }, null, 2)}\n`);
} finally {
  codex.kill("SIGTERM");
  await new Promise((resolve) => gateway.close(resolve));
  await rm(temporaryWorkspace, { recursive: true, force: true });
}
