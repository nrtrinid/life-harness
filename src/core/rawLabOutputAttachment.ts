import { compactText } from "./chatThreadState";
import { capMemorySummary, type CreateMemoryItemInput } from "./harnessMemoryBank";

export const RAW_LAB_IDEA_PAYLOAD_MAX = 240;
export const RAW_LAB_COMPANION_HANDOFF_MAX = 800;

const RAW_LAB_MEMORY_TITLE_WORDS = 6;
const RAW_LAB_MEMORY_TITLE_MAX = 80;

export function isAttachableRawLabOutput(content: string): boolean {
  return content.trim().length > 0;
}

export function buildRawLabIdeaCaptureText(output: string): string | null {
  if (!isAttachableRawLabOutput(output)) {
    return null;
  }

  return `new idea: ${compactText(output.trim(), RAW_LAB_IDEA_PAYLOAD_MAX)}`;
}

function titleFromRawLabOutput(output: string): string {
  const words = output.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "Raw Lab insight";
  }

  const title = words.slice(0, RAW_LAB_MEMORY_TITLE_WORDS).join(" ");
  return title.length > RAW_LAB_MEMORY_TITLE_MAX
    ? compactText(title, RAW_LAB_MEMORY_TITLE_MAX)
    : title;
}

export function buildRawLabMemoryInput(output: string): CreateMemoryItemInput | null {
  if (!isAttachableRawLabOutput(output)) {
    return null;
  }

  const trimmed = output.trim();
  return {
    kind: "pattern",
    title: titleFromRawLabOutput(trimmed),
    summary: capMemorySummary(trimmed),
    tags: ["raw-lab"],
    isActive: false
  };
}

export function buildRawLabCompanionHandoffPacket(output: string): string | null {
  if (!isAttachableRawLabOutput(output)) {
    return null;
  }

  const body = compactText(output.trim(), RAW_LAB_COMPANION_HANDOFF_MAX);
  return `${body}\n\nFrom Raw Signal (sandbox). Review before using in Companion. Not board authority.`;
}
