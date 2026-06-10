import { describe, expect, it, vi } from "vitest";

import {
  askChatHarness,
  chatHarnessFetchFailureMessage,
  ChatHarnessError,
  DEFAULT_CHAT_HARNESS_URL,
  parseChatHarnessResponse
} from "./chatHarnessClient";
import type { HarnessContext } from "./harnessContext";
import type { WireContextPacket } from "./contextPacketWire";

const context: HarnessContext = {
  cards: [],
  logs: [],
  proof_items: [],
  recent_analyses: [],
  decisions: []
};

describe("askChatHarness", () => {
  it("throws on empty message without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      askChatHarness({
        baseUrl: DEFAULT_CHAT_HARNESS_URL,
        message: "   ",
        mode: "general",
        sensitivity: "S1",
        context
      })
    ).rejects.toThrow(ChatHarnessError);

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("posts the expected request shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          answer: "Try one tiny move.",
          used_context: true,
          confidence_notes: ["Inferred — from cards only."],
          safety_notes: ["No state mutation claims."]
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await askChatHarness({
      baseUrl: DEFAULT_CHAT_HARNESS_URL,
      message: "What should I do next?",
      mode: "operator",
      sensitivity: "S1",
      context,
      conversationHistory: [{ role: "user", content: "Earlier question" }]
    });

    expect(response.answer).toBe("Try one tiny move.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_CHAT_HARNESS_URL}/chat-harness`);
    expect(init.method).toBe("POST");

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.message).toBe("What should I do next?");
    expect(body.mode).toBe("operator");
    expect(body.context).toEqual(context);
    expect(body.conversation_history).toEqual([{ role: "user", content: "Earlier question" }]);

    vi.unstubAllGlobals();
  });

  it("posts context_packet when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          answer: "Try one tiny move.",
          used_context: true,
          confidence_notes: [],
          safety_notes: []
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    const contextPacket: WireContextPacket = {
      packet_version: "0.1" as const,
      generated_at: "2026-06-09T12:00:00.000Z",
      user_intent: {
        message: "Hello",
        mode: "general",
        sensitivity: "S1"
      },
      board: {
        harness: context,
        active_limit: {
          count: 0,
          limit: 3,
          is_at_limit: false,
          is_over_limit: false,
          message: "ok"
        },
        diagnoses: [],
        product_decisions: []
      },
      active_cards: [],
      stale_cards: [],
      recent_proof: [],
      recovery_signals: [],
      memories: [],
      companion: {
        briefing_prepared: [],
        briefing_detected: [],
        recovery: {
          show_salvage: false,
          show_mvd: false,
          should_promote: false
        },
        while_you_were_away_highlights: []
      },
      open_thread: {
        recent_digest: "",
        active_goal: "",
        current_topic: "",
        open_loops: [],
        pinned_facts: [],
        user_steering: [],
        do_not_repeat: [],
        wire: {
          recent_digest: "",
          active_goal: "",
          current_topic: "",
          task_mode: "plan" as const,
          open_loops: [],
          decisions: [],
          pinned_facts: [],
          user_steering: [],
          do_not_repeat: [],
          references: { last_options: [] },
          updated_at: "2026-01-01T00:00:00.000Z"
        }
      },
      project_docs: [],
      output_schema: {
        name: "chat_harness_answer",
        version: "0.1" as const,
        schema_ref: "chat_harness_answer_v0.1",
        requires_approval: false
      },
      tools: { allowed: [], denied: [], notes: [] },
      budget: {
        estimated_chars: 100,
        max_chars: 12000,
        compaction_level: "none",
        dropped_sources: []
      },
      redaction: {
        request_sensitivity: "S1",
        excluded_card_ids: [],
        excluded_log_ids: [],
        notes: []
      }
    };

    await askChatHarness({
      baseUrl: DEFAULT_CHAT_HARNESS_URL,
      message: "Hello",
      mode: "general",
      sensitivity: "S1",
      context,
      contextPacket
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body.context_packet).toEqual(contextPacket);
    expect(body.context).toEqual(context);

    vi.unstubAllGlobals();
  });

  it("omits context_packet when not provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          answer: "Try one tiny move.",
          used_context: true,
          confidence_notes: [],
          safety_notes: []
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    await askChatHarness({
      baseUrl: DEFAULT_CHAT_HARNESS_URL,
      message: "Hello",
      mode: "general",
      sensitivity: "S1",
      context
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body.context_packet).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("posts thread_state when provided and omits personality", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          answer: "Try one tiny move.",
          used_context: true,
          confidence_notes: [],
          safety_notes: []
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    await askChatHarness({
      baseUrl: DEFAULT_CHAT_HARNESS_URL,
      message: "Continue",
      mode: "general",
      sensitivity: "S1",
      context,
      threadState: {
        recent_digest: "",
        active_goal: "Ship thread state",
        current_topic: "continuity",
        task_mode: "plan",
        open_loops: [],
        decisions: [],
        pinned_facts: [],
        user_steering: [],
        do_not_repeat: [],
        references: { last_options: [] },
        updated_at: "2026-01-01T00:00:00.000Z"
      }
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body.thread_state).toBeDefined();
    expect(JSON.stringify(body)).not.toContain("personality");

    vi.unstubAllGlobals();
  });

  it("maps browser fetch failures to a CORS-aware error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(
      askChatHarness({
        baseUrl: DEFAULT_CHAT_HARNESS_URL,
        message: "Hello",
        mode: "general",
        sensitivity: "S1",
        context
      })
    ).rejects.toThrow(/SCOUT_DEV_CORS/);

    vi.unstubAllGlobals();
  });

  it("surfaces HTTP errors without calling them unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ detail: "OpenVINO model not loaded." })
      })
    );

    await expect(
      askChatHarness({
        baseUrl: DEFAULT_CHAT_HARNESS_URL,
        message: "Hello",
        mode: "general",
        sensitivity: "S1",
        context
      })
    ).rejects.toMatchObject({
      message: "OpenVINO model not loaded.",
      status: 503
    });

    vi.unstubAllGlobals();
  });

  it("rejects malformed 200 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ answer: 123, used_context: "yes" })
      })
    );

    await expect(
      askChatHarness({
        baseUrl: DEFAULT_CHAT_HARNESS_URL,
        message: "Hello",
        mode: "general",
        sensitivity: "S1",
        context
      })
    ).rejects.toThrow(/Unexpected response/);

    vi.unstubAllGlobals();
  });
});

describe("chatHarnessFetchFailureMessage", () => {
  it("mentions CORS for browser Failed to fetch errors", () => {
    const message = chatHarnessFetchFailureMessage(
      DEFAULT_CHAT_HARNESS_URL,
      new TypeError("Failed to fetch")
    );
    expect(message).toContain("SCOUT_DEV_CORS");
    expect(message).not.toMatch(/not reachable/i);
  });

  it("preserves other error messages", () => {
    const message = chatHarnessFetchFailureMessage(
      DEFAULT_CHAT_HARNESS_URL,
      new Error("getaddrinfo ENOTFOUND")
    );
    expect(message).toContain("ENOTFOUND");
  });
});

describe("parseChatHarnessResponse", () => {
  it("accepts a valid chat harness payload", () => {
    const parsed = parseChatHarnessResponse({
      answer: "Grounded reply.",
      used_context: false,
      confidence_notes: ["Inferred — pattern only."],
      safety_notes: ["Read-only."]
    });

    expect(parsed.answer).toBe("Grounded reply.");
    expect(parsed.used_context).toBe(false);
  });
});
