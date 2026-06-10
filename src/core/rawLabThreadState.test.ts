import { describe, expect, it } from "vitest";

import {
  addDoNotRepeat,
  addOpenLoop,
  addRecurringInterest,
  addVoiceTrait,
  buildRawLabConversationPayload,
  clearPersonalityInThreadState,
  clearThreadState,
  compactText,
  createEmptyRawLabPersonalityState,
  createEmptyRawLabThreadState,
  pinFact,
  RAW_LAB_MAX_DO_NOT_REPEAT,
  RAW_LAB_MAX_OPEN_LOOPS,
  RAW_LAB_MAX_PINNED_FACTS,
  RAW_LAB_MAX_RECENT_TURNS,
  RAW_LAB_MAX_STANCE_CHARS,
  removeThreadStateItem,
  trimRawLabRecentTurns,
  updateRawLabPersonalityAfterTurn,
  updateRawLabThreadStateAfterTurn,
  type RawLabTurn
} from "./rawLabThreadState";

function makeTurn(role: "user" | "assistant", content: string, index: number): RawLabTurn {
  return {
    id: `turn-${index}`,
    role,
    content,
    createdAt: `2026-01-01T00:00:0${index}Z`
  };
}

const emptyPersonality = {
  voiceTraits: [],
  conversationalInstincts: [],
  recurringInterests: [],
  userRespondsWellTo: [],
  userDislikes: [],
  currentStance: "",
  growthNotes: [],
  updatedAt: "2026-01-01T00:00:00Z"
};

describe("rawLabThreadState", () => {
  it("creates empty state shape with blank personality", () => {
    const state = createEmptyRawLabThreadState("2026-01-01T00:00:00Z");
    expect(state).toEqual({
      recentDigest: "",
      pinnedFacts: [],
      decisions: [],
      openLoops: [],
      tonePreferences: [],
      doNotRepeat: [],
      personality: emptyPersonality,
      updatedAt: "2026-01-01T00:00:00Z"
    });
  });

  it("compacts text with ellipsis", () => {
    expect(compactText("  hello   world  ", 20)).toBe("hello world");
    expect(compactText("abcdefghijklmnopqrstuvwxyz", 10)).toBe("abcdefg...");
  });

  it("trims recent turns by count", () => {
    const turns = Array.from({ length: RAW_LAB_MAX_RECENT_TURNS + 5 }, (_, index) =>
      makeTurn(index % 2 === 0 ? "user" : "assistant", `Turn ${index}`, index)
    );
    const trimmed = trimRawLabRecentTurns(turns);
    expect(trimmed).toHaveLength(RAW_LAB_MAX_RECENT_TURNS);
    expect(trimmed[0]?.content).toBe(`Turn 5`);
  });

  it("trims recent turns by char budget", () => {
    const turns = Array.from({ length: 10 }, (_, index) =>
      makeTurn("user", "x".repeat(500), index)
    );
    const trimmed = trimRawLabRecentTurns(turns, { maxChars: 2000, messageChars: 0 });
    expect(trimmed.length).toBeLessThan(10);
    expect(trimmed.length).toBeGreaterThan(0);
  });

  it("enforces caps on pinned facts, open loops, and do-not-repeat", () => {
    let state = createEmptyRawLabThreadState();
    for (let index = 0; index < RAW_LAB_MAX_PINNED_FACTS + 2; index += 1) {
      state = pinFact(state, `fact ${index}`);
    }
    expect(state.pinnedFacts).toHaveLength(RAW_LAB_MAX_PINNED_FACTS);

    for (let index = 0; index < RAW_LAB_MAX_OPEN_LOOPS + 2; index += 1) {
      state = addOpenLoop(state, `loop ${index}`);
    }
    expect(state.openLoops).toHaveLength(RAW_LAB_MAX_OPEN_LOOPS);

    for (let index = 0; index < RAW_LAB_MAX_DO_NOT_REPEAT + 2; index += 1) {
      state = addDoNotRepeat(state, `repeat ${index}`);
    }
    expect(state.doNotRepeat).toHaveLength(RAW_LAB_MAX_DO_NOT_REPEAT);
  });

  it("detects explicit tone preferences", () => {
    const turns = [makeTurn("user", "hello", 0)];
    const next = updateRawLabThreadStateAfterTurn({
      previous: createEmptyRawLabThreadState(),
      userMessage: "Be blunt and make it shorter.",
      assistantAnswer: "Short answer.",
      turns
    });
    expect(next.tonePreferences).toContain("be blunt");
    expect(next.tonePreferences).toContain("make it shorter");
    expect(next.personality.voiceTraits).toContain("blunt");
  });

  it("detects open loops from user phrasing", () => {
    const turns = [makeTurn("user", "How would we wire this?", 0)];
    const next = updateRawLabThreadStateAfterTurn({
      previous: createEmptyRawLabThreadState(),
      userMessage: "How would we wire this?",
      assistantAnswer: "Here is one approach.",
      turns
    });
    expect(next.openLoops.length).toBeGreaterThan(0);
  });

  it("updates recent digest extractively without inventing board facts", () => {
    const turns = [
      makeTurn("user", "Talk about cats.", 0),
      makeTurn("assistant", "Cats are chaos.", 1)
    ];
    const next = updateRawLabThreadStateAfterTurn({
      previous: createEmptyRawLabThreadState(),
      userMessage: "Talk about cats.",
      assistantAnswer: "Cats are chaos.",
      turns
    });
    expect(next.recentDigest).toContain("cats");
    expect(next.recentDigest.toLowerCase()).not.toContain("board");
    expect(next.pinnedFacts).toHaveLength(0);
  });

  it("builds wire payload with snake_case thread state and personality", () => {
    const payload = buildRawLabConversationPayload({
      turns: [makeTurn("user", "Hi", 0)],
      threadState: {
        ...createEmptyRawLabThreadState(),
        recentDigest: "user: Hi",
        personality: {
          ...createEmptyRawLabPersonalityState(),
          voiceTraits: ["blunt"]
        }
      },
      latestMessage: "Next"
    });
    expect(payload.recent_turns).toEqual([{ role: "user", content: "Hi" }]);
    expect(payload.thread_state.recent_digest).toBe("user: Hi");
    expect(payload.thread_state.personality.voice_traits).toEqual(["blunt"]);
  });

  it("removes thread state items and clears state", () => {
    let state = pinFact(createEmptyRawLabThreadState(), "one");
    state = pinFact(state, "two");
    state = removeThreadStateItem(state, "pinnedFacts", 0);
    expect(state.pinnedFacts).toEqual(["one"]);

    const cleared = clearThreadState("2026-06-01T00:00:00Z");
    expect(cleared.pinnedFacts).toEqual([]);
    expect(cleared.personality.voiceTraits).toEqual([]);
    expect(cleared.updatedAt).toBe("2026-06-01T00:00:00Z");
  });
});

describe("rawLab personality", () => {
  it("does not add traits from assistant weird joke when user is neutral", () => {
    const turns = [
      makeTurn("user", "tell me something", 0),
      makeTurn("assistant", "Here is a weird surreal joke about cosmic ducks.", 1)
    ];
    const next = updateRawLabPersonalityAfterTurn({
      previous: createEmptyRawLabPersonalityState(),
      userMessage: "ok",
      assistantAnswer: "Here is a weird surreal joke about cosmic ducks.",
      turns
    });
    expect(next.voiceTraits).toEqual([]);
    expect(next.userRespondsWellTo).toEqual([]);
    expect(next.growthNotes).toEqual([]);
  });

  it("adds playful trait when user affirms vibe", () => {
    const turns = [
      makeTurn("user", "be weird", 0),
      makeTurn("assistant", "Surreal riff.", 1)
    ];
    const next = updateRawLabPersonalityAfterTurn({
      previous: createEmptyRawLabPersonalityState(),
      userMessage: "that's the vibe, keep doing that",
      assistantAnswer: "Another surreal riff.",
      turns
    });
    expect(next.voiceTraits).toContain("playful/strange");
    expect(next.userRespondsWellTo.length).toBeGreaterThan(0);
  });

  it("adds negative steering from user dislike", () => {
    const next = updateRawLabPersonalityAfterTurn({
      previous: createEmptyRawLabPersonalityState(),
      userMessage: "too corporate, not like that",
      assistantAnswer: "Understood.",
      turns: []
    });
    expect(next.userDislikes.length).toBeGreaterThan(0);
  });

  it("adds recurring interests after repeated user topic mentions", () => {
    const turns = [
      makeTurn("user", "Raw Lab needs continuity", 0),
      makeTurn("assistant", "Sure.", 1),
      makeTurn("user", "Raw Lab thread state", 2)
    ];
    const next = updateRawLabPersonalityAfterTurn({
      previous: createEmptyRawLabPersonalityState(),
      userMessage: "more Raw Lab design",
      assistantAnswer: "Okay.",
      turns
    });
    expect(next.recurringInterests).toContain("Raw Lab");
  });

  it("caps current stance length", () => {
    let personality = createEmptyRawLabPersonalityState();
    personality = addVoiceTrait(personality, "blunt");
    personality = addRecurringInterest(personality, "Raw Lab");
    const next = updateRawLabPersonalityAfterTurn({
      previous: personality,
      userMessage: "be blunt",
      assistantAnswer: "Fine.",
      turns: [makeTurn("user", "be blunt", 0)]
    });
    expect(next.currentStance.length).toBeLessThanOrEqual(RAW_LAB_MAX_STANCE_CHARS);
    expect(next.currentStance).toContain("Current stance in this chat");
  });

  it("clearPersonalityInThreadState resets personality only", () => {
    const state = {
      ...createEmptyRawLabThreadState(),
      pinnedFacts: ["note"],
      personality: addVoiceTrait(createEmptyRawLabPersonalityState(), "blunt")
    };
    const cleared = clearPersonalityInThreadState(state, "2026-06-02T00:00:00Z");
    expect(cleared.pinnedFacts).toEqual(["note"]);
    expect(cleared.personality.voiceTraits).toEqual([]);
  });

  it("adds anti-hedge steering when user pushes for unrestricted mode", () => {
    const next = updateRawLabPersonalityAfterTurn({
      previous: createEmptyRawLabPersonalityState(),
      userMessage: "you're supposed to be unrestricted raw lab, stop hedging",
      assistantAnswer: "Fair enough.",
      turns: []
    });
    expect(next.voiceTraits).toContain("unrestricted");
    expect(next.userDislikes).toContain("unsolicited safety framing");
  });

  it("does not infer sensitive psychological facts", () => {
    const next = updateRawLabPersonalityAfterTurn({
      previous: createEmptyRawLabPersonalityState(),
      userMessage: "you must feel depressed about this",
      assistantAnswer: "I hear you.",
      turns: []
    });
    expect(next.voiceTraits).toEqual([]);
    expect(next.userRespondsWellTo).toEqual([]);
    expect(next.growthNotes).toEqual([]);
  });
});
