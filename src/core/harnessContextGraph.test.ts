import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import type { LifeHarnessData } from "./lifeHarnessData";
import { createCareerApplicationCard } from "./career";
import {
  buildCardContextPacket,
  formatCardContextPacketMarkdown,
  isMemoryRelevantToCard,
  normalizeTitleSlug,
  prepareMemoryForPacket
} from "./harnessContextGraph";
import { createMemoryItem } from "./harnessMemoryBank";
import { createJobCandidate } from "./jobScout";
import { buildResumeDraftPacket } from "./resumeModuleBank";
import type { HarnessMemoryItem, LifeCard, LifeLogEntry, ProofItem } from "./types";

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
    proofItemIds: ["proof-build-1"],
    ...overrides
  };
}

describe("harnessContextGraph", () => {
  it("includes card identity and status in the packet", () => {
    const card = fixtureBuildCard();
    const data = baseData({ cards: [card] });
    const result = buildCardContextPacket(data, card.id, { now: FIXED_NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.packet.cardId).toBe(card.id);
    expect(result.packet.title).toBe(card.title);
    expect(result.packet.status).toBe("Active");
    expect(result.packet.nextTinyAction).toBe(card.nextTinyAction);
    expect(result.packet.rootNodeId).toBe(`life_card:${card.id}`);
    expect(result.packet.nodes[0]).toMatchObject({
      id: `life_card:${card.id}`,
      kind: "life_card"
    });
  });

  it("includes career and resume context for application cards", () => {
    const modules = baseData().resumeModules;
    const candidate = {
      ...createJobCandidate(
        {
          company: "Acme Corp",
          roleTitle: "Software Engineer",
          description: "Build reliable TypeScript services.",
          roleType: "software"
        },
        modules
      ),
      id: "candidate-acme",
      fitScore: 82,
      fitLabel: "strong" as const,
      fitReasons: ["TypeScript overlap"],
      gaps: ["Kubernetes"],
      recommendedResumeAngle: "Lead with systems work.",
      suggestedResumeModuleIds: ["resume-life-harness"]
    };
    const resumeDraftPacket = buildResumeDraftPacket(
      candidate,
      modules,
      FIXED_NOW.toISOString()
    );
    const card = {
      ...createCareerApplicationCard({
        company: "Acme Corp",
        roleTitle: "Software Engineer",
        jobDescription: "Build reliable services.",
        roleType: "software",
        jobCandidateId: candidate.id,
        resumeDraftPacket
      }),
      id: "card-career-acme"
    };

    const data = baseData({
      cards: [card],
      jobCandidates: [candidate]
    });
    const result = buildCardContextPacket(data, card.id, { now: FIXED_NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.packet.cardKind).toBe("career_application");
    expect(result.packet.careerContext).toMatchObject({
      company: "Acme Corp",
      roleTitle: "Software Engineer",
      resumeDraftNextAction: resumeDraftPacket.nextTinyAction
    });
    expect(result.packet.jobCandidate).toMatchObject({
      id: candidate.id,
      fitScore: 82,
      fitLabel: "strong"
    });
    expect(result.markdown).toContain("## Career application");
    expect(result.markdown).toContain("## Job candidate");
    expect(result.markdown).toContain("Build reliable services.");
    expect(result.markdown).toContain("## Untrusted: Job posting");
  });

  it("does not include unrelated cards in the packet", () => {
    const target = fixtureBuildCard({ id: "card-target", title: "Target Card Only" });
    const other = fixtureBuildCard({
      id: "card-other",
      title: "Unrelated Other Card",
      proofItemIds: []
    });
    const data = baseData({ cards: [target, other] });
    const result = buildCardContextPacket(data, target.id, { now: FIXED_NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.markdown).toContain("Target Card Only");
    expect(result.markdown).not.toContain("Unrelated Other Card");
    expect(result.packet.nodes.every((node) => !node.id.includes("card-other"))).toBe(true);
  });

  it("returns a safe error for a missing card", () => {
    const result = buildCardContextPacket(baseData(), "missing-card-id", { now: FIXED_NOW });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("Card not found");
    expect(result.error).toContain("missing-card-id");
  });

  it("blocks S3 cards from export", () => {
    const card = fixtureBuildCard({ sensitivity: "S3" });
    const result = buildCardContextPacket(baseData({ cards: [card] }), card.id, {
      now: FIXED_NOW
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("S3");
  });

  it("renders stable markdown with purpose and boundary header", () => {
    const card = fixtureBuildCard();
    const proof: ProofItem = {
      id: "proof-build-1",
      title: "Context packet tests added",
      timestamp: "2026-06-08T10:00:00.000Z",
      cardId: card.id,
      area: "build"
    };
    const log: LifeLogEntry = {
      id: "log-build-1",
      timestamp: "2026-06-08T09:00:00.000Z",
      rawText: "Drafted card context packet.",
      area: "build",
      cardId: card.id,
      type: "win",
      xp: 5
    };
    const data = baseData({
      cards: [card],
      proofItems: [proof],
      logs: [log]
    });
    const result = buildCardContextPacket(data, card.id, { now: FIXED_NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const markdown = formatCardContextPacketMarkdown(result.packet);
    expect(markdown).toBe(result.markdown);
    expect(markdown).toMatch(
      /^# Agent Context — Momentum Board v0\.1\n\n\*\*Purpose:\*\* Paste this into Codex\/Cursor/
    );
    expect(markdown).toContain(
      "**Boundary:** This packet is read-only context. Do not mutate Life Harness state directly."
    );
    expect(markdown).toContain("## Card");
    expect(markdown).toContain("- ID: card-build-test");
    expect(markdown).toContain("## Recent proof");
    expect(markdown).toContain("Context packet tests added");
    expect(markdown).toContain("## Recent logs");
    expect(markdown).toContain("Drafted card context packet.");
    expect(markdown).toContain("## Verification commands");
    expect(markdown.endsWith("(none)")).toBe(true);
  });

  it("omits memories without explicit tag or strong kind match", () => {
    const card = fixtureBuildCard();
    const fuzzyMemory = createMemoryItem(
      {
        kind: "pattern",
        title: "Momentum Board",
        summary: "Loosely related title overlap only.",
        tags: ["build"],
        isActive: true
      },
      FIXED_NOW.toISOString()
    );
    const taggedMemory = createMemoryItem(
      {
        kind: "pattern",
        title: "Scoped fact",
        summary: "Tagged to this card.",
        tags: [card.id],
        isActive: true
      },
      FIXED_NOW.toISOString()
    );

    expect(isMemoryRelevantToCard(fuzzyMemory, card)).toBe(false);
    expect(isMemoryRelevantToCard(taggedMemory, card)).toBe(true);

    const data = baseData({
      cards: [card],
      memoryItems: [fuzzyMemory, taggedMemory]
    });
    const result = buildCardContextPacket(data, card.id, { now: FIXED_NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.packet.memoryFacts).toHaveLength(1);
    expect(result.packet.memoryFacts[0]?.title).toBe("Scoped fact");
    expect(result.markdown).toContain("[pattern] Scoped fact");
    expect(result.markdown).not.toContain("Loosely related title overlap");
  });

  it("omits sensitive memories and redacts uncertain memory bodies", () => {
    const card = fixtureBuildCard();
    const sensitiveMemory = createMemoryItem(
      {
        kind: "project_fact",
        title: "Private note",
        summary: "therapy session notes should stay out",
        tags: [card.id],
        isActive: true
      },
      FIXED_NOW.toISOString()
    );
    const longBodyMemory = createMemoryItem(
      {
        kind: "project_fact",
        title: "Architecture decision",
        summary: "A".repeat(150),
        tags: [card.id],
        isActive: true
      },
      FIXED_NOW.toISOString()
    );

    expect(prepareMemoryForPacket(sensitiveMemory)).toEqual({ include: false });
    expect(prepareMemoryForPacket(longBodyMemory)).toMatchObject({
      include: true,
      title: "Architecture decision",
      summary: undefined
    });

    const data = baseData({
      cards: [card],
      memoryItems: [sensitiveMemory, longBodyMemory]
    });
    const result = buildCardContextPacket(data, card.id, { now: FIXED_NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.packet.memoryFacts).toHaveLength(1);
    expect(result.packet.memoryFacts[0]?.title).toBe("Architecture decision");
    expect(result.packet.memoryFacts[0]?.summary).toBeUndefined();
    expect(result.markdown).toContain("[project_fact] Architecture decision");
    expect(result.markdown).not.toContain("therapy");
    expect(result.markdown).not.toContain("A".repeat(20));
  });

  it("normalizes title slugs for exact tag matching", () => {
    expect(normalizeTitleSlug("Momentum Board v0.1")).toBe("momentum-board-v0-1");
  });

  it("includes project metadata only when present for the target card", () => {
    const target = fixtureBuildCard({ id: "card-target", title: "Target Card" });
    const other = fixtureBuildCard({ id: "card-other", title: "Other Card" });
    const data = baseData({
      cards: [target, other],
      projects: [
        {
          id: "project-other",
          cardId: other.id,
          name: "Other Project",
          repoPath: "C:/other",
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString()
        }
      ]
    });

    const withoutProject = buildCardContextPacket(data, target.id, { now: FIXED_NOW });
    expect(withoutProject.ok).toBe(true);
    if (!withoutProject.ok) {
      return;
    }
    expect(withoutProject.markdown).not.toContain("## Project");

    const withProject = buildCardContextPacket(
      {
        ...data,
        projects: [
          ...data.projects,
          {
            id: "project-target",
            cardId: target.id,
            name: "Target Project",
            repoPath: "C:/target",
            branch: "main",
            docs: ["docs/project-registry-lite-v0.1.md"],
            verificationCommands: ["npm test -- projectRegistry"],
            createdAt: FIXED_NOW.toISOString(),
            updatedAt: FIXED_NOW.toISOString()
          }
        ]
      },
      target.id,
      { now: FIXED_NOW }
    );

    expect(withProject.ok).toBe(true);
    if (!withProject.ok) {
      return;
    }

    expect(withProject.packet.projectContext?.projectId).toBe("project-target");
    expect(withProject.packet.verificationCommands).toEqual(["npm test -- projectRegistry"]);
    expect(withProject.markdown).toContain("## Project");
    expect(withProject.markdown).toContain("- Repo: C:/target");
    expect(withProject.markdown).toContain("- Verification: npm test -- projectRegistry");
    expect(withProject.markdown).not.toContain("C:/other");
  });

  it("includes agent sessions only for the target card", () => {
    const target = fixtureBuildCard({ id: "card-target", title: "Target Card" });
    const other = fixtureBuildCard({ id: "card-other", title: "Other Card" });
    const data = baseData({
      cards: [target, other],
      agentSessions: [
        {
          id: "session-other",
          cardId: other.id,
          agent: "cursor",
          status: "sent",
          taskName: "Other session",
          goal: "Other goal",
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString()
        }
      ]
    });

    const withoutSessions = buildCardContextPacket(data, target.id, { now: FIXED_NOW });
    expect(withoutSessions.ok).toBe(true);
    if (!withoutSessions.ok) {
      return;
    }
    expect(withoutSessions.markdown).not.toContain("## Agent sessions");

    const withSessions = buildCardContextPacket(
      {
        ...data,
        agentSessions: [
          ...data.agentSessions,
          {
            id: "session-target",
            cardId: target.id,
            agent: "codex",
            status: "done",
            taskName: "Ship agent session log",
            goal: "Add session tracking.",
            resultSummary: "Tests pass.",
            commitHash: "abc1234",
            completedAt: FIXED_NOW.toISOString(),
            createdAt: FIXED_NOW.toISOString(),
            updatedAt: FIXED_NOW.toISOString()
          }
        ]
      },
      target.id,
      { now: FIXED_NOW }
    );

    expect(withSessions.ok).toBe(true);
    if (!withSessions.ok) {
      return;
    }

    expect(withSessions.packet.recentAgentSessions).toHaveLength(1);
    expect(withSessions.markdown).toContain("## Agent sessions");
    expect(withSessions.markdown).toContain("codex · done · Ship agent session log");
    expect(withSessions.markdown).not.toContain("Other session");
  });

  it("still blocks S3 cards when project metadata exists", () => {
    const card = fixtureBuildCard({ sensitivity: "S3" });
    const data = baseData({
      cards: [card],
      projects: [
        {
          id: "project-s3",
          cardId: card.id,
          name: "Sensitive Project",
          repoPath: "C:/secret",
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString()
        }
      ]
    });

    const result = buildCardContextPacket(data, card.id, { now: FIXED_NOW });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("S3");
  });

  it("still blocks S3 cards when agent sessions exist", () => {
    const card = fixtureBuildCard({ sensitivity: "S3" });
    const data = baseData({
      cards: [card],
      agentSessions: [
        {
          id: "session-s3",
          cardId: card.id,
          agent: "codex",
          status: "done",
          taskName: "Sensitive session",
          goal: "Do sensitive work.",
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString()
        }
      ]
    });

    const result = buildCardContextPacket(data, card.id, { now: FIXED_NOW });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("S3");
  });
});
