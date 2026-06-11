import { shouldIncludeCard, shouldIncludeLog } from "./contextPacketRedaction";
import type { LifeHarnessData } from "./lifeHarnessData";
import { PROOF_TITLES } from "./proof";
import type { HarnessAgentSession, LifeArea, LifeCard, LifeLogEntry, LogType, ProofItem } from "./types";

/**
 * Evidence sources in Life Harness (read-only ledger view):
 *
 * - proof + log: pounce, MVD, salvage, quick-capture idea/park/win/applied/follow-up, park card,
 *   career intake, approve candidate, job source run, agent session mark done
 * - proof only: (none in v0.1 — paired logs always created when proof is)
 * - log only: job candidate intake (clarity), quick-capture win without card match, some clarity logs
 */

export type ProofLedgerSource =
  | "proof"
  | "log"
  | "agent"
  | "career"
  | "resume"
  | "recovery"
  | "capture"
  | "card";

export type ProofLedgerEntry = {
  id: string;
  timestamp: string;
  title: string;
  summary?: string;
  source: ProofLedgerSource;
  cardId?: string;
  cardTitle?: string;
  proofItemId?: string;
  sourceLogId?: string;
  agentSessionId?: string;
  route?: string;
  tags: string[];
};

export type ProofLedgerSummary = {
  entries: ProofLedgerEntry[];
  recent: ProofLedgerEntry[];
  bySource: Record<ProofLedgerSource, number>;
  totalProof: number;
};

export type ProofLedgerOptions = {
  now?: Date;
  limit?: number;
  cardId?: string;
  source?: ProofLedgerSource;
};

const RECENT_CAP = 8;

const MEANINGFUL_LOG_TYPES = new Set<LogType>(["win", "idea", "pounce", "salvage", "mvd", "clarity"]);

const EMPTY_BY_SOURCE: Record<ProofLedgerSource, number> = {
  proof: 0,
  log: 0,
  agent: 0,
  career: 0,
  resume: 0,
  recovery: 0,
  capture: 0,
  card: 0
};

const CAREER_PROOF_TITLES = new Set<string>([
  PROOF_TITLES.applicationCard,
  PROOF_TITLES.appliedToJob,
  PROOF_TITLES.followUp,
  PROOF_TITLES.approvedCandidate,
  PROOF_TITLES.ranJobSource,
  PROOF_TITLES.foundJobCandidates
]);

const RECOVERY_PROOF_TITLES = new Set<string>([
  PROOF_TITLES.pounce,
  PROOF_TITLES.mvd,
  PROOF_TITLES.salvage
]);

function cardById(cards: LifeCard[], cardId?: string): LifeCard | undefined {
  return cardId ? cards.find((card) => card.id === cardId) : undefined;
}

function cardRoute(cardId?: string): string | undefined {
  return cardId ? `/card/${cardId}` : undefined;
}

function buildTags(source: ProofLedgerSource, area?: LifeArea, extra?: string): string[] {
  const tags: string[] = [source];
  if (area) {
    tags.push(area);
  }
  if (extra) {
    tags.push(extra);
  }
  return tags;
}

function classifyProofSource(proof: ProofItem, log?: LifeLogEntry): ProofLedgerSource {
  const title = proof.title;

  if (RECOVERY_PROOF_TITLES.has(title)) {
    return "recovery";
  }
  if (title === PROOF_TITLES.idea) {
    return "capture";
  }
  if (title === PROOF_TITLES.parked || title.startsWith("Worked on ")) {
    return "card";
  }
  if (title.startsWith("Agent session:") || title.startsWith("Agent finished:")) {
    return "agent";
  }
  if (title === PROOF_TITLES.resumeExported) {
    return "resume";
  }
  if (CAREER_PROOF_TITLES.has(title)) {
    return "career";
  }
  if (/resume/i.test(title)) {
    return "resume";
  }
  if (log?.type === "pounce" || log?.type === "mvd" || log?.type === "salvage") {
    return "recovery";
  }
  if (log?.type === "idea") {
    return "capture";
  }
  if (proof.area === "social_career" || log?.area === "social_career") {
    return "career";
  }
  if (proof.cardId || log?.cardId) {
    return "card";
  }
  return "proof";
}

function classifyLogSource(log: LifeLogEntry): ProofLedgerSource {
  if (log.type === "pounce" || log.type === "mvd" || log.type === "salvage") {
    return "recovery";
  }
  if (log.type === "idea") {
    return "capture";
  }
  if (log.area === "social_career") {
    return "career";
  }
  if (log.cardId) {
    return "card";
  }
  return "log";
}

function shouldIncludeProofItem(proof: ProofItem, cards: LifeCard[]): boolean {
  if (proof.cardId) {
    const card = cardById(cards, proof.cardId);
    if (card && !shouldIncludeCard(card)) {
      return false;
    }
  }
  return true;
}

function shouldIncludeLogEntry(log: LifeLogEntry, cards: LifeCard[]): boolean {
  if (!shouldIncludeLog(log)) {
    return false;
  }
  if (log.cardId) {
    const card = cardById(cards, log.cardId);
    if (card && !shouldIncludeCard(card)) {
      return false;
    }
  }
  return true;
}

function matchesCardFilter(entry: ProofLedgerEntry, cardId?: string): boolean {
  if (!cardId) {
    return true;
  }
  return entry.cardId === cardId;
}

function proofEntryFromItem(
  proof: ProofItem,
  cards: LifeCard[],
  logs: LifeLogEntry[]
): ProofLedgerEntry {
  const card = cardById(cards, proof.cardId);
  const log = proof.sourceLogId ? logs.find((entry) => entry.id === proof.sourceLogId) : undefined;
  const source = classifyProofSource(proof, log);

  return {
    id: `proof-${proof.id}`,
    timestamp: proof.timestamp,
    title: proof.title,
    summary: log?.rawText,
    source,
    cardId: proof.cardId,
    cardTitle: card?.title,
    proofItemId: proof.id,
    sourceLogId: proof.sourceLogId,
    route: cardRoute(proof.cardId),
    tags: buildTags(source, proof.area, log?.type)
  };
}

function logEntryFromItem(log: LifeLogEntry, cards: LifeCard[]): ProofLedgerEntry {
  const card = cardById(cards, log.cardId);
  const source = classifyLogSource(log);

  return {
    id: `log-${log.id}`,
    timestamp: log.timestamp,
    title: log.rawText.trim() || `${log.type} logged`,
    summary: log.xp ? `+${log.xp} XP` : undefined,
    source,
    cardId: log.cardId,
    cardTitle: card?.title,
    sourceLogId: log.id,
    route: cardRoute(log.cardId),
    tags: buildTags(source, log.area, log.type)
  };
}

function agentFallbackEntry(session: HarnessAgentSession, cards: LifeCard[]): ProofLedgerEntry {
  const card = cardById(cards, session.cardId);
  const timestamp = session.completedAt ?? session.updatedAt;

  return {
    id: `agent-${session.id}`,
    timestamp,
    title: `Agent session: ${session.taskName}`,
    summary: session.resultSummary,
    source: "agent",
    cardId: session.cardId,
    cardTitle: card?.title,
    agentSessionId: session.id,
    route: cardRoute(session.cardId),
    tags: buildTags("agent", card?.area, session.agent)
  };
}

function countBySource(entries: ProofLedgerEntry[]): Record<ProofLedgerSource, number> {
  const counts = { ...EMPTY_BY_SOURCE };
  for (const entry of entries) {
    counts[entry.source] += 1;
  }
  return counts;
}

export function buildProofLedger(
  data: LifeHarnessData,
  options?: ProofLedgerOptions
): ProofLedgerSummary {
  const { cards, logs, proofItems, agentSessions } = data;
  const cardIdFilter = options?.cardId;
  const sourceFilter = options?.source;

  const proofIdSet = new Set(proofItems.map((proof) => proof.id));
  const logIdsBackedByProof = new Set(
    proofItems.map((proof) => proof.sourceLogId).filter((id): id is string => !!id)
  );

  const entries: ProofLedgerEntry[] = [];

  for (const proof of proofItems) {
    if (!shouldIncludeProofItem(proof, cards)) {
      continue;
    }

    const entry = proofEntryFromItem(proof, cards, logs);
    if (!matchesCardFilter(entry, cardIdFilter)) {
      continue;
    }
    if (sourceFilter && entry.source !== sourceFilter) {
      continue;
    }
    entries.push(entry);
  }

  for (const log of logs) {
    if (!MEANINGFUL_LOG_TYPES.has(log.type)) {
      continue;
    }
    if (!shouldIncludeLogEntry(log, cards)) {
      continue;
    }
    if (log.proofItemId && proofIdSet.has(log.proofItemId)) {
      continue;
    }
    if (logIdsBackedByProof.has(log.id)) {
      continue;
    }

    const entry = logEntryFromItem(log, cards);
    if (!matchesCardFilter(entry, cardIdFilter)) {
      continue;
    }
    if (sourceFilter && entry.source !== sourceFilter) {
      continue;
    }
    entries.push(entry);
  }

  const proofIdsInLedger = new Set(
    entries.map((entry) => entry.proofItemId).filter((id): id is string => !!id)
  );

  for (const session of agentSessions) {
    if (session.status !== "done") {
      continue;
    }
    if (session.evidenceProofItemId && proofIdsInLedger.has(session.evidenceProofItemId)) {
      continue;
    }
    if (session.evidenceProofItemId && proofIdSet.has(session.evidenceProofItemId)) {
      continue;
    }

    const card = cardById(cards, session.cardId);
    if (card && !shouldIncludeCard(card)) {
      continue;
    }

    const entry = agentFallbackEntry(session, cards);
    if (!matchesCardFilter(entry, cardIdFilter)) {
      continue;
    }
    if (sourceFilter && entry.source !== sourceFilter) {
      continue;
    }
    entries.push(entry);
  }

  entries.sort((left, right) => right.timestamp.localeCompare(left.timestamp));

  const limitedEntries =
    options?.limit !== undefined ? entries.slice(0, options.limit) : entries;

  const recent = limitedEntries.slice(0, RECENT_CAP);
  const totalProof = limitedEntries.filter((entry) => entry.proofItemId).length;

  return {
    entries: limitedEntries,
    recent,
    bySource: countBySource(limitedEntries),
    totalProof
  };
}
