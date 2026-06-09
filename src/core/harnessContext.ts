import { FIT_SCORE_DISCLAIMER, AREA_LABELS, CARD_STATE_LABELS, WARMTH_LABELS } from "./labels";
import type {
  CardState,
  DailyState,
  JobCandidate,
  LifeArea,
  LifeCard,
  LifeLogEntry,
  LogType,
  ProofItem,
  ResumeModule,
  SensitivityLevel,
  Warmth
} from "./types";

export type HarnessArea =
  | "Build"
  | "Body"
  | "Money / Independence"
  | "Social / Career"
  | "Stability / Vices";

export type HarnessCardState =
  | "Inbox"
  | "Active"
  | "Parked"
  | "Waiting"
  | "Done"
  | "Killed";

export type HarnessWarmth = "Hot" | "Warm" | "Cooling" | "Cold" | "Dormant";

export type HarnessLogType = "win" | "leak" | "note" | "decision" | "pounce" | "salvage";

export type ChatHarnessMode = "operator" | "reflection" | "builder" | "general";

export interface HarnessContextCard {
  title: string;
  area: HarnessArea;
  state: HarnessCardState;
  progress: number;
  warmth: HarnessWarmth;
  next_tiny_action: string;
  why_it_matters: string;
}

export interface HarnessLogEntry {
  timestamp: string;
  summary: string;
  area: string;
  card_title: string;
  type: HarnessLogType;
}

export interface HarnessProofItem {
  summary: string;
  timestamp: string;
}

export interface HarnessRecentAnalysis {
  summary: string;
  patterns_detected: string[];
}

export interface HarnessDecision {
  summary: string;
  reason: string;
}

export interface HarnessContext {
  cards: HarnessContextCard[];
  logs: HarnessLogEntry[];
  proof_items: HarnessProofItem[];
  recent_analyses: HarnessRecentAnalysis[];
  decisions: HarnessDecision[];
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatHarnessRequest {
  message: string;
  mode: ChatHarnessMode;
  sensitivity: SensitivityLevel;
  context: HarnessContext;
  conversation_history: ConversationTurn[];
}

export interface ChatHarnessResponse {
  answer: string;
  used_context: boolean;
  confidence_notes: string[];
  safety_notes: string[];
}

export type HarnessExportInput = {
  cards: LifeCard[];
  logs: LifeLogEntry[];
  proofItems: ProofItem[];
  dailyState: DailyState;
  resumeModules?: ResumeModule[];
  jobCandidates?: JobCandidate[];
};

export const HARNESS_STATIC_DECISIONS: HarnessDecision[] = [
  {
    summary: "Life Harness board is the source of truth.",
    reason: "AI suggestions require user approval before any board change."
  },
  {
    summary: "AI suggestions require user approval.",
    reason: "The scout can suggest and prepare; the user approves changes."
  },
  {
    summary: "Local AI is optional and not required for v0.1.",
    reason: "The board must work rules-only first."
  },
  {
    summary: "Career-first board is the practical current product direction.",
    reason: "Build wins are real but outside-world threads need deliberate attention."
  }
];

const MAX_EXPORT_LOGS = 30;

export function mapLifeArea(area: LifeArea): HarnessArea {
  return AREA_LABELS[area] as HarnessArea;
}

export function mapCardState(state: CardState): HarnessCardState {
  return CARD_STATE_LABELS[state] as HarnessCardState;
}

export function mapWarmth(warmth: Warmth): HarnessWarmth {
  return WARMTH_LABELS[warmth] as HarnessWarmth;
}

export function mapLogType(type: LogType): HarnessLogType {
  switch (type) {
    case "win":
    case "leak":
    case "pounce":
    case "salvage":
      return type;
    case "idea":
    case "mvd":
    case "clarity":
    case "calibration":
    default:
      return "note";
  }
}

export function buildHarnessContextCard(card: LifeCard): HarnessContextCard {
  return {
    title: card.title,
    area: mapLifeArea(card.area),
    state: mapCardState(card.state),
    progress: card.progress,
    warmth: mapWarmth(card.warmth),
    next_tiny_action: card.nextTinyAction,
    why_it_matters: card.whyItMatters ?? card.resumePacket?.whyItMatters ?? "No rationale recorded."
  };
}

export function buildHarnessLogEntry(
  log: LifeLogEntry,
  cardTitle = "General"
): HarnessLogEntry {
  return {
    timestamp: log.timestamp,
    summary: log.rawText,
    area: mapLifeArea(log.area),
    card_title: cardTitle,
    type: mapLogType(log.type)
  };
}

function buildCandidateCards(candidates: JobCandidate[]): HarnessContextCard[] {
  return candidates
    .filter((candidate) => candidate.status !== "dismissed" && !candidate.applicationCardId)
    .map((candidate) => ({
      title: `${candidate.company} — ${candidate.roleTitle}`,
      area: "Social / Career" as const,
      state: "Inbox" as const,
      progress: 0,
      warmth: "Cold" as const,
      next_tiny_action: candidate.nextTinyAction,
      why_it_matters: candidate.fitReasons[0] ?? FIT_SCORE_DISCLAIMER
    }));
}

function buildResumeModuleCards(modules: ResumeModule[]): HarnessContextCard[] {
  return modules
    .filter((module) => module.isActive)
    .map((module) => ({
      title: `Resume: ${module.title}`,
      area: "Build" as const,
      state: "Parked" as const,
      progress: 0,
      warmth: "Dormant" as const,
      next_tiny_action: module.bullets[0] ?? module.summary.slice(0, 80),
      why_it_matters: module.summary
    }));
}

function buildSyntheticDailyLogs(dailyState: DailyState): HarnessLogEntry[] {
  const logs: HarnessLogEntry[] = [];
  const timestamp = dailyState.lastOpenedAt ?? dailyState.date;

  if (dailyState.pounceStarted && dailyState.pounceMission) {
    logs.push({
      timestamp,
      summary: `Pounce started: ${dailyState.pounceMission}`,
      area: "Build",
      card_title: "Session",
      type: "pounce"
    });
  }

  if (dailyState.salvageCompleted) {
    logs.push({
      timestamp,
      summary: "Salvage mode completed for today.",
      area: "Build",
      card_title: "Session",
      type: "salvage"
    });
  }

  if (dailyState.minimumViableDayCompleted) {
    logs.push({
      timestamp,
      summary: "Minimum Viable Day completed.",
      area: "Body",
      card_title: "Session",
      type: "note"
    });
  }

  return logs;
}

function buildCandidateEventLogs(candidates: JobCandidate[]): HarnessLogEntry[] {
  return candidates.flatMap((candidate) => {
    if (candidate.status === "card_created") {
      return [
        {
          timestamp: candidate.discoveredAt,
          summary: `Candidate approved to card: ${candidate.company} — ${candidate.roleTitle}`,
          area: "Social / Career",
          card_title: candidate.company,
          type: "note" as const
        }
      ];
    }

    if (candidate.status === "saved") {
      return [
        {
          timestamp: candidate.discoveredAt,
          summary: `Candidate saved to queue: ${candidate.company} — ${candidate.roleTitle}`,
          area: "Social / Career",
          card_title: candidate.company,
          type: "note" as const
        }
      ];
    }

    return [];
  });
}

export function buildHarnessContext(data: HarnessExportInput): HarnessContext {
  const resumeModules = data.resumeModules ?? [];
  const jobCandidates = data.jobCandidates ?? [];
  const cardTitleById = new Map(data.cards.map((card) => [card.id, card.title]));

  const cards = [
    ...data.cards.map(buildHarnessContextCard),
    ...buildCandidateCards(jobCandidates),
    ...buildResumeModuleCards(resumeModules)
  ];

  const mappedLogs = data.logs.map((log) =>
    buildHarnessLogEntry(log, log.cardId ? cardTitleById.get(log.cardId) ?? "General" : "General")
  );

  const logs = [...mappedLogs, ...buildSyntheticDailyLogs(data.dailyState), ...buildCandidateEventLogs(jobCandidates)]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, MAX_EXPORT_LOGS);

  const proof_items = data.proofItems.map((item) => ({
    summary: item.title,
    timestamp: item.timestamp
  }));

  return {
    cards,
    logs,
    proof_items,
    recent_analyses: [],
    decisions: [...HARNESS_STATIC_DECISIONS]
  };
}
