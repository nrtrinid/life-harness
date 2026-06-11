import type { LifeHarnessData } from "./actions";
import { checkCareerUseBeforeImproveLocks } from "./career";
import { isSensitiveThreadLine } from "./chatThreadState";
import {
  redactLogSummary,
  shouldIncludeCard,
  shouldIncludeLog
} from "./contextPacketRedaction";
import {
  buildHarnessContextCard,
  HARNESS_STATIC_DECISIONS,
} from "./harnessContext";
import { getActiveMemoryItems } from "./harnessMemoryBank";
import { AREA_LABELS, CARD_STATE_LABELS } from "./labels";
import { buildApplicationResumeReadiness } from "./resumeReadiness";
import type {
  HarnessMemoryItem,
  HarnessMemoryKind,
  JobCandidate,
  LifeCard,
  LifeLogEntry,
  ProofItem
} from "./types";

const MAX_RECENT_LOGS = 8;
const MAX_RECENT_PROOF = 6;
const MAX_MEMORY_FACTS = 5;
const MEMORY_BODY_MAX_CHARS = 120;

const STRONG_MEMORY_KINDS: HarnessMemoryKind[] = ["project_fact", "decision", "rule"];

export type HarnessContextNode =
  | {
      id: `life_card:${string}`;
      kind: "life_card";
      cardId: string;
      title: string;
      area: string;
      state: string;
      nextTinyAction: string;
    }
  | {
      id: `career_application:${string}`;
      kind: "career_application";
      company: string;
      roleTitle: string;
      status: string;
    }
  | {
      id: `job_candidate:${string}`;
      kind: "job_candidate";
      fitScore: number;
      fitLabel?: string;
    }
  | {
      id: `memory_fact:${string}`;
      kind: "memory_fact";
      title: string;
      memoryKind: HarnessMemoryKind;
      summary?: string;
    }
  | {
      id: `proof_ref:${string}`;
      kind: "proof_ref";
      title: string;
      timestamp: string;
    }
  | {
      id: `log_ref:${string}`;
      kind: "log_ref";
      summary: string;
      timestamp: string;
    };

export type CardContextPacketKind =
  | "career_application"
  | "build"
  | "body"
  | "money_independence"
  | "social_career"
  | "stability_vices";

export interface CardContextCareerSummary {
  company: string;
  roleTitle: string;
  applicationStatus: string;
  resumeAngle?: string;
  projectsToEmphasize?: string;
  followUpDate?: string;
  resumeDraftNextAction?: string;
  readinessStatus?: string;
  readinessNextAction?: string;
}

export interface CardContextJobCandidateSummary {
  id: string;
  company: string;
  roleTitle: string;
  fitScore: number;
  fitLabel?: string;
  fitReasons: string[];
  gaps: string[];
  recommendedResumeAngle?: string;
}

export interface CardContextProofSummary {
  id: string;
  title: string;
  timestamp: string;
}

export interface CardContextLogSummary {
  id: string;
  summary: string;
  timestamp: string;
  type: string;
}

export interface CardContextMemorySummary {
  id: string;
  kind: HarnessMemoryKind;
  title: string;
  summary?: string;
}

export interface CardContextPacket {
  packetVersion: "0.2";
  generatedAt: string;
  cardId: string;
  rootNodeId: `life_card:${string}`;
  cardKind: CardContextPacketKind;
  title: string;
  status: string;
  nextTinyAction: string;
  nodes: HarnessContextNode[];
  careerContext?: CardContextCareerSummary;
  jobCandidate?: CardContextJobCandidateSummary;
  recentProof: CardContextProofSummary[];
  recentLogs: CardContextLogSummary[];
  memoryFacts: CardContextMemorySummary[];
  constraints: string[];
  verificationCommands: string[];
}

export type CardContextPacketBuildResult =
  | { ok: true; packet: CardContextPacket; markdown: string }
  | { ok: false; error: string };

export function normalizeTitleSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveCardKind(card: LifeCard): CardContextPacketKind {
  if (card.careerApplication) {
    return "career_application";
  }
  return card.area;
}

function cardDisplayTitle(card: LifeCard): string {
  return buildHarnessContextCard(card).title;
}

export function isMemoryRelevantToCard(memory: HarnessMemoryItem, card: LifeCard): boolean {
  const titleSlug = normalizeTitleSlug(card.title);

  if (memory.tags.some((tag) => tag === card.id)) {
    return true;
  }

  if (memory.tags.some((tag) => tag === titleSlug)) {
    return true;
  }

  if (!STRONG_MEMORY_KINDS.includes(memory.kind)) {
    return false;
  }

  const memoryTitle = memory.title.trim().toLowerCase();
  const cardTitle = card.title.trim().toLowerCase();

  if (memoryTitle === cardTitle) {
    return true;
  }

  if (card.careerApplication) {
    const careerTitle = `${card.careerApplication.company} — ${card.careerApplication.roleTitle}`
      .trim()
      .toLowerCase();
    if (memoryTitle === careerTitle) {
      return true;
    }

    const companySlug = normalizeTitleSlug(card.careerApplication.company);
    if (memory.tags.some((tag) => tag === companySlug)) {
      return true;
    }
  }

  return false;
}

export function prepareMemoryForPacket(
  memory: HarnessMemoryItem
): { include: false } | { include: true; title: string; kind: HarnessMemoryKind; summary?: string } {
  if (isSensitiveThreadLine(memory.title) || isSensitiveThreadLine(memory.summary)) {
    return { include: false };
  }

  const trimmedSummary = memory.summary.trim();
  const includeBody =
    trimmedSummary.length > 0 &&
    trimmedSummary.length <= MEMORY_BODY_MAX_CHARS &&
    !isMemoryBodyUncertain(memory);

  return {
    include: true,
    title: memory.title,
    kind: memory.kind,
    summary: includeBody ? trimmedSummary : undefined
  };
}

function isMemoryBodyUncertain(memory: HarnessMemoryItem): boolean {
  if (memory.summary.length > MEMORY_BODY_MAX_CHARS) {
    return true;
  }

  if (["trap", "identity", "pattern", "preference"].includes(memory.kind)) {
    return true;
  }

  return false;
}

function gatherCardProof(card: LifeCard, proofItems: ProofItem[]): ProofItem[] {
  const byId = new Map(proofItems.map((proof) => [proof.id, proof]));
  const seen = new Set<string>();
  const gathered: ProofItem[] = [];

  for (const proofId of card.proofItemIds) {
    const proof = byId.get(proofId);
    if (proof && !seen.has(proof.id)) {
      seen.add(proof.id);
      gathered.push(proof);
    }
  }

  for (const proof of proofItems) {
    if (proof.cardId === card.id && !seen.has(proof.id)) {
      seen.add(proof.id);
      gathered.push(proof);
    }
  }

  return gathered
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, MAX_RECENT_PROOF);
}

function gatherCardLogs(card: LifeCard, logs: LifeLogEntry[]): LifeLogEntry[] {
  return logs
    .filter((log) => log.cardId === card.id && shouldIncludeLog(log))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, MAX_RECENT_LOGS);
}

function gatherCardMemories(card: LifeCard, memoryItems: HarnessMemoryItem[]): HarnessMemoryItem[] {
  return getActiveMemoryItems(memoryItems)
    .filter((memory) => isMemoryRelevantToCard(memory, card))
    .slice(0, MAX_MEMORY_FACTS);
}

function buildConstraints(data: LifeHarnessData, card: LifeCard): string[] {
  const constraints: string[] = [];

  for (const decision of HARNESS_STATIC_DECISIONS.slice(0, 4)) {
    constraints.push(decision.summary);
  }

  const improveLane = card.improveLane?.trim();
  if (improveLane && /do not/i.test(improveLane)) {
    constraints.push(improveLane);
  }

  const locks = checkCareerUseBeforeImproveLocks(
    data.cards,
    data.logs,
    data.jobCandidates,
    data.jobSourceRuns
  );

  for (const lock of locks) {
    if ("notSupported" in lock && lock.notSupported) {
      continue;
    }
    if (lock.current < lock.required) {
      constraints.push(`${lock.label} locked: ${lock.current}/${lock.required} progress.`);
    }
  }

  return constraints;
}

function buildJobCandidateSummary(candidate: JobCandidate): CardContextJobCandidateSummary {
  return {
    id: candidate.id,
    company: candidate.company,
    roleTitle: candidate.roleTitle,
    fitScore: candidate.fitScore,
    fitLabel: candidate.fitLabel,
    fitReasons: candidate.fitReasons.slice(0, 4),
    gaps: candidate.gaps.slice(0, 4),
    recommendedResumeAngle: candidate.recommendedResumeAngle
  };
}

export function buildCardContextPacket(
  data: LifeHarnessData,
  cardId: string,
  options: { now?: Date } = {}
): CardContextPacketBuildResult {
  const card = data.cards.find((item) => item.id === cardId);
  if (!card) {
    return { ok: false, error: `Card not found: ${cardId}` };
  }

  if (!shouldIncludeCard(card)) {
    return { ok: false, error: "S3 cards cannot be exported as agent context." };
  }

  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const harnessCard = buildHarnessContextCard(card);
  const nodes: HarnessContextNode[] = [
    {
      id: `life_card:${card.id}`,
      kind: "life_card",
      cardId: card.id,
      title: harnessCard.title,
      area: harnessCard.area,
      state: harnessCard.state,
      nextTinyAction: harnessCard.next_tiny_action
    }
  ];

  let careerContext: CardContextCareerSummary | undefined;
  let jobCandidateSummary: CardContextJobCandidateSummary | undefined;

  if (card.careerApplication) {
    const application = card.careerApplication;
    nodes.push({
      id: `career_application:${card.id}`,
      kind: "career_application",
      company: application.company,
      roleTitle: application.roleTitle,
      status: CARD_STATE_LABELS[application.applicationStatus]
    });

    const linkedCandidate = application.jobCandidateId
      ? data.jobCandidates.find((candidate) => candidate.id === application.jobCandidateId)
      : undefined;

    const readiness = buildApplicationResumeReadiness({
      card,
      resumeModules: data.resumeModules,
      jobCandidate: linkedCandidate,
      careerSourcePack: data.careerSourcePack?.pack
    });

    careerContext = {
      company: application.company,
      roleTitle: application.roleTitle,
      applicationStatus: CARD_STATE_LABELS[application.applicationStatus],
      resumeAngle: application.resumeAngle,
      projectsToEmphasize: application.projectsToEmphasize,
      followUpDate: application.followUpDate,
      resumeDraftNextAction: application.resumeDraftPacket?.nextTinyAction,
      readinessStatus: readiness.status,
      readinessNextAction: readiness.nextTinyResumeAction
    };

    if (linkedCandidate) {
      jobCandidateSummary = buildJobCandidateSummary(linkedCandidate);
      nodes.push({
        id: `job_candidate:${linkedCandidate.id}`,
        kind: "job_candidate",
        fitScore: linkedCandidate.fitScore,
        fitLabel: linkedCandidate.fitLabel
      });
    }
  }

  const recentProofItems = gatherCardProof(card, data.proofItems);
  const recentProof: CardContextProofSummary[] = recentProofItems.map((proof) => ({
    id: proof.id,
    title: proof.title,
    timestamp: proof.timestamp
  }));

  for (const proof of recentProofItems) {
    nodes.push({
      id: `proof_ref:${proof.id}`,
      kind: "proof_ref",
      title: proof.title,
      timestamp: proof.timestamp
    });
  }

  const cardLogs = gatherCardLogs(card, data.logs);
  const recentLogs: CardContextLogSummary[] = cardLogs.map((log) => ({
    id: log.id,
    summary: redactLogSummary(log, harnessCard.title),
    timestamp: log.timestamp,
    type: log.type
  }));

  for (const log of cardLogs) {
    nodes.push({
      id: `log_ref:${log.id}`,
      kind: "log_ref",
      summary: redactLogSummary(log, harnessCard.title),
      timestamp: log.timestamp
    });
  }

  const memoryFacts: CardContextMemorySummary[] = [];
  for (const memory of gatherCardMemories(card, data.memoryItems)) {
    const prepared = prepareMemoryForPacket(memory);
    if (!prepared.include) {
      continue;
    }

    memoryFacts.push({
      id: memory.id,
      kind: prepared.kind,
      title: prepared.title,
      summary: prepared.summary
    });

    nodes.push({
      id: `memory_fact:${memory.id}`,
      kind: "memory_fact",
      title: prepared.title,
      memoryKind: prepared.kind,
      summary: prepared.summary
    });
  }

  const packet: CardContextPacket = {
    packetVersion: "0.2",
    generatedAt,
    cardId: card.id,
    rootNodeId: `life_card:${card.id}`,
    cardKind: resolveCardKind(card),
    title: harnessCard.title,
    status: harnessCard.state,
    nextTinyAction: harnessCard.next_tiny_action,
    nodes,
    careerContext,
    jobCandidate: jobCandidateSummary,
    recentProof,
    recentLogs,
    memoryFacts,
    constraints: buildConstraints(data, card),
    verificationCommands: []
  };

  return {
    ok: true,
    packet,
    markdown: formatCardContextPacketMarkdown(packet)
  };
}

function formatListSection(title: string, lines: string[]): string[] {
  if (lines.length === 0) {
    return [];
  }

  return [title, ...lines, ""];
}

export function formatCardContextPacketMarkdown(packet: CardContextPacket): string {
  const lines: string[] = [
    `# Agent Context — ${packet.title}`,
    "",
    "**Purpose:** Paste this into Codex/Cursor as context for work related to this card.",
    "**Boundary:** This packet is read-only context. Do not mutate Life Harness state directly.",
    "",
    "## Card",
    `- ID: ${packet.cardId}`,
    `- Kind: ${packet.cardKind}`,
    `- Status: ${packet.status}`,
    `- Area: ${formatCardKindArea(packet)}`,
    `- Next action: ${packet.nextTinyAction}`,
    ""
  ];

  if (packet.recentProof.length > 0) {
    lines.push(
      ...formatListSection(
        "## Recent proof",
        packet.recentProof.map(
          (proof) => `- ${proof.timestamp}: ${proof.title}`
        )
      )
    );
  }

  if (packet.recentLogs.length > 0) {
    lines.push(
      ...formatListSection(
        "## Recent logs",
        packet.recentLogs.map((log) => `- ${log.timestamp} (${log.type}): ${log.summary}`)
      )
    );
  }

  if (packet.careerContext) {
    const career = packet.careerContext;
    lines.push("## Career application");
    lines.push(`- Company: ${career.company}`);
    lines.push(`- Role: ${career.roleTitle}`);
    lines.push(`- Status: ${career.applicationStatus}`);
    if (career.resumeAngle) {
      lines.push(`- Resume angle: ${career.resumeAngle}`);
    }
    if (career.projectsToEmphasize) {
      lines.push(`- Projects to emphasize: ${career.projectsToEmphasize}`);
    }
    if (career.followUpDate) {
      lines.push(`- Follow-up date: ${career.followUpDate}`);
    }
    if (career.resumeDraftNextAction) {
      lines.push(`- Resume draft next action: ${career.resumeDraftNextAction}`);
    }
    if (career.readinessStatus) {
      lines.push(`- Resume readiness: ${career.readinessStatus}`);
    }
    if (career.readinessNextAction) {
      lines.push(`- Resume readiness next action: ${career.readinessNextAction}`);
    }
    lines.push("");
  }

  if (packet.jobCandidate) {
    const candidate = packet.jobCandidate;
    lines.push("## Job candidate");
    lines.push(`- ID: ${candidate.id}`);
    lines.push(`- Company: ${candidate.company}`);
    lines.push(`- Role: ${candidate.roleTitle}`);
    lines.push(`- Fit score: ${candidate.fitScore}`);
    if (candidate.fitLabel) {
      lines.push(`- Fit label: ${candidate.fitLabel}`);
    }
    if (candidate.recommendedResumeAngle) {
      lines.push(`- Recommended resume angle: ${candidate.recommendedResumeAngle}`);
    }
    if (candidate.fitReasons.length > 0) {
      lines.push(`- Fit reasons: ${candidate.fitReasons.join("; ")}`);
    }
    if (candidate.gaps.length > 0) {
      lines.push(`- Gaps: ${candidate.gaps.join("; ")}`);
    }
    lines.push("");
  }

  if (packet.memoryFacts.length > 0) {
    lines.push("## Memory facts");
    for (const memory of packet.memoryFacts) {
      if (memory.summary) {
        lines.push(`- [${memory.kind}] ${memory.title}: ${memory.summary}`);
      } else {
        lines.push(`- [${memory.kind}] ${memory.title}`);
      }
    }
    lines.push("");
  }

  if (packet.constraints.length > 0) {
    lines.push(
      ...formatListSection(
        "## Constraints",
        packet.constraints.map((constraint) => `- ${constraint}`)
      )
    );
  }

  lines.push("## Verification commands");
  lines.push(packet.verificationCommands.length === 0 ? "(none)" : packet.verificationCommands.join("\n"));

  return lines.join("\n").trimEnd();
}

function formatCardKindArea(packet: CardContextPacket): string {
  if (packet.cardKind === "career_application") {
    return AREA_LABELS.social_career;
  }

  if (packet.cardKind in AREA_LABELS) {
    return AREA_LABELS[packet.cardKind as keyof typeof AREA_LABELS];
  }

  return packet.cardKind;
}
