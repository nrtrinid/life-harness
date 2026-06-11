import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import type { LifeHarnessData } from "./actions";
import {
  buildAgentSessionCreateInputFromTaskPacket,
  buildAgentTaskPacket,
  buildDefaultAgentTaskPacketInput,
  deriveTaskName,
  formatAgentTaskPacketMarkdown,
  resolveDefaultTaskGoal,
  truncatePacketExcerpt
} from "./agentTaskPacket";
import type { LifeCard } from "./types";

const FIXED_NOW = new Date("2026-06-09T12:00:00.000Z");

function baseData(overrides: Partial<LifeHarnessData> = {}): LifeHarnessData {
  return {
    ...createSeedState(FIXED_NOW.toISOString()),
    ...overrides
  };
}

function fixtureBuildCard(overrides: Partial<LifeCard> = {}): LifeCard {
  return {
    id: "card-build-test",
    title: "Momentum Board v0.1",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    whyItMatters: "Ship the integration spine.",
    nextTinyAction: "Add card-scoped context packet.",
    doneForNow: "Packet builder drafted.",
    doLane: "Wire copy action on card detail.",
    improveLane: "Do not add sprint tracker in this PR.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    ...overrides
  };
}

describe("agentTaskPacket", () => {
  it("builds a packet for a normal card", () => {
    const card = fixtureBuildCard();
    const result = buildAgentTaskPacket(baseData({ cards: [card] }), {
      cardId: card.id,
      goal: "Ship agent task packet v0.1.",
      now: FIXED_NOW
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.packet.packetVersion).toBe("0.1");
    expect(result.packet.cardId).toBe(card.id);
    expect(result.packet.goal).toBe("Ship agent task packet v0.1.");
    expect(result.markdown).toContain("# Agent Task Packet —");
  });

  it("embeds the card context markdown", () => {
    const card = fixtureBuildCard();
    const result = buildAgentTaskPacket(baseData({ cards: [card] }), {
      cardId: card.id,
      goal: "Ship agent task packet v0.1.",
      now: FIXED_NOW
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.markdown).toContain("## Existing context");
    expect(result.markdown).toContain("# Agent Context — Momentum Board v0.1");
    expect(result.markdown).toContain("**Purpose:** Paste this into Codex/Cursor");
    expect(result.packet.cardContextMarkdown).toContain(card.id);
  });

  it("uses nextTinyAction as the default goal when available", () => {
    const card = fixtureBuildCard({ nextTinyAction: "Wire the copy button." });
    expect(resolveDefaultTaskGoal(card)).toBe("Wire the copy button.");

    const fallbackCard = fixtureBuildCard({
      nextTinyAction: "",
      improveLane: "Do not add sprint tracker."
    });
    expect(resolveDefaultTaskGoal(fallbackCard)).toBe("Do not add sprint tracker.");

    const bareCard = fixtureBuildCard({
      nextTinyAction: "",
      improveLane: undefined
    });
    expect(resolveDefaultTaskGoal(bareCard)).toBe("Make focused progress on this card.");
  });

  it("does not invent verification commands", () => {
    const card = fixtureBuildCard();
    const result = buildAgentTaskPacket(baseData({ cards: [card] }), {
      cardId: card.id,
      goal: "Ship agent task packet v0.1.",
      verificationCommands: [],
      now: FIXED_NOW
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.packet.verificationCommands).toEqual([]);
    expect(result.markdown).toContain("## Verification");
    expect(result.markdown).toContain("(not specified)");
    expect(result.markdown).not.toContain("npm test");
  });

  it("includes file hints when provided", () => {
    const card = fixtureBuildCard();
    const result = buildAgentTaskPacket(baseData({ cards: [card] }), {
      cardId: card.id,
      goal: "Ship agent task packet v0.1.",
      fileHints: ["src/core/agentTaskPacket.ts", "app/card/[id].tsx"],
      now: FIXED_NOW
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.markdown).toContain("## Likely files");
    expect(result.markdown).toContain("- src/core/agentTaskPacket.ts");
    expect(result.markdown).toContain("- app/card/[id].tsx");
    expect(result.markdown).not.toContain("## Likely files\n(not specified)");
  });

  it("includes extra constraints when provided", () => {
    const card = fixtureBuildCard();
    const result = buildAgentTaskPacket(baseData({ cards: [card] }), {
      cardId: card.id,
      goal: "Ship agent task packet v0.1.",
      extraConstraints: ["Stay scoped to this card."],
      now: FIXED_NOW
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.packet.constraints).toContain("Stay scoped to this card.");
    expect(result.markdown).toContain("- Stay scoped to this card.");
  });

  it("returns a safe error for a missing card", () => {
    const result = buildAgentTaskPacket(baseData(), {
      cardId: "missing-card",
      goal: "Do the thing."
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("Card not found");
  });

  it("blocks S3 cards through the card context builder", () => {
    const card = fixtureBuildCard({ sensitivity: "S3" });
    const result = buildAgentTaskPacket(baseData({ cards: [card] }), {
      cardId: card.id,
      goal: "Do the thing."
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("S3");
  });

  it("has stable markdown section order", () => {
    const card = fixtureBuildCard();
    const result = buildAgentTaskPacket(baseData({ cards: [card] }), {
      cardId: card.id,
      taskName: "Work on Momentum Board v0.1",
      goal: "Ship agent task packet v0.1.",
      now: FIXED_NOW
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const markdown = formatAgentTaskPacketMarkdown(result.packet);
    expect(markdown).toBe(result.markdown);

    const taskIndex = markdown.indexOf("## Task");
    const targetIndex = markdown.indexOf("## Target card");
    const contextIndex = markdown.indexOf("## Existing context");
    const filesIndex = markdown.indexOf("## Likely files");
    const tail = markdown.slice(filesIndex);

    expect(taskIndex).toBeGreaterThan(-1);
    expect(targetIndex).toBeGreaterThan(taskIndex);
    expect(contextIndex).toBeGreaterThan(targetIndex);
    expect(filesIndex).toBeGreaterThan(contextIndex);

    const acceptanceIndex = tail.indexOf("## Acceptance criteria");
    const verificationIndex = tail.indexOf("## Verification\n");
    const constraintsIndex = tail.indexOf("## Constraints\n");

    expect(acceptanceIndex).toBeGreaterThan(-1);
    expect(verificationIndex).toBeGreaterThan(acceptanceIndex);
    expect(constraintsIndex).toBeGreaterThan(verificationIndex);
  });

  it("does not include unrelated cards", () => {
    const target = fixtureBuildCard({ id: "card-target", title: "Target Card Only" });
    const other = fixtureBuildCard({ id: "card-other", title: "Unrelated Other Card" });
    const result = buildAgentTaskPacket(baseData({ cards: [target, other] }), {
      cardId: target.id,
      goal: "Ship agent task packet v0.1.",
      now: FIXED_NOW
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.markdown).toContain("Target Card Only");
    expect(result.markdown).not.toContain("Unrelated Other Card");
  });

  it("derives task name from card title and goal when omitted", () => {
    expect(deriveTaskName("Momentum Board v0.1", "Ship agent task packet v0.1.")).toBe(
      "Momentum Board v0.1 — Ship agent task packet v0.1."
    );
  });

  it("builds default input from card detail defaults", () => {
    const card = fixtureBuildCard();
    const input = buildDefaultAgentTaskPacketInput(card);

    expect(input.taskName).toBe("Work on Momentum Board v0.1");
    expect(input.goal).toBe("Add card-scoped context packet.");
    expect(input.extraConstraints).toEqual(["Stay scoped to this card."]);
    expect(input.fileHints).toBeUndefined();
    expect(input.verificationCommands).toBeUndefined();
  });

  it("uses project likelyFiles and verificationCommands when input omits them", () => {
    const card = fixtureBuildCard();
    const data = baseData({
      cards: [card],
      projects: [
        {
          id: "project-target",
          cardId: card.id,
          name: card.title,
          repoPath: "C:/Users/me/Projects/life-harness",
          branch: "main",
          likelyFiles: ["src/core/projectRegistry.ts"],
          verificationCommands: ["npm test -- projectRegistry"],
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString()
        }
      ]
    });

    const result = buildAgentTaskPacket(data, {
      cardId: card.id,
      goal: "Ship project registry lite.",
      now: FIXED_NOW
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.packet.fileHints).toEqual(["src/core/projectRegistry.ts"]);
    expect(result.packet.verificationCommands).toEqual(["npm test -- projectRegistry"]);
    expect(result.markdown).toContain("- src/core/projectRegistry.ts");
    expect(result.markdown).toContain("- npm test -- projectRegistry");
    expect(result.markdown).toContain("## Project context");
    expect(result.markdown).toContain("- Repo: C:/Users/me/Projects/life-harness");
    expect(result.markdown).toContain("- Target branch: main");
    expect(result.packet.constraints).toContain("Work in repo: C:/Users/me/Projects/life-harness");
    expect(result.packet.constraints).toContain("Target branch: main");
  });

  it("keeps explicit empty fileHints and verificationCommands", () => {
    const card = fixtureBuildCard();
    const data = baseData({
      cards: [card],
      projects: [
        {
          id: "project-target",
          cardId: card.id,
          name: card.title,
          likelyFiles: ["src/core/projectRegistry.ts"],
          verificationCommands: ["npm test -- projectRegistry"],
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString()
        }
      ]
    });

    const result = buildAgentTaskPacket(data, {
      cardId: card.id,
      goal: "Ship project registry lite.",
      fileHints: [],
      verificationCommands: [],
      now: FIXED_NOW
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.packet.fileHints).toEqual([]);
    expect(result.packet.verificationCommands).toEqual([]);
    expect(result.markdown).toContain("## Likely files\n(not specified)");
    expect(result.markdown).toContain("## Verification\n(not specified)");
  });

  it("includes agent session context through embedded card context", () => {
    const card = fixtureBuildCard();
    const data = baseData({
      cards: [card],
      agentSessions: [
        {
          id: "session-target",
          cardId: card.id,
          agent: "codex",
          status: "done",
          taskName: "Ship agent session log",
          goal: "Add session tracking.",
          resultSummary: "Tests pass.",
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString()
        }
      ]
    });

    const result = buildAgentTaskPacket(data, {
      cardId: card.id,
      goal: "Ship agent session log.",
      now: FIXED_NOW
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.markdown).toContain("## Existing context");
    expect(result.markdown).toContain("## Agent sessions");
    expect(result.markdown).toContain("Ship agent session log");
  });
});

describe("truncatePacketExcerpt", () => {
  it("returns text unchanged when within max length", () => {
    expect(truncatePacketExcerpt("short packet", 500)).toBe("short packet");
  });

  it("truncates with ellipsis when text exceeds max length", () => {
    const text = "a".repeat(10);
    expect(truncatePacketExcerpt(text, 5)).toBe("aaaa…");
  });
});

describe("buildAgentSessionCreateInputFromTaskPacket", () => {
  it("maps packet fields into a sent-session create input", () => {
    const card = fixtureBuildCard();
    const data = baseData({
      cards: [card],
      projects: [
        {
          id: "project-target",
          cardId: card.id,
          name: card.title,
          verificationCommands: ["npm test -- agentTaskPacket"],
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString()
        }
      ]
    });
    const packetResult = buildAgentTaskPacket(data, {
      cardId: card.id,
      goal: "Ship copy + log sent.",
      now: FIXED_NOW
    });

    expect(packetResult.ok).toBe(true);
    if (!packetResult.ok) {
      return;
    }

    const input = buildAgentSessionCreateInputFromTaskPacket(
      packetResult.packet,
      packetResult.markdown
    );

    expect(input.cardId).toBe(card.id);
    expect(input.agent).toBe("codex");
    expect(input.taskName).toBe(packetResult.packet.taskName);
    expect(input.goal).toBe("Ship copy + log sent.");
    expect(input.verificationCommands).toEqual(["npm test -- agentTaskPacket"]);
    expect(input.promptExcerpt).toBe(truncatePacketExcerpt(packetResult.markdown));
    expect(input.resultSummary).toBeUndefined();
    expect(input.filesChanged).toBeUndefined();
    expect(input.verificationResult).toBeUndefined();
    expect(input.commitHash).toBeUndefined();
    expect(input.followUps).toBeUndefined();
  });

  it("truncates prompt excerpt for large packet markdown", () => {
    const card = fixtureBuildCard();
    const packetResult = buildAgentTaskPacket(baseData({ cards: [card] }), {
      cardId: card.id,
      goal: "Ship copy + log sent.",
      now: FIXED_NOW
    });

    expect(packetResult.ok).toBe(true);
    if (!packetResult.ok) {
      return;
    }

    const longMarkdown = "x".repeat(600);
    const input = buildAgentSessionCreateInputFromTaskPacket(
      packetResult.packet,
      longMarkdown,
      { promptExcerptMaxLength: 20 }
    );

    expect(input.promptExcerpt).toBe(`${"x".repeat(19)}…`);
  });
});
