import { describe, expect, it, vi } from "vitest";

import { createCompanionSelfMemory } from "./companionSelfMemory";
import { createEmptyRawLabThreadState, type RawLabTurn } from "./rawLabThreadState";
import { isRawLabInputBudgetError } from "./rawLabContextBudget";
import {
  askRawLab,
  buildRawLabRequestBody,
  DEFAULT_RAW_LAB_URL,
  parseRawLabResponse,
  RawLabError
} from "./rawLabClient";

function makeTurn(role: "user" | "assistant", content: string): RawLabTurn {
  return {
    id: `turn-${content}`,
    role,
    content,
    createdAt: "2026-01-01T00:00:00Z"
  };
}

describe("buildRawLabRequestBody", () => {
  it("sends message, recent_turns, and thread_state in snake_case", () => {
    const body = buildRawLabRequestBody({
      message: "Be blunt.",
      turns: [makeTurn("user", "Earlier")],
      threadState: {
        ...createEmptyRawLabThreadState(),
        recentDigest: "user: Earlier",
        pinnedFacts: ["note"],
        recurringTopics: ["Raw Lab"],
        currentVibe: "Current vibe in this chat: direct.",
        provisionalStances: ["Provisional stance: exploring whether Raw Lab can cohere"],
        selfObservations: ["I'm noticing I tend to circle continuity."],
        questionsToRevisit: ["What were we circling?"]
      }
    });

    expect(body.message).toBe("Be blunt.");
    expect(body.recent_turns).toEqual([{ role: "user", content: "Earlier" }]);
    expect(body.thread_state.recent_digest).toBe("user: Earlier");
    expect(body.thread_state.pinned_facts).toEqual(["note"]);
    expect(body.thread_state.recurring_topics).toEqual(["Raw Lab"]);
    expect(body.thread_state.current_vibe).toBe("Current vibe in this chat: direct.");
    expect(body.thread_state.provisional_stances).toEqual([
      "Provisional stance: exploring whether Raw Lab can cohere"
    ]);
    expect(body.thread_state.self_observations).toEqual([
      "I'm noticing I tend to circle continuity."
    ]);
    expect(body.thread_state.questions_to_revisit).toEqual(["What were we circling?"]);
    expect(body.thread_state.smart_compacted_context).toMatchObject({
      active_open_loops: [],
      questions_to_revisit: [],
      user_steering: [],
      do_not_repeat: [],
      important_recent_moments: [],
      current_tension: "",
      confidence: 0
    });
    expect(body.reasoning_depth).toBe("fast");
    expect(body).not.toHaveProperty("context");
    expect(body).not.toHaveProperty("board_context");
    expect(body).not.toHaveProperty("memory_context");
    expect(body).not.toHaveProperty("proposed_card_updates");
    expect(body).not.toHaveProperty("conversation_history");
    expect(body).not.toHaveProperty("allow_adult_topics");
    expect(body.companion_self_memories).toEqual([]);
  });

  it("includes companion self-memories when provided", () => {
    const created = createCompanionSelfMemory({
      kind: "self_observation",
      subject: "companion_self",
      text: "Initiative pattern",
      source: "manual_user_teaching"
    });
    if (!created.ok) {
      throw new Error("expected memory");
    }
    const body = buildRawLabRequestBody({
      message: "Hi",
      turns: [],
      threadState: createEmptyRawLabThreadState(),
      companionSelfMemories: [created.memory]
    });
    expect(body.companion_self_memories).toHaveLength(1);
    expect(body.companion_self_memories[0]?.text).toBe("Initiative pattern");
    expect(body.companion_self_memories[0]?.subject).toBe("companion_self");
  });

  it("sends Raw Lab reasoning depth when selected", () => {
    const body = buildRawLabRequestBody({
      message: "Think harder.",
      turns: [],
      threadState: createEmptyRawLabThreadState(),
      reasoningDepth: "deep"
    });
    expect(body.reasoning_depth).toBe("deep");
  });

  it("maps personality fields to snake_case and compacts long notes", () => {
    const body = buildRawLabRequestBody({
      message: "Hi",
      turns: [],
      threadState: {
        ...createEmptyRawLabThreadState(),
        personality: {
          ...createEmptyRawLabThreadState().personality,
          voiceTraits: ["blunt"],
          currentStance: "x".repeat(300)
        }
      }
    });
    const threadState = body.thread_state as {
      personality: { voice_traits: string[]; current_stance: string };
    };
    expect(threadState.personality.voice_traits).toEqual(["blunt"]);
    expect(threadState.personality.current_stance.length).toBeLessThanOrEqual(220);
  });

  it("trims long history", () => {
    const turns = Array.from({ length: 30 }, (_, index) =>
      makeTurn("user", `Turn ${index} `.repeat(80))
    );
    const body = buildRawLabRequestBody({
      message: "Next",
      turns,
      threadState: createEmptyRawLabThreadState()
    });
    expect(body.recent_turns.length).toBeLessThan(turns.length);
  });
});

describe("askRawLab", () => {
  it("throws on empty message without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      askRawLab({
        baseUrl: DEFAULT_RAW_LAB_URL,
        message: "   "
      })
    ).rejects.toThrow(RawLabError);

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("posts only raw-lab fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          answer: "Sandbox reply.",
          mode: "raw_lab",
          safety_notes: ["Ungrounded."],
          used_context: false
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await askRawLab({
      baseUrl: DEFAULT_RAW_LAB_URL,
      message: "Be blunt.",
      turns: [makeTurn("user", "Earlier")],
      threadState: createEmptyRawLabThreadState()
    });

    expect(response.response.answer).toBe("Sandbox reply.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_RAW_LAB_URL}/raw-lab`);

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.message).toBe("Be blunt.");
    expect(body.recent_turns).toEqual([{ role: "user", content: "Earlier" }]);
    const threadState = body.thread_state as {
      personality: Record<string, unknown>;
    };
    expect(threadState).toBeTruthy();
    expect(threadState.personality).toMatchObject({
      voice_traits: [],
      conversational_instincts: [],
      recurring_interests: [],
      user_responds_well_to: [],
      user_dislikes: [],
      current_stance: "",
      growth_notes: []
    });
    expect(body).not.toHaveProperty("context");
    expect(body).not.toHaveProperty("mode");
    expect(body).not.toHaveProperty("sensitivity");
    expect(body).not.toHaveProperty("allow_adult_topics");

    vi.unstubAllGlobals();
  });

  it("rejects malformed 200 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ answer: "ok", mode: "raw_lab", used_context: true, safety_notes: [] })
      })
    );

    await expect(
      askRawLab({
        baseUrl: DEFAULT_RAW_LAB_URL,
        message: "Hi"
      })
    ).rejects.toThrow(RawLabError);

    vi.unstubAllGlobals();
  });
});

describe("budget retry", () => {
  it("retries once on budget 422 only", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () =>
          JSON.stringify({
            detail: "Serialized input length 13000 exceeds SCOUT_MAX_INPUT_CHARS=12000"
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            answer: "After compact.",
            mode: "raw_lab",
            safety_notes: [],
            used_context: false
          })
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await askRawLab({
      baseUrl: DEFAULT_RAW_LAB_URL,
      message: "hello"
    });

    expect(result.response.answer).toBe("After compact.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("does not retry schema validation 422", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({
          detail: [
            {
              msg: "Field required"
            }
          ]
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      askRawLab({
        baseUrl: DEFAULT_RAW_LAB_URL,
        message: "hello"
      })
    ).rejects.toThrow(RawLabError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("isRawLabInputBudgetError", () => {
  it("detects gateway budget messages", () => {
    expect(
      isRawLabInputBudgetError("Serialized input length 12795 exceeds SCOUT_MAX_INPUT_CHARS=12000")
    ).toBe(true);
    expect(isRawLabInputBudgetError("Field required")).toBe(false);
  });
});

describe("parseRawLabResponse", () => {
  it("parses valid payload", () => {
    const parsed = parseRawLabResponse({
      answer: "Hi",
      mode: "raw_lab",
      safety_notes: [],
      used_context: false
    });
    expect(parsed.used_context).toBe(false);
  });
});
