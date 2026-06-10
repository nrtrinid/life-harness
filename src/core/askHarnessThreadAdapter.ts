import type { ChatThreadItem } from "../components/askHarness/types";
import type { ConversationTurn } from "./harnessContext";
import {
  CHAT_HARNESS_MAX_HISTORY_CHARS,
  CHAT_HARNESS_MAX_HISTORY_TURNS,
  trimConversationTurns,
  type ChatTurn
} from "./chatThreadState";

/**
 * Converts completed UI thread items into wire-format conversation turns.
 * Excludes error turns and UI-only metadata. Current in-flight message is not included.
 */
export function buildConversationHistoryFromThread(
  thread: ChatThreadItem[],
  options: { maxTurns?: number; maxChars?: number } = {}
): ConversationTurn[] {
  const turns: ChatTurn[] = [];

  for (const item of thread) {
    if (item.kind === "user") {
      const text = item.text.trim();
      if (text) {
        turns.push({ role: "user", content: text });
      }
      continue;
    }

    if (item.kind === "assistant") {
      const answer = item.response.answer.trim();
      if (answer) {
        turns.push({ role: "assistant", content: answer });
      }
    }
  }

  return trimConversationTurns(turns, {
    maxTurns: options.maxTurns ?? CHAT_HARNESS_MAX_HISTORY_TURNS,
    maxChars: options.maxChars ?? CHAT_HARNESS_MAX_HISTORY_CHARS
  });
}
