import type { LifeHarnessData } from "./actions";
import {
  buildCardContextPacket,
  formatCardContextPacketMarkdown,
  type CardContextPacket
} from "./harnessContextGraph";
import type { LifeCard } from "./types";

export type AgentTaskPacketInput = {
  cardId: string;
  taskName?: string;
  goal: string;
  fileHints?: string[];
  verificationCommands?: string[];
  extraConstraints?: string[];
  now?: Date;
};

export interface AgentTaskPacket {
  packetVersion: "0.1";
  generatedAt: string;
  taskName: string;
  goal: string;
  cardId: string;
  cardTitle: string;
  cardStatus: string;
  cardKind: string;
  cardContext: CardContextPacket;
  cardContextMarkdown: string;
  fileHints: string[];
  verificationCommands: string[];
  acceptanceCriteria: string[];
  constraints: string[];
}

export type AgentTaskPacketBuildResult =
  | { ok: true; markdown: string; packet: AgentTaskPacket }
  | { ok: false; error: string };

const DEFAULT_TASK_CONSTRAINTS = [
  "Do not build outside this task.",
  "Do not add PC automation.",
  "Do not add autonomous AI actions.",
  "Do not mutate Life Harness state except through existing typed app/core flows.",
  "Keep UI thin and logic in src/core where practical."
] as const;

export function resolveDefaultTaskGoal(card: LifeCard): string {
  const nextTinyAction = card.nextTinyAction?.trim();
  if (nextTinyAction) {
    return nextTinyAction;
  }

  const improveLane = card.improveLane?.trim();
  if (improveLane) {
    return improveLane;
  }

  return "Make focused progress on this card.";
}

export function deriveTaskName(cardTitle: string, goal: string): string {
  const trimmedGoal = goal.trim();
  if (!trimmedGoal) {
    return `Work on ${cardTitle}`;
  }

  const combined = `${cardTitle} — ${trimmedGoal}`;
  if (combined.length <= 120) {
    return combined;
  }

  return `Work on ${cardTitle}`;
}

function buildAcceptanceCriteria(goal: string): string[] {
  return ["Complete the stated goal.", "Stay scoped to the target card.", `Goal: ${goal.trim()}`];
}

function buildTaskConstraints(
  cardContext: CardContextPacket,
  extraConstraints: string[] = []
): string[] {
  const merged = [
    ...DEFAULT_TASK_CONSTRAINTS,
    ...extraConstraints.map((constraint) => constraint.trim()).filter(Boolean)
  ];

  for (const constraint of cardContext.constraints) {
    if (!merged.includes(constraint)) {
      merged.push(constraint);
    }
  }

  return merged;
}

export function buildAgentTaskPacket(
  data: LifeHarnessData,
  input: AgentTaskPacketInput
): AgentTaskPacketBuildResult {
  const cardResult = buildCardContextPacket(data, input.cardId, { now: input.now });
  if (!cardResult.ok) {
    return { ok: false, error: cardResult.error };
  }

  const cardContext = cardResult.packet;
  const cardContextMarkdown = formatCardContextPacketMarkdown(cardContext);
  const goal = input.goal.trim();
  const taskName = input.taskName?.trim() || deriveTaskName(cardContext.title, goal);
  const fileHints = input.fileHints ?? [];
  const verificationCommands = input.verificationCommands ?? [];
  const generatedAt = (input.now ?? new Date()).toISOString();

  const packet: AgentTaskPacket = {
    packetVersion: "0.1",
    generatedAt,
    taskName,
    goal,
    cardId: cardContext.cardId,
    cardTitle: cardContext.title,
    cardStatus: cardContext.status,
    cardKind: cardContext.cardKind,
    cardContext,
    cardContextMarkdown,
    fileHints,
    verificationCommands,
    acceptanceCriteria: buildAcceptanceCriteria(goal),
    constraints: buildTaskConstraints(cardContext, input.extraConstraints)
  };

  return {
    ok: true,
    packet,
    markdown: formatAgentTaskPacketMarkdown(packet)
  };
}

function formatBulletSection(title: string, lines: string[]): string[] {
  return [title, ...lines, ""];
}

export function formatAgentTaskPacketMarkdown(packet: AgentTaskPacket): string {
  const lines: string[] = [
    `# Agent Task Packet — ${packet.taskName}`,
    "",
    "## Task",
    `Goal: ${packet.goal}`,
    "",
    "## Target card",
    `- ID: ${packet.cardId}`,
    `- Title: ${packet.cardTitle}`,
    `- Kind: ${packet.cardKind}`,
    `- Status: ${packet.cardStatus}`,
    `- Next action: ${packet.cardContext.nextTinyAction}`,
    "",
    "## Existing context",
    packet.cardContextMarkdown,
    "",
    ...formatBulletSection(
      "## Likely files",
      packet.fileHints.length > 0
        ? packet.fileHints.map((file) => `- ${file}`)
        : ["(not specified)"]
    ),
    ...formatBulletSection(
      "## Acceptance criteria",
      packet.acceptanceCriteria.map((criterion) => `- ${criterion}`)
    ),
    ...formatBulletSection(
      "## Verification",
      packet.verificationCommands.length > 0
        ? packet.verificationCommands.map((command) => `- ${command}`)
        : ["(not specified)"]
    ),
    ...formatBulletSection(
      "## Constraints",
      packet.constraints.map((constraint) => `- ${constraint}`)
    )
  ];

  return lines.join("\n").trimEnd();
}

export function buildDefaultAgentTaskPacketInput(card: LifeCard): AgentTaskPacketInput {
  return {
    cardId: card.id,
    taskName: `Work on ${card.title}`,
    goal: resolveDefaultTaskGoal(card),
    fileHints: [],
    verificationCommands: [],
    extraConstraints: ["Stay scoped to this card."]
  };
}
