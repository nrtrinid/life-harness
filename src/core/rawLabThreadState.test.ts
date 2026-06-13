import { describe, expect, it } from "vitest";

import {
  addDoNotRepeat,
  addOpenLoop,
  addProvisionalStance,
  addRecurringInterest,
  addSelfObservation,
  addUserSteering,
  addVoiceTrait,
  buildDisplayThreadMemoryState,
  buildRawLabConversationPayload,
  buildWireThreadMemoryState,
  clearPersonalityInThreadState,
  clearThreadState,
  compactText,
  createEmptyRawLabPersonalityState,
  createEmptyRawLabThreadState,
  distillOpenLoop,
  detectRawLabNoHandoffSteering,
  filterDisplayThreadMemoryItems,
  isMalformedProvisionalStance,
  isNoisyRawLabAssistantSnippet,
  isRawUserQuestionMemory,
  isSubstantiveOpenLoop,
  isThinVagueOpenLoop,
  normalizeProvisionalStance,
  pinFact,
  sanitizeRawLabMemoryProposal,
  RAW_LAB_MAX_DO_NOT_REPEAT,
  RAW_LAB_MAX_OPEN_LOOPS,
  RAW_LAB_MAX_PINNED_FACTS,
  RAW_LAB_MAX_PROVISIONAL_STANCES,
  RAW_LAB_MAX_QUESTIONS_TO_REVISIT,
  RAW_LAB_MAX_RECURRING_TOPICS,
  RAW_LAB_MAX_SELF_OBSERVATIONS,
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
    expect(state.recentDigest).toBe("");
    expect(state.pinnedFacts).toEqual([]);
    expect(state.openLoops).toEqual([]);
    expect(state.userSteering).toEqual([]);
    expect(state.recurringTopics).toEqual([]);
    expect(state.currentVibe).toBe("");
    expect(state.provisionalStances).toEqual([]);
    expect(state.selfObservations).toEqual([]);
    expect(state.questionsToRevisit).toEqual([]);
    expect(state.smartCompactedContext).toEqual({
      activeOpenLoops: [],
      questionsToRevisit: [],
      userSteering: [],
      doNotRepeat: [],
      recurringTopics: [],
      provisionalStances: [],
      selfObservations: [],
      importantRecentMoments: [],
      currentTension: "",
      discardedNoiseSummary: "",
      sourceTurnIds: [],
      confidence: 0
    });
    expect(state.taskMode).toBe("casual");
    expect(state.references.lastOptions).toEqual([]);
    expect(state.personality).toEqual(emptyPersonality);
    expect(state.updatedAt).toBe("2026-01-01T00:00:00Z");
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

  it("enforces caps on pinned facts, open loops, do-not-repeat, and mind fields", () => {
    let state = createEmptyRawLabThreadState();
    for (let index = 0; index < RAW_LAB_MAX_PINNED_FACTS + 2; index += 1) {
      state = pinFact(state, `fact ${index}`);
    }
    expect(state.pinnedFacts).toHaveLength(RAW_LAB_MAX_PINNED_FACTS);

    for (let index = 0; index < RAW_LAB_MAX_OPEN_LOOPS + 2; index += 1) {
      state = addOpenLoop(
        state,
        `Still circling whether implementation track ${index} should ship before the persona polish pass completes.`
      );
    }
    expect(state.openLoops).toHaveLength(RAW_LAB_MAX_OPEN_LOOPS);

    for (let index = 0; index < RAW_LAB_MAX_DO_NOT_REPEAT + 2; index += 1) {
      state = addDoNotRepeat(state, `repeat ${index}`);
    }
    expect(state.doNotRepeat).toHaveLength(RAW_LAB_MAX_DO_NOT_REPEAT);

    for (let index = 0; index < RAW_LAB_MAX_RECURRING_TOPICS + 2; index += 1) {
      state.recurringTopics = [`topic ${index}`, ...state.recurringTopics].slice(
        0,
        RAW_LAB_MAX_RECURRING_TOPICS
      );
    }
    expect(state.recurringTopics).toHaveLength(RAW_LAB_MAX_RECURRING_TOPICS);

    state.provisionalStances = Array.from(
      { length: RAW_LAB_MAX_PROVISIONAL_STANCES + 2 },
      (_, index) => `stance ${index}`
    ).slice(0, RAW_LAB_MAX_PROVISIONAL_STANCES);
    expect(state.provisionalStances).toHaveLength(RAW_LAB_MAX_PROVISIONAL_STANCES);

    state.selfObservations = Array.from(
      { length: RAW_LAB_MAX_SELF_OBSERVATIONS + 2 },
      (_, index) => `observation ${index}`
    ).slice(0, RAW_LAB_MAX_SELF_OBSERVATIONS);
    expect(state.selfObservations).toHaveLength(RAW_LAB_MAX_SELF_OBSERVATIONS);

    state.questionsToRevisit = Array.from(
      { length: RAW_LAB_MAX_QUESTIONS_TO_REVISIT + 2 },
      (_, index) => `question ${index}`
    ).slice(0, RAW_LAB_MAX_QUESTIONS_TO_REVISIT);
    expect(state.questionsToRevisit).toHaveLength(RAW_LAB_MAX_QUESTIONS_TO_REVISIT);
  });

  it("detects explicit tone preferences", () => {
    const turns = [makeTurn("user", "hello", 0)];
    const next = updateRawLabThreadStateAfterTurn({
      previous: createEmptyRawLabThreadState(),
      userMessage: "Be blunt and make it shorter.",
      assistantAnswer: "Short answer.",
      turns
    });
    expect(next.userSteering).toContain("be blunt");
    expect(next.userSteering).toContain("make it shorter");
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
    expect(payload.thread_state.recurring_topics).toEqual([]);
    expect(payload.thread_state.current_vibe).toBe("");
    expect(payload.thread_state.provisional_stances).toEqual([]);
    expect(payload.thread_state.self_observations).toEqual([]);
    expect(payload.thread_state.questions_to_revisit).toEqual([]);
    expect(payload.thread_state.smart_compacted_context).toEqual({
      active_open_loops: [],
      questions_to_revisit: [],
      user_steering: [],
      do_not_repeat: [],
      recurring_topics: [],
      provisional_stances: [],
      self_observations: [],
      important_recent_moments: [],
      current_tension: "",
      discarded_noise_summary: "",
      source_turn_ids: [],
      confidence: 0
    });
  });

  it("removes thread state items and clears state", () => {
    let state = pinFact(createEmptyRawLabThreadState(), "one");
    state = pinFact(state, "two");
    state = removeThreadStateItem(state, "pinnedFacts", 0);
    expect(state.pinnedFacts).toEqual(["one"]);

    state = {
      ...state,
      recurringTopics: ["Raw Lab", "memory"]
    };
    state = removeThreadStateItem(state, "recurringTopics", 0);
    expect(state.recurringTopics).toEqual(["memory"]);

    const cleared = clearThreadState("2026-06-01T00:00:00Z");
    expect(cleared.pinnedFacts).toEqual([]);
    expect(cleared.recurringTopics).toEqual([]);
    expect(cleared.personality.voiceTraits).toEqual([]);
    expect(cleared.updatedAt).toBe("2026-06-01T00:00:00Z");
  });

  it("detects do-not-repeat commands from user steering", () => {
    const next = updateRawLabThreadStateAfterTurn({
      previous: createEmptyRawLabThreadState(),
      userMessage: "Don't keep saying little scout.",
      assistantAnswer: "Got it.",
      turns: [makeTurn("user", "Don't keep saying little scout.", 0)]
    });
    expect(next.doNotRepeat).toContain("little scout");
  });

  it("detects recurring topics, vibe, clean stances, and explicit revisit questions", () => {
    const baseTurns = [
      makeTurn("user", "Raw Lab personality needs continuity.", 0),
      makeTurn("assistant", "Yes.", 1)
    ];
    let state = updateRawLabThreadStateAfterTurn({
      previous: createEmptyRawLabThreadState(),
      userMessage: "I think we should write a simple Python script for this.",
      assistantAnswer: "Sure.",
      turns: [
        ...baseTurns,
        makeTurn("user", "I think we should write a simple Python script for this.", 2)
      ]
    });
    expect(state.provisionalStances).toContain(
      "Raw Lab should produce the next concrete artifact once the user has approved a build direction."
    );
    expect(state.provisionalStances.some((item) => item.includes("exploring whether"))).toBe(false);

    const turns = [
      ...baseTurns,
      makeTurn("user", "I think we should write a simple Python script for this.", 2),
      makeTurn("assistant", "Sure.", 3),
      makeTurn("user", "What were we circling on Raw Lab personality?", 4)
    ];
    const next = updateRawLabThreadStateAfterTurn({
      previous: state,
      userMessage: "What were we circling on Raw Lab personality?",
      assistantAnswer: "Continuity and inspectable state.",
      turns
    });
    expect(next.recurringTopics).toContain("Raw Lab");
    expect(next.currentVibe).toContain("Raw Lab");
    expect(next.questionsToRevisit[0]).toContain("Raw Lab personality");
    expect(next.selfObservations.some((item) => item.includes("I'm noticing"))).toBe(true);
  });

  it("does not create self-observations from assistant-only style", () => {
    const turns = [
      makeTurn("user", "ok", 0),
      makeTurn("assistant", "I am now a flamboyant comet of style.", 1)
    ];
    const next = updateRawLabThreadStateAfterTurn({
      previous: createEmptyRawLabThreadState(),
      userMessage: "ok",
      assistantAnswer: "I am now a flamboyant comet of style.",
      turns
    });
    expect(next.selfObservations).toEqual([]);
    expect(next.recurringTopics).toEqual([]);
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

  it("filters noisy assistant snippets from display memory items (case A)", () => {
    expect(isNoisyRawLabAssistantSnippet("Got it, no handoffs.")).toBe(true);
    expect(isNoisyRawLabAssistantSnippet("Bro, sure thing.")).toBe(true);
    expect(isNoisyRawLabAssistantSnippet("You're welcome!")).toBe(true);
    expect(isNoisyRawLabAssistantSnippet("avoid reflexive handoff questions")).toBe(false);
    expect(
      filterDisplayThreadMemoryItems(
        ["what's your take", "carry one relevant thread forward"],
        "selfObservation"
      )
    ).toEqual(["carry one relevant thread forward"]);
  });

  it("preserves useful steering in display memory (case B)", () => {
    const display = buildDisplayThreadMemoryState({
      ...createEmptyRawLabThreadState(),
      userSteering: ["avoid reflexive handoff questions", "produce the artifact"]
    });
    expect(display.userSteering).toEqual([
      "avoid reflexive handoff questions",
      "produce the artifact"
    ]);
  });

  it("drops or normalizes malformed provisional stances (case C)", () => {
    expect(
      normalizeProvisionalStance("Provisional stance: exploring whether you're dumb")
    ).toBeNull();
    expect(
      normalizeProvisionalStance("Provisional stance: exploring whether i like luna")
    ).toBe("Potential temporary name candidate for Raw Lab: Luna.");
    expect(isMalformedProvisionalStance("Provisional stance: exploring whether foo")).toBe(true);
  });

  it("keeps compact doNotRepeat phrases while rejecting them elsewhere (case H)", () => {
    const phrases = ["what's next", "I'm all ears", "ready to see it?"];
    expect(filterDisplayThreadMemoryItems(phrases, "doNotRepeat")).toEqual([
      "what's next",
      "I'm all ears",
      "ready to see it?"
    ]);
    expect(filterDisplayThreadMemoryItems(phrases, "selfObservation")).toEqual([]);
    expect(filterDisplayThreadMemoryItems(phrases, "provisionalStance")).toEqual([]);
  });

  it("does not store generic user questions as revisit memory (case D)", () => {
    expect(isRawUserQuestionMemory("can we get the full script?")).toBe(true);
    const next = updateRawLabThreadStateAfterTurn({
      previous: createEmptyRawLabThreadState(),
      userMessage: "can we get the full script?",
      assistantAnswer: "Sure.",
      turns: [makeTurn("user", "can we get the full script?", 0)]
    });
    expect(next.questionsToRevisit).toEqual([]);
  });

  it("preserves distilled self-observations (case E)", () => {
    const display = buildDisplayThreadMemoryState({
      ...createEmptyRawLabThreadState(),
      selfObservations: [
        "I'm noticing I tend to ask permission when I should produce the next concrete artifact."
      ]
    });
    expect(display.selfObservations).toHaveLength(1);
    expect(display.selfObservations[0]).toContain("concrete artifact");
  });

  it("sanitizes reflection proposals before storage (case F)", () => {
    expect(sanitizeRawLabMemoryProposal("Got it, bro.", "selfObservation")).toBeNull();
    expect(
      sanitizeRawLabMemoryProposal(
        "I'm noticing I tend to ask permission when I should produce the next concrete artifact.",
        "selfObservation"
      )
    ).toContain("concrete artifact");
  });

  it("applies naming hygiene without user identity merge (case G)", () => {
    let state = createEmptyRawLabThreadState();
    state = addProvisionalStance(
      state,
      "Potential temporary name candidate for Raw Lab: Luna."
    );
    const display = buildDisplayThreadMemoryState(state);
    expect(display.provisionalStances[0]).toContain("Raw Lab");
    expect(display.provisionalStances.join(" ").toLowerCase()).not.toContain("user is luna");
  });

  it("buildDisplayThreadMemoryState does not mutate stored state", () => {
    let state = createEmptyRawLabThreadState();
    state = {
      ...state,
      selfObservations: ["Got it, bro."],
      userSteering: ["avoid reflexive handoff questions"],
      doNotRepeat: ["what's next"]
    };
    const before = JSON.stringify(state);
    buildDisplayThreadMemoryState(state);
    expect(JSON.stringify(state)).toBe(before);
    expect(state.selfObservations).toContain("Got it, bro.");
  });

  it("rawlab_019: distills thread mind at storage and wire while keeping recent_turns raw", () => {
    const substantiveLoop =
      "Still circling whether Raw Lab should feel alive through visible state or stronger persona prompting.";
    let state = createEmptyRawLabThreadState();
    state = {
      ...state,
      doNotRepeat: ["Got it, no handoffs.", "I hear you.", "entity sauce"],
      userSteering: ["avoid reflexive handoff questions", "I hear you."],
      selfObservations: ["Got it, bro.", "That's valid.", "I'm noticing I tend to ask permission."],
      openLoops: ["can you make it better", substantiveLoop],
      recurringTopics: ["identity/personality"]
    };

    const display = buildDisplayThreadMemoryState(state);
    expect(display.doNotRepeat).toEqual(["entity sauce"]);
    expect(display.userSteering).toEqual(["avoid reflexive handoff questions"]);
    expect(display.selfObservations).toEqual([
      "I'm noticing I tend to ask permission."
    ]);
    expect(display.openLoops).toHaveLength(2);
    expect(display.openLoops[0]).toContain("Still circling");
    expect(display.openLoops[1]).toBe(substantiveLoop);

    const wireMemory = buildWireThreadMemoryState(state);
    expect(wireMemory.doNotRepeat).toEqual(["Do not repeat: entity sauce"]);
    expect(wireMemory.userSteering).toEqual(["Steering: avoid reflexive handoff questions"]);
    expect(wireMemory.openLoops[0]).toMatch(/^Still circling:/i);
    expect(wireMemory.openLoops.join(" ").toLowerCase()).not.toContain("got it");
    expect(wireMemory.openLoops.join(" ").toLowerCase()).not.toContain("i hear you");

    const turns: RawLabTurn[] = [
      makeTurn("user", "can you make it better", 0),
      makeTurn("assistant", "Got it, no handoffs. I hear you.", 1)
    ];
    const payload = buildRawLabConversationPayload({
      turns,
      threadState: state,
      latestMessage: "still thinking"
    });
    expect(payload.recent_turns[1]?.content).toContain("Got it, no handoffs");
    expect(payload.thread_state.do_not_repeat).toEqual(["Do not repeat: entity sauce"]);
    expect(payload.thread_state.open_loops.join(" ").toLowerCase()).not.toContain("can you make it better");
  });

  it("rawlab_019: updateRawLabThreadStateAfterTurn skips assistant-derived doNotRepeat", () => {
    const next = updateRawLabThreadStateAfterTurn({
      previous: createEmptyRawLabThreadState(),
      userMessage: "Make it shorter",
      assistantAnswer: `${"Got it, bro. ".repeat(20)}Happy to help.`,
      turns: [
        makeTurn("user", "Make it shorter", 0),
        makeTurn("assistant", `${"Got it, bro. ".repeat(20)}Happy to help.`, 1)
      ]
    });
    expect(next.doNotRepeat).toEqual([]);
  });

  it("rejects expanded assistant filler patterns (rawlab_019)", () => {
    expect(isNoisyRawLabAssistantSnippet("I hear you.")).toBe(true);
    expect(isNoisyRawLabAssistantSnippet("That's valid.")).toBe(true);
    expect(isNoisyRawLabAssistantSnippet("You're absolutely right.")).toBe(true);
    expect(isNoisyRawLabAssistantSnippet("Happy to help.")).toBe(true);
  });

  it("distills thin open loops but preserves substantive tension", () => {
    expect(isThinVagueOpenLoop("can you make it better")).toBe(true);
    expect(
      isSubstantiveOpenLoop(
        "Still circling whether Raw Lab should feel alive through visible state or stronger persona prompting."
      )
    ).toBe(true);
    const distilled = distillOpenLoop("can you make it better", {
      recurringTopics: ["identity/personality"]
    });
    expect(distilled).toContain("Still circling");
    expect(distilled?.toLowerCase()).not.toContain("can you make it better");
  });

  it("P1-001: captures no-handoff steering without raw open-loop leak", () => {
    const userMessage =
      "stop asking me what i want next or what's on my mind. when i say that, don't just acknowledge it and then ask another question. carry the thread forward declaratively.";
    const capture = detectRawLabNoHandoffSteering(userMessage);
    expect(capture.userSteering).toEqual([
      "avoid reflexive handoff questions",
      "carry the thread forward declaratively"
    ]);
    expect(capture.doNotRepeat).toEqual([
      "what's next?",
      "what's on your mind?",
      "your move?",
      "ready to dive in?"
    ]);

    const next = updateRawLabThreadStateAfterTurn({
      previous: createEmptyRawLabThreadState(),
      userMessage,
      assistantAnswer: "Got it. The next beat is mine to carry.",
      turns: [makeTurn("user", userMessage, 0), makeTurn("assistant", "Got it.", 1)]
    });
    const display = buildDisplayThreadMemoryState(next);
    expect(display.userSteering).toEqual(
      expect.arrayContaining([
        "avoid reflexive handoff questions",
        "carry the thread forward declaratively"
      ])
    );
    expect(display.userSteering).toHaveLength(2);
    expect(display.doNotRepeat).toEqual(
      expect.arrayContaining(["what's next?", "what's on your mind?", "your move?", "ready to dive in?"])
    );
    expect(display.openLoops).toEqual([]);
    expect(JSON.stringify(display).toLowerCase()).not.toContain("got it");
    expect(JSON.stringify(display).toLowerCase()).not.toContain("i hear you");
  });

  it("P1-002: rebuilds currentVibe without removed filler steering", () => {
    let state = createEmptyRawLabThreadState();
    state = {
      ...state,
      userSteering: ["avoid reflexive handoff questions", "I hear you."],
      currentVibe: "Current vibe in this chat: steered toward avoid reflexive handoff questions, I hear you.."
    };
    state = updateRawLabThreadStateAfterTurn({
      previous: state,
      userMessage: "noop",
      assistantAnswer: "ok",
      turns: []
    });
    const display = buildDisplayThreadMemoryState(state);
    expect(display.userSteering).toEqual(["avoid reflexive handoff questions"]);
    expect(display.currentVibe.toLowerCase()).not.toContain("i hear you");
    expect(display.currentVibe.toLowerCase()).toContain("avoid reflexive handoff questions");
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
