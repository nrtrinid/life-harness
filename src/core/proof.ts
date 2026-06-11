import { createId, nowIso } from "./ids";
import { AREA_LABELS } from "./labels";
import type { LifeArea, LifeCard, LifeLogEntry, LogType, ProofItem } from "./types";

interface CreateProofInput {
  title: string;
  area?: LifeArea;
  cardId?: string;
  sourceLogId?: string;
}

export type RescueProofKind = "pounce" | "salvage" | "mvd";

export interface ProofShelfEntry {
  id: string;
  title: string;
  timestamp: string;
  cardId?: string;
  area?: LifeArea;
  areaLabel?: string;
  cardTitle?: string;
  rescueKind?: RescueProofKind;
}

const RESCUE_LOG_TYPES = new Set<LogType>(["pounce", "salvage", "mvd"]);

export function createProofItem(input: CreateProofInput): ProofItem {
  return {
    id: createId("proof"),
    timestamp: nowIso(),
    title: input.title,
    area: input.area,
    cardId: input.cardId,
    sourceLogId: input.sourceLogId
  };
}

export const PROOF_TITLES = {
  pounce: "Started career pounce",
  mvd: "Preserved the day.",
  salvage: "Used Salvage Mode.",
  idea: "Captured idea without activating it.",
  parked: "Parked project cleanly.",
  applicationCard: "Created application card",
  appliedToJob: "Applied to job",
  followUp: "Sent follow-up",
  approvedCandidate: "Approved job candidate",
  ranJobSource: "Ran job source",
  foundJobCandidates: "Found job candidates"
} as const;

function getRescueKind(proof: ProofItem, logs: LifeLogEntry[]): RescueProofKind | undefined {
  if (!proof.sourceLogId) {
    return undefined;
  }
  const log = logs.find((entry) => entry.id === proof.sourceLogId);
  if (!log || !RESCUE_LOG_TYPES.has(log.type)) {
    return undefined;
  }
  return log.type as RescueProofKind;
}

export function buildProofShelfEntries(
  proofItems: ProofItem[],
  cards: LifeCard[],
  logs: LifeLogEntry[]
): ProofShelfEntry[] {
  return [...proofItems]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .map((proof) => {
      const card = proof.cardId ? cards.find((item) => item.id === proof.cardId) : undefined;
      return {
        id: proof.id,
        title: proof.title,
        timestamp: proof.timestamp,
        cardId: proof.cardId,
        area: proof.area,
        areaLabel: proof.area ? AREA_LABELS[proof.area] : undefined,
        cardTitle: card?.title,
        rescueKind: getRescueKind(proof, logs)
      };
    });
}
