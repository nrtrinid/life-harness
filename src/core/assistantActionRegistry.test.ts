import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import type { LifeHarnessData } from "./actions";
import {
  applyConfirmedAssistantAction,
  applyUpdateNextTinyAction,
  buildAssistantProposalId,
  MAX_ASSISTANT_ACTIONS_PER_MESSAGE,
  parseAssistantProposedActions,
  stripAssistantActionBlocks,
  validateAssistantAction
} from "./assistantActionRegistry";
import type { LifeCard } from "./types";

const FIXED_NOW = "2026-06-09T12:00:00.000Z";

function fixtureCard(overrides: Partial<LifeCard> = {}): LifeCard {
  return {
    id: "card-build-test",
    title: "Momentum Board v0.1",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    whyItMatters: "Ship the integration spine.",
    nextTinyAction: "Add assistant action registry.",
    doneForNow: "Registry drafted.",
    doLane: "Wire proposal cards.",
    improveLane: "Do not add execution bridge.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    ...overrides
  };
}

function baseData(overrides: Partial<LifeHarnessData> = {}): LifeHarnessData {
  return {
    ...createSeedState(FIXED_NOW),
    cards: [fixtureCard()],
    ...overrides
  };
}

describe("validateAssistantAction", () => {
  it("accepts quick_capture with text", () => {
    const result = validateAssistantAction(baseData(), { type: "quick_capture", text: "new idea: sketch" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.risk).toBe("low");
    }
  });

  it("rejects empty quick_capture text", () => {
    const result = validateAssistantAction(baseData(), { type: "quick_capture", text: "  " });
    expect(result).toEqual({ ok: false, error: "Capture text is required." });
  });

  it("accepts log_win on a card", () => {
    const result = validateAssistantAction(baseData(), {
      type: "log_win",
      text: "wired proposal cards",
      cardId: "card-build-test"
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing card", () => {
    const result = validateAssistantAction(baseData(), {
      type: "park_card",
      cardId: "missing"
    });
    expect(result).toEqual({ ok: false, error: "Card not found." });
  });

  it("rejects S3 cards", () => {
    const data = baseData({ cards: [fixtureCard({ sensitivity: "S3" })] });
    const result = validateAssistantAction(data, {
      type: "update_next_tiny_action",
      cardId: "card-build-test",
      nextTinyAction: "nope"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("S3");
    }
  });

  it("rejects already parked cards", () => {
    const data = baseData({ cards: [fixtureCard({ state: "parked" })] });
    const result = validateAssistantAction(data, {
      type: "park_card",
      cardId: "card-build-test"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("parked");
    }
  });

  it("rejects create_agent_session without goal when card has none", () => {
    const data = baseData({ cards: [fixtureCard({ nextTinyAction: "" })] });
    const result = validateAssistantAction(data, {
      type: "create_agent_session",
      cardId: "card-build-test"
    });
    expect(result).toEqual({ ok: false, error: "Session goal is required." });
  });
});

describe("applyConfirmedAssistantAction", () => {
  it("quick_capture mutates via capture path", () => {
    const data = baseData();
    const result = applyConfirmedAssistantAction(data, {
      type: "quick_capture",
      text: "new idea: assistant registry"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.cards.length).toBeGreaterThan(data.cards.length);
      expect(result.data.logs[0]?.type).toBe("idea");
    }
  });

  it("log_win creates win log and proof on card", () => {
    const data = baseData();
    const result = applyConfirmedAssistantAction(data, {
      type: "log_win",
      text: "wired proposal cards",
      cardId: "card-build-test"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const winLog = result.data.logs.find((log) => log.type === "win");
      expect(winLog).toBeDefined();
      expect(winLog?.cardId).toBe("card-build-test");
      const card = result.data.cards.find((item) => item.id === "card-build-test");
      expect(card?.proofItemIds.length).toBeGreaterThan(0);
      const proof = result.data.proofItems.find((item) => item.id === card?.proofItemIds[0]);
      expect(proof?.cardId).toBe("card-build-test");
    }
  });

  it("applyUpdateNextTinyAction only mutates target card", () => {
    const other = fixtureCard({ id: "card-other", title: "Other card", nextTinyAction: "stay" });
    const data = baseData({ cards: [fixtureCard(), other] });
    const next = applyUpdateNextTinyAction(data, "card-build-test", "Ship registry", FIXED_NOW);
    expect(next.cards.find((card) => card.id === "card-build-test")?.nextTinyAction).toBe("Ship registry");
    expect(next.cards.find((card) => card.id === "card-other")?.nextTinyAction).toBe("stay");
  });

  it("park_card parks the card", () => {
    const data = baseData();
    const result = applyConfirmedAssistantAction(data, {
      type: "park_card",
      cardId: "card-build-test",
      reason: "blocked"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.cards.find((card) => card.id === "card-build-test")?.state).toBe("parked");
    }
  });

  it("create_agent_session adds a session", () => {
    const data = baseData();
    const result = applyConfirmedAssistantAction(data, {
      type: "create_agent_session",
      cardId: "card-build-test",
      goal: "Wire proposal cards"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.agentSessions).toHaveLength(1);
      expect(result.data.agentSessions[0]?.cardId).toBe("card-build-test");
    }
  });
});

describe("buildAssistantProposalId", () => {
  it("is stable for the same turn and action", () => {
    const action = { type: "quick_capture" as const, text: "new idea: test" };
    const first = buildAssistantProposalId("turn-1", 0, action);
    const second = buildAssistantProposalId("turn-1", 0, action);
    expect(first).toBe(second);
    expect(first.startsWith("turn-1/0/")).toBe(true);
  });

  it("differs when action index changes", () => {
    const action = { type: "quick_capture" as const, text: "new idea: test" };
    const first = buildAssistantProposalId("turn-1", 0, action);
    const second = buildAssistantProposalId("turn-1", 1, action);
    expect(first).not.toBe(second);
  });
});

describe("parseAssistantProposedActions", () => {
  it("parses a valid fenced block", () => {
    const text = `Here is a move.

\`\`\`assistant-actions
[
  { "type": "quick_capture", "text": "new idea: registry" },
  { "type": "park_card", "cardId": "card-build-test" }
]
\`\`\``;
    const actions = parseAssistantProposedActions(text);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({ type: "quick_capture", text: "new idea: registry" });
  });

  it("ignores invalid JSON", () => {
    const text = "```assistant-actions\nnot json\n```";
    expect(parseAssistantProposedActions(text)).toEqual([]);
  });

  it("ignores unknown action types", () => {
    const text = '```assistant-actions\n[{ "type": "delete_everything" }]\n```';
    expect(parseAssistantProposedActions(text)).toEqual([]);
  });

  it("caps actions at MAX_ASSISTANT_ACTIONS_PER_MESSAGE", () => {
    const items = Array.from({ length: 7 }, (_, index) => ({
      type: "quick_capture",
      text: `idea ${index}`
    }));
    const text = `\`\`\`assistant-actions\n${JSON.stringify(items)}\n\`\`\``;
    const actions = parseAssistantProposedActions(text);
    expect(actions).toHaveLength(MAX_ASSISTANT_ACTIONS_PER_MESSAGE);
  });

  it("returns empty for prose without fence", () => {
    expect(parseAssistantProposedActions("Just answer text.")).toEqual([]);
  });
});

describe("stripAssistantActionBlocks", () => {
  it("removes fenced blocks from display text", () => {
    const text = `Visible answer.

\`\`\`assistant-actions
[{ "type": "quick_capture", "text": "hidden" }]
\`\`\``;
    expect(stripAssistantActionBlocks(text)).toBe("Visible answer.");
  });
});
