import { describe, expect, it } from "vitest";

import { buildProofShelfEntries } from "./proof";
import type { LifeCard, LifeLogEntry, ProofItem } from "./types";

const cards: LifeCard[] = [
  {
    id: "life-harness",
    title: "Life Harness",
    area: "build",
    state: "active",
    progress: 10,
    warmth: "hot",
    nextTinyAction: "Scaffold",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: []
  }
];

const logs: LifeLogEntry[] = [
  {
    id: "log-pounce",
    timestamp: "2026-06-09T10:00:00.000Z",
    rawText: "pounce",
    area: "build",
    type: "pounce",
    xp: 10
  },
  {
    id: "log-mvd",
    timestamp: "2026-06-08T10:00:00.000Z",
    rawText: "mvd",
    area: "body",
    type: "mvd",
    xp: 30
  }
];

const proofItems: ProofItem[] = [
  {
    id: "proof-old",
    timestamp: "2026-06-08T12:00:00.000Z",
    title: "Preserved the day.",
    area: "body",
    sourceLogId: "log-mvd"
  },
  {
    id: "proof-new",
    timestamp: "2026-06-09T11:00:00.000Z",
    title: "Started pounce mission.",
    area: "build",
    cardId: "life-harness",
    sourceLogId: "log-pounce"
  }
];

describe("buildProofShelfEntries", () => {
  it("sorts newest first", () => {
    const entries = buildProofShelfEntries(proofItems, cards, logs);
    expect(entries[0].id).toBe("proof-new");
    expect(entries[1].id).toBe("proof-old");
  });

  it("classifies rescue kind from source log type", () => {
    const entries = buildProofShelfEntries(proofItems, cards, logs);
    expect(entries.find((e) => e.id === "proof-new")?.rescueKind).toBe("pounce");
    expect(entries.find((e) => e.id === "proof-old")?.rescueKind).toBe("mvd");
  });

  it("attaches card title", () => {
    const entries = buildProofShelfEntries(proofItems, cards, logs);
    expect(entries.find((e) => e.id === "proof-new")?.cardTitle).toBe("Life Harness");
  });
});
