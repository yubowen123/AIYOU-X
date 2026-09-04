import type { AgentAttachment, AgentInput, SkillReference } from "../shared/types";

export function buildAgentInput(text: string, attachments: AgentAttachment[], skills: SkillReference[]): AgentInput[] {
  const fileInstructions = attachments
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text!);
  const combinedText = [text.trim(), ...fileInstructions].filter(Boolean).join("\n\n");
  const input: AgentInput[] = combinedText ? [{ type: "text", text: combinedText, text_elements: [] }] : [];
  for (const attachment of attachments) {
    if (attachment.type === "localImage" && attachment.path) input.push({ type: "localImage", path: attachment.path });
  }
  const seen = new Set<string>();
  for (const skill of skills) {
    if (!skill.path || seen.has(skill.path)) continue;
    seen.add(skill.path);
    input.push({ type: "skill", name: skill.name, path: skill.path });
  }
  return input;
}
