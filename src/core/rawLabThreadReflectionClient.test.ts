import { describe, expect, it, vi } from "vitest";

import { createCompanionSelfMemory } from "./companionSelfMemory";
import {
  applyRawLabThreadReflection,
  buildRawLabThreadReflectionRequestBody,
  parseRawLabThreadReflectionResponse,
  reflectRawLabThread
} from "./rawLabThreadReflectionClient";
import { createEmptyRawLabThreadState, type RawLabTurn } from "./rawLabThreadState";
import { RawLabError } from "./rawLabClient";

function makeTurn(role: "user" | "assistant", content: string): RawLabTurn {
  return {
    id: `turn-${role}-${content}`,
    role,
    content,
    createdAt: "2026-01-01T00:00:00Z"
  };
}

describe("rawLabThreadReflectionClient", () => {
  it("builds reflection request with turns, thread state, and companion self-memories", () => {
    const created = createCompanionSelfMemory({
      kind: "self_observation",
      subject: "companion_self",
      text: "I tend to choose direction when asked.",
      source: "manual_user_teaching"
    });
    if (!created.ok) {
      throw new Error("expected memory");
    }

    const body = buildRawLabThreadReflectionRequestBody({
      turns: [makeTurn("user", "What were we circling?")],
      threadState: {
        ...createEmptyRawLabThreadState(),
        selfObservations: ["I'm noticing I circle continuity."]
      },
      companionSelfMemories: [created.memory]
    });

    expect(body.recent_turns).toEqual([{ role: "user", content: "What were we circling?" }]);
    expect(body.thread_state.self_observations).toEqual([
      "I'm noticing I circle continuity."
    ]);
    expect(body.companion_self_memories).toHaveLength(1);
    expect(body).not.toHaveProperty("board_context");
    expect(body).not.toHaveProperty("memory_context");
    expect(body).not.toHaveProperty("save_memory");
  });

  it("parses structured proposals and rejects context use", () => {
    const parsed = parseRawLabThreadReflectionResponse({
      proposals: {
        self_observations: ["I'm noticing I tend to return to open loops."],
        questions_to_revisit: ["What were we circling?"],
        provisional_stances: ["Provisional stance: continuity matters here."],
        current_vibe: "Current vibe in this chat: reflective.",
        do_not_repeat: ["same framing"],
        user_steering: ["be more direct"]
      },
      safety_notes: [],
      used_context: false
    });

    expect(parsed.proposals.current_vibe).toContain("reflective");
    expect(() =>
      parseRawLabThreadReflectionResponse({
        proposals: {},
        safety_notes: [],
        used_context: true
      })
    ).toThrow(RawLabError);
  });

  it("applies reflection proposals to temporary thread state", () => {
    const state = createEmptyRawLabThreadState();
    const next = applyRawLabThreadReflection(state, {
      proposals: {
        self_observations: ["I'm noticing I tend to synthesize the thread."],
        questions_to_revisit: ["What should we revisit about reflection bounds?"],
        provisional_stances: ["Provisional stance: reflection should stay inspectable."],
        current_vibe: "Current vibe in this chat: deliberate and experimental.",
        do_not_repeat: ["entity sauce"],
        user_steering: ["avoid entity sauce"]
      },
      safety_notes: [],
      used_context: false
    });

    expect(next.selfObservations).toContain("I'm noticing I tend to synthesize the thread.");
    expect(next.questionsToRevisit).toContain("What should we revisit about reflection bounds?");
    expect(next.provisionalStances).toContain("reflection should stay inspectable.");
    expect(next.currentVibe).toBe("Current vibe in this chat: deliberate and experimental.");
    expect(next.doNotRepeat).toContain("entity sauce");
    expect(next.userSteering).toContain("avoid entity sauce");
    expect(state.selfObservations).toEqual([]);
  });

  it("sanitizes noisy reflection proposals before applying", () => {
    const state = createEmptyRawLabThreadState();
    const next = applyRawLabThreadReflection(state, {
      proposals: {
        self_observations: ["Got it, bro.", "I'm noticing I tend to synthesize the thread."],
        questions_to_revisit: ["can we get the full script?"],
        provisional_stances: [
          "Provisional stance: exploring whether you're dumb",
          "Provisional stance: reflection should stay inspectable."
        ],
        current_vibe: "",
        do_not_repeat: ["what's next", "I'm all ears"],
        user_steering: ["what's your take", "avoid reflexive handoff questions"]
      },
      safety_notes: [],
      used_context: false
    });

    expect(next.selfObservations).toEqual(["I'm noticing I tend to synthesize the thread."]);
    expect(next.questionsToRevisit).toEqual([]);
    expect(next.provisionalStances).toContain("reflection should stay inspectable.");
    expect(next.provisionalStances.some((item) => item.includes("exploring whether"))).toBe(false);
    expect(next.doNotRepeat).toEqual(expect.arrayContaining(["what's next", "I'm all ears"]));
    expect(next.userSteering).toEqual(["avoid reflexive handoff questions"]);
  });

  it("posts to the narrow thread reflection endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          proposals: {
            self_observations: ["I'm noticing I tend to keep the thread coherent."],
            questions_to_revisit: ["What were we circling?"],
            provisional_stances: [],
            current_vibe: "",
            do_not_repeat: [],
            user_steering: []
          },
          safety_notes: [],
          used_context: false
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await reflectRawLabThread({
      baseUrl: "http://gateway/",
      turns: [makeTurn("user", "What were we circling?")],
      threadState: createEmptyRawLabThreadState()
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://gateway/raw-lab/reflect-thread",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.used_context).toBe(false);
    vi.unstubAllGlobals();
  });
});
