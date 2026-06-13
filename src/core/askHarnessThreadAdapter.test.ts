import { describe, expect, it } from "vitest";

import type { ChatThreadItem } from "./chatHarnessTypes";
import { buildConversationHistoryFromThread } from "./askHarnessThreadAdapter";

describe("buildConversationHistoryFromThread", () => {
  it("returns empty array for empty thread", () => {
    expect(buildConversationHistoryFromThread([])).toEqual([]);
  });

  it("maps user and assistant turns", () => {
    const thread: ChatThreadItem[] = [
      { id: "u1", kind: "user", text: "What am I avoiding?", mode: "operator" },
      {
        id: "a1",
        kind: "assistant",
        userText: "What am I avoiding?",
        mode: "operator",
        response: {
          answer: "Career follow-ups look cold.",
          used_context: true,
          confidence_notes: ["Inferred — from cards."],
          safety_notes: []
        },
        memorySaved: false,
        savedCandidateKeys: [],
        showMemoryPreview: false,
        showConfidence: false,
        showMemoryTools: false
      }
    ];

    expect(buildConversationHistoryFromThread(thread)).toEqual([
      { role: "user", content: "What am I avoiding?" },
      { role: "assistant", content: "Career follow-ups look cold." }
    ]);
  });

  it("skips error turns", () => {
    const thread: ChatThreadItem[] = [
      { id: "u1", kind: "user", text: "Hello", mode: "general" },
      {
        id: "e1",
        kind: "error",
        text: "Gateway down",
        contextMode: "full",
        baseUrl: "http://127.0.0.1:8111"
      }
    ];

    expect(buildConversationHistoryFromThread(thread)).toEqual([
      { role: "user", content: "Hello" }
    ]);
  });

  it("uses assistant answer text only", () => {
    const thread: ChatThreadItem[] = [
      {
        id: "a1",
        kind: "assistant",
        userText: "Hi",
        mode: "general",
        response: {
          answer: "Only this text.",
          used_context: false,
          confidence_notes: ["meta"],
          safety_notes: ["safety"]
        },
        memorySaved: true,
        savedCandidateKeys: ["key"],
        showMemoryPreview: true,
        showConfidence: true,
        showMemoryTools: true
      }
    ];

    const history = buildConversationHistoryFromThread(thread);
    expect(history).toEqual([{ role: "assistant", content: "Only this text." }]);
    expect(JSON.stringify(history)).not.toContain("confidence_notes");
  });
});
