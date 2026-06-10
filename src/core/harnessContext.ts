import { FIT_SCORE_DISCLAIMER, AREA_LABELS, CARD_STATE_LABELS, WARMTH_LABELS } from "./labels";
import { checkCareerUseBeforeImproveLocks } from "./career";
import { ACTIVE_CARD_LIMIT } from "./guards";
import {
  buildChatMemoryAnalyses,
  buildChatMemoryDecisions,
  CHAT_MEMORY_ANALYSIS_PREFIX
} from "./harnessMemory";
import {
  buildMemoryBankAnalyses,
  buildMemoryBankDecisions,
  getActiveMemoryItems,
  MEMORY_BANK_PREFIX
} from "./harnessMemoryBank";
import type {
  CardState,
  DailyState,
  HarnessChatSummary,
  HarnessMemoryItem,
  JobCandidate,
  JobSourceRunResult,
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
  jobSourceRuns?: JobSourceRunResult[];
  chatSummaries?: HarnessChatSummary[];
  memoryItems?: HarnessMemoryItem[];
};

export interface ActiveLimitSignal {
  count: number;
  limit: number;
  isAtLimit: boolean;
  isOverLimit: boolean;
  message: string;
}

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
const MAX_EXPORT_PROOF = 20;
const COMPACT_MAX_LOGS = 10;
const COMPACT_MAX_PROOF = 5;
const COMPACT_TEXT_LIMIT = 80;
const COLD_WARMTH: Warmth[] = ["cold", "dormant", "cooling"];

/** Matches default `SCOUT_MAX_INPUT_CHARS` on ai-gateway. */
export const DEFAULT_GATEWAY_MAX_INPUT_CHARS = 12_000;

/** Headroom below gateway max for template drift and long user messages. */
export const GATEWAY_PROMPT_SAFETY_MARGIN_CHARS = 250;

/**
 * chat_harness.md with empty context/history and placeholder mode/sensitivity/message.
 * Keep in sync with `services/ai-gateway/app/prompts/chat_harness.md`.
 */
export const CHAT_HARNESS_PROMPT_SHELL_CHARS = 2543;

/** Reserve user-message chars when trimming context for OpenVINO prompt budget. */
export const COMPACT_MESSAGE_RESERVE_CHARS = 400;

/**
 * Legacy minified-json heuristic for docs and coarse UI hints. Prefer
 * `shouldAutoSelectCompactExport` / `estimateChatHarnessPromptChars` for gateway budget.
 */
export const AUTO_COMPACT_THRESHOLD_CHARS = 10_000;

/** Legacy minified-json compact cap. Prefer `maxPromptChars` in buildCompactHarnessContext. */
export const DEFAULT_COMPACT_MAX_CONTEXT_CHARS = 11_000;

export interface CompactHarnessContextOptions {
  /** Legacy minified JSON budget. */
  maxContextChars?: number;
  /** Serialized OpenVINO chat-harness prompt budget (recommended). */
  maxPromptChars?: number;
}

export interface EstimateChatHarnessPromptOptions {
  message?: string;
  conversationHistory?: ConversationTurn[];
}

/**
 * Minified JSON length of a HarnessContext (matches client POST body serialization).
 */
export function estimateHarnessContextChars(context: HarnessContext): number {
  return JSON.stringify(context).length;
}

/**
 * Approximates ai-gateway `build_chat_harness_prompt` length (indented context JSON + template).
 */
export function estimateChatHarnessPromptChars(
  context: HarnessContext,
  options: EstimateChatHarnessPromptOptions = {}
): number {
  const message = options.message ?? "";
  const history = options.conversationHistory ?? [];
  return (
    CHAT_HARNESS_PROMPT_SHELL_CHARS +
    JSON.stringify(context, null, 2).length +
    JSON.stringify(history, null, 2).length +
    message.length
  );
}

export function shouldAutoSelectCompactExport(
  fullContext: HarnessContext,
  message = ""
): boolean {
  return (
    estimateChatHarnessPromptChars(fullContext, { message }) >
    DEFAULT_GATEWAY_MAX_INPUT_CHARS - GATEWAY_PROMPT_SAFETY_MARGIN_CHARS
  );
}

function compactPromptBudget(options: CompactHarnessContextOptions): number {
  return (
    options.maxPromptChars ??
    DEFAULT_GATEWAY_MAX_INPUT_CHARS - GATEWAY_PROMPT_SAFETY_MARGIN_CHARS
  );
}

function fitsCompactPromptBudget(
  context: HarnessContext,
  options: CompactHarnessContextOptions,
  messageReserve = COMPACT_MESSAGE_RESERVE_CHARS
): boolean {
  const reservedMessage = "m".repeat(messageReserve);
  return (
    estimateChatHarnessPromptChars(context, { message: reservedMessage }) <=
    compactPromptBudget(options)
  );
}

function fitsCompactContextBudget(
  context: HarnessContext,
  maxContextChars: number
): boolean {
  return estimateHarnessContextChars(context) <= maxContextChars;
}

function fitsCompactBudget(
  context: HarnessContext,
  options: CompactHarnessContextOptions
): boolean {
  if (options.maxContextChars !== undefined) {
    return fitsCompactContextBudget(context, options.maxContextChars);
  }

  return fitsCompactPromptBudget(context, options);
}

export function resolveChatHarnessContextForGateway(
  data: HarnessExportInput,
  options: { preferredMode?: "full" | "compact"; message?: string } = {}
): HarnessContext {
  const message = options.message ?? "";
  const full = buildHarnessContext(data);
  const preferred =
    options.preferredMode ??
    (shouldAutoSelectCompactExport(full, message) ? "compact" : "full");
  let context =
    preferred === "compact" ? buildCompactHarnessContext(data) : full;

  const maxPromptChars = compactPromptBudget({});
  if (estimateChatHarnessPromptChars(context, { message }) > maxPromptChars) {
    context = buildCompactHarnessContext(data, { maxPromptChars });
  }

  return context;
}

export function scoreCompactCardPriority(card: HarnessContextCard): number {
  if (card.title.startsWith("Resume:")) {
    return 10;
  }

  if (card.state === "Active") {
    return 100;
  }

  if (card.state === "Waiting") {
    return 90;
  }

  if (card.state === "Inbox") {
    return 85;
  }

  if (card.warmth === "Cold" || card.warmth === "Dormant") {
    return 80;
  }

  if (card.area === "Social / Career") {
    return 75;
  }

  if (card.state === "Parked") {
    return 30;
  }

  return 60;
}

function cloneHarnessContext(context: HarnessContext): HarnessContext {
  return structuredClone(context);
}

function truncateCompactText(text: string, limit = COMPACT_TEXT_LIMIT): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, limit - 1)}…`;
}

function removeResumeModuleCards(context: HarnessContext): boolean {
  const before = context.cards.length;
  context.cards = context.cards.filter((card) => !card.title.startsWith("Resume:"));
  return context.cards.length < before;
}

function capCompactLogs(context: HarnessContext): boolean {
  if (context.logs.length <= COMPACT_MAX_LOGS) {
    return false;
  }

  context.logs = context.logs.slice(0, COMPACT_MAX_LOGS);
  return true;
}

function capCompactProof(context: HarnessContext): boolean {
  if (context.proof_items.length <= COMPACT_MAX_PROOF) {
    return false;
  }

  context.proof_items = context.proof_items.slice(0, COMPACT_MAX_PROOF);
  return true;
}

function stripCompactDecisionReasons(context: HarnessContext): boolean {
  let changed = false;

  for (const decision of context.decisions) {
    if (decision.reason !== "") {
      decision.reason = "";
      changed = true;
    }
  }

  return changed;
}

function dropLowestPriorityCard(context: HarnessContext): boolean {
  if (context.cards.length === 0) {
    return false;
  }

  const sorted = [...context.cards].sort(
    (left, right) => scoreCompactCardPriority(left) - scoreCompactCardPriority(right)
  );
  const dropTitle = sorted[0]?.title;
  if (!dropTitle) {
    return false;
  }

  context.cards = context.cards.filter((card) => card.title !== dropTitle);
  return true;
}

function truncateLowPriorityCardText(context: HarnessContext): boolean {
  let changed = false;

  for (const card of context.cards) {
    if (scoreCompactCardPriority(card) >= 75) {
      continue;
    }

    const nextWhy = truncateCompactText(card.why_it_matters);
    const nextAction = truncateCompactText(card.next_tiny_action);

    if (nextWhy !== card.why_it_matters) {
      card.why_it_matters = nextWhy;
      changed = true;
    }

    if (nextAction !== card.next_tiny_action) {
      card.next_tiny_action = nextAction;
      changed = true;
    }
  }

  return changed;
}

function trimMemoryBankAnalyses(context: HarnessContext, keepLatest: number): boolean {
  const memoryEntries = context.recent_analyses.filter((item) =>
    item.summary.startsWith(MEMORY_BANK_PREFIX)
  );
  const otherEntries = context.recent_analyses.filter(
    (item) => !item.summary.startsWith(MEMORY_BANK_PREFIX)
  );

  if (memoryEntries.length <= keepLatest) {
    return false;
  }

  const keptCount = Math.max(1, keepLatest);
  context.recent_analyses = [...memoryEntries.slice(0, keptCount), ...otherEntries];
  return true;
}

function trimMemoryBankDecisions(context: HarnessContext, keepLatest: number): boolean {
  const memoryEntries = context.decisions.filter((item) =>
    item.summary.startsWith(MEMORY_BANK_PREFIX)
  );
  const otherEntries = context.decisions.filter(
    (item) => !item.summary.startsWith(MEMORY_BANK_PREFIX)
  );

  if (memoryEntries.length <= keepLatest) {
    return false;
  }

  const keptCount = Math.max(1, keepLatest);
  context.decisions = [...memoryEntries.slice(0, keptCount), ...otherEntries];
  return true;
}

function trimChatMemoryAnalyses(context: HarnessContext, keepLatest: number): boolean {
  const chatEntries = context.recent_analyses.filter((item) =>
    item.summary.startsWith(CHAT_MEMORY_ANALYSIS_PREFIX)
  );
  const otherEntries = context.recent_analyses.filter(
    (item) => !item.summary.startsWith(CHAT_MEMORY_ANALYSIS_PREFIX)
  );

  if (chatEntries.length <= keepLatest) {
    return false;
  }

  const keptCount = Math.max(1, keepLatest);
  context.recent_analyses = [...chatEntries.slice(0, keptCount), ...otherEntries];
  return true;
}

export function buildCompactHarnessContext(
  data: HarnessExportInput,
  options: CompactHarnessContextOptions = {}
): HarnessContext {
  const context = cloneHarnessContext(buildHarnessContext(data));

  removeResumeModuleCards(context);

  if (fitsCompactBudget(context, options)) {
    return context;
  }

  const passes: Array<() => boolean> = [
    () => trimMemoryBankAnalyses(context, 3),
    () => trimMemoryBankDecisions(context, 3),
    () => trimChatMemoryAnalyses(context, 3),
    () => capCompactLogs(context),
    () => capCompactProof(context),
    () => stripCompactDecisionReasons(context),
    () => dropLowestPriorityCard(context),
    () => truncateLowPriorityCardText(context)
  ];

  for (let round = 0; round < 32; round += 1) {
    if (fitsCompactBudget(context, options)) {
      return context;
    }

    let progress = false;
    for (const pass of passes) {
      if (pass()) {
        progress = true;
      }

      if (fitsCompactBudget(context, options)) {
        return context;
      }
    }

    if (!progress) {
      break;
    }
  }

  return context;
}

export function mapLifeArea(area: LifeArea): HarnessArea {
  return AREA_LABELS[area] as HarnessArea;
}

export function mapCardState(state: CardState): HarnessCardState {
  return CARD_STATE_LABELS[state] as HarnessCardState;
}

export function mapWarmth(warmth: Warmth | undefined): HarnessWarmth {
  if (!warmth) {
    return "Cold";
  }
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

export function getActiveLimitSignal(data: HarnessExportInput): ActiveLimitSignal {
  const count = data.cards.filter((card) => card.state === "active").length;
  const isAtLimit = count >= ACTIVE_CARD_LIMIT;
  const isOverLimit = count > ACTIVE_CARD_LIMIT;

  let message = `Active cards: ${count}/${ACTIVE_CARD_LIMIT}.`;
  if (isOverLimit) {
    message = `Active limit exceeded: ${count}/${ACTIVE_CARD_LIMIT}. Park or wait on something before adding more.`;
  } else if (isAtLimit) {
    message = `Active limit reached: ${count}/${ACTIVE_CARD_LIMIT}.`;
  }

  return { count, limit: ACTIVE_CARD_LIMIT, isAtLimit, isOverLimit, message };
}

export function countCardsByArea(context: HarnessContext): Record<HarnessArea, number> {
  const counts: Record<HarnessArea, number> = {
    Build: 0,
    Body: 0,
    "Money / Independence": 0,
    "Social / Career": 0,
    "Stability / Vices": 0
  };

  for (const card of context.cards) {
    counts[card.area] += 1;
  }

  return counts;
}

export function countCardsByState(context: HarnessContext): Record<HarnessCardState, number> {
  const counts: Record<HarnessCardState, number> = {
    Inbox: 0,
    Active: 0,
    Parked: 0,
    Waiting: 0,
    Done: 0,
    Killed: 0
  };

  for (const card of context.cards) {
    counts[card.state] += 1;
  }

  return counts;
}

export function countCardsByWarmth(context: HarnessContext): Record<HarnessWarmth, number> {
  const counts: Record<HarnessWarmth, number> = {
    Hot: 0,
    Warm: 0,
    Cooling: 0,
    Cold: 0,
    Dormant: 0
  };

  for (const card of context.cards) {
    counts[card.warmth] += 1;
  }

  return counts;
}

export function getColdOrDormantCards(context: HarnessContext): HarnessContextCard[] {
  return context.cards.filter((card) => card.warmth === "Cold" || card.warmth === "Dormant");
}

export function buildContextQualitySummary(
  context: HarnessContext,
  activeSignal: ActiveLimitSignal,
  savedChatSummaryCount = 0,
  memoryItemsSaved = 0,
  activeMemoryCount = 0
): string {
  const byState = countCardsByState(context);
  const byArea = countCardsByArea(context);
  const byWarmth = countCardsByWarmth(context);
  const coldTitles = getColdOrDormantCards(context)
    .slice(0, 6)
    .map((card) => card.title)
    .join(", ");
  const chatMemoriesInExport = context.recent_analyses.some((item) =>
    item.summary.startsWith(CHAT_MEMORY_ANALYSIS_PREFIX)
  );
  const memoryItemsInExport =
    context.recent_analyses.some((item) => item.summary.startsWith(MEMORY_BANK_PREFIX)) ||
    context.decisions.some((item) => item.summary.startsWith(MEMORY_BANK_PREFIX));

  const lines = [
    `Cards ${context.cards.length} · Logs ${context.logs.length} · Proof ${context.proof_items.length} · Analyses ${context.recent_analyses.length} · Decisions ${context.decisions.length} · Chat summaries saved ${savedChatSummaryCount}`,
    `Memory items saved: ${memoryItemsSaved} · Active: ${activeMemoryCount}`,
    `Chat memories in export: ${chatMemoriesInExport ? "yes" : "no"}`,
    `Memory items in export: ${memoryItemsInExport ? "yes" : "no"}`,
    `By state: Inbox ${byState.Inbox} · Active ${byState.Active} · Parked ${byState.Parked} · Waiting ${byState.Waiting}`,
    `By area: Build ${byArea.Build} · Body ${byArea.Body} · Social/Career ${byArea["Social / Career"]} · Money ${byArea["Money / Independence"]}`,
    `Warmth: Hot ${byWarmth.Hot} · Warm ${byWarmth.Warm} · Cooling ${byWarmth.Cooling} · Cold ${byWarmth.Cold} · Dormant ${byWarmth.Dormant}`,
    activeSignal.message,
    coldTitles ? `Cold/dormant signal: ${coldTitles}` : "Cold/dormant signal: none flagged"
  ];

  return lines.join("\n");
}

function summarizeLifeCardWhy(card: LifeCard): string {
  if (card.careerApplication) {
    const base =
      card.whyItMatters ??
      card.resumePacket?.whyItMatters ??
      "Outside-world career momentum needs a concrete next move.";
    return `${base} Application thread for ${card.careerApplication.company}.`;
  }

  return (
    card.whyItMatters ??
    card.resumePacket?.whyItMatters ??
    `Tracked Life Harness card in ${mapLifeArea(card.area)}.`
  );
}

function summarizeLifeCardNextAction(card: LifeCard): string {
  if (card.careerApplication?.applicationStatus === "waiting") {
    return card.nextTinyAction || "Send one follow-up on this application.";
  }

  return card.nextTinyAction?.trim() || "Choose one tiny next action.";
}

function summarizeLifeCardTitle(card: LifeCard): string {
  if (card.careerApplication) {
    return `${card.careerApplication.company} — ${card.careerApplication.roleTitle}`;
  }

  return card.title;
}

export function buildHarnessContextCard(card: LifeCard): HarnessContextCard {
  return {
    title: summarizeLifeCardTitle(card),
    area: mapLifeArea(card.area),
    state: mapCardState(card.state),
    progress: card.progress ?? 0,
    warmth: mapWarmth(card.warmth),
    next_tiny_action: summarizeLifeCardNextAction(card),
    why_it_matters: summarizeLifeCardWhy(card)
  };
}

function summarizeLogText(log: LifeLogEntry, cardTitle: string): string {
  if (log.rawText?.trim()) {
    return log.rawText.trim();
  }

  return `${mapLogType(log.type)} signal on ${cardTitle} (${mapLifeArea(log.area)}).`;
}

export function buildHarnessLogEntry(log: LifeLogEntry, cardTitle = "General"): HarnessLogEntry {
  return {
    timestamp: log.timestamp,
    summary: summarizeLogText(log, cardTitle),
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
      next_tiny_action: "Review fit and approve or dismiss.",
      why_it_matters: `Job candidate queue item (fit ${candidate.fitScore}/100). ${
        candidate.fitReasons[0] ?? FIT_SCORE_DISCLAIMER
      }`
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
      next_tiny_action: "Use this module when tailoring a matching application.",
      why_it_matters: `Resume bank module useful for ${module.bestFor.join(", ")} roles. ${module.summary}`
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

function resolveCareerApplicationLogTimestamp(card: LifeCard): string {
  if (card.lastTouched) {
    return card.lastTouched;
  }
  const followUpDate = card.careerApplication?.followUpDate;
  if (followUpDate) {
    return followUpDate.includes("T") ? followUpDate : `${followUpDate}T12:00:00.000Z`;
  }
  return "1970-01-01T00:00:00.000Z";
}

function buildCareerApplicationLogs(cards: LifeCard[]): HarnessLogEntry[] {
  const entries: HarnessLogEntry[] = [];

  for (const card of cards) {
    if (!card.careerApplication) {
      continue;
    }

    const timestamp = resolveCareerApplicationLogTimestamp(card);
    const company = card.careerApplication.company;

    if (card.state === "done") {
      entries.push({
        timestamp,
        summary: `Application submitted/applied signal: ${company} — ${card.careerApplication.roleTitle}`,
        area: "Social / Career",
        card_title: company,
        type: "win"
      });
      continue;
    }

    if (card.state === "waiting") {
      entries.push({
        timestamp,
        summary: `Application waiting for follow-up: ${company} — ${card.careerApplication.roleTitle}`,
        area: "Social / Career",
        card_title: company,
        type: "note"
      });
    }
  }

  return entries;
}

function countLifeCardsByArea(cards: LifeCard[]): Record<LifeArea, number> {
  return cards.reduce(
    (counts, card) => {
      counts[card.area] += 1;
      return counts;
    },
    {
      build: 0,
      body: 0,
      money_independence: 0,
      social_career: 0,
      stability_vices: 0
    } satisfies Record<LifeArea, number>
  );
}

function getColdLifeCards(cards: LifeCard[]): LifeCard[] {
  return cards.filter((card) => COLD_WARMTH.includes(card.warmth));
}

export function buildHarnessBoardDiagnosis(data: HarnessExportInput): HarnessRecentAnalysis[] {
  const analyses: HarnessRecentAnalysis[] = [];
  const activeSignal = getActiveLimitSignal(data);
  const areaCounts = countLifeCardsByArea(data.cards);
  const coldCards = getColdLifeCards(data.cards);
  const hotBuild = data.cards.filter((card) => card.area === "build" && card.warmth === "hot");
  const careerCards = data.cards.filter((card) => card.area === "social_career");
  const bodyCards = data.cards.filter((card) => card.area === "body");
  const resumeModules = data.resumeModules ?? [];
  const jobCandidates = data.jobCandidates ?? [];

  const buildHeavy = areaCounts.build >= areaCounts.social_career + 1;
  const careerCold = careerCards.some((card) => COLD_WARMTH.includes(card.warmth));
  const bodyCooling = bodyCards.some((card) => COLD_WARMTH.includes(card.warmth));

  analyses.push({
    summary: `Current board diagnosis: Build cards ${areaCounts.build}, Social/Career ${areaCounts.social_career}, Body ${areaCounts.body}. ${activeSignal.message}`,
    patterns_detected: [
      buildHeavy ? "Build-heavy momentum" : "Mixed area balance",
      careerCold ? "Career thread is cold or cooling" : "Career thread has warmth signal",
      activeSignal.isOverLimit ? "Active limit exceeded" : "Active limit within range"
    ].filter(Boolean)
  });

  if (activeSignal.isAtLimit) {
    analyses.push({
      summary: `Active limit diagnosis: ${activeSignal.count} active cards against limit ${activeSignal.limit}.`,
      patterns_detected: [
        activeSignal.isOverLimit ? "Board over active limit" : "Board at active limit"
      ]
    });
  }

  if (coldCards.length > 0) {
    analyses.push({
      summary: `Warmth diagnosis: ${coldCards.length} life card(s) read cold, cooling, or dormant (${coldCards
        .map((card) => card.title)
        .join(", ")}).`,
      patterns_detected: ["Cold or dormant threads present"]
    });
  }

  if (careerCards.length > 0 || jobCandidates.length > 0) {
    const queueCount = jobCandidates.filter((c) => c.status !== "dismissed").length;
    analyses.push({
      summary: `Career momentum diagnosis: ${careerCards.length} career card(s), ${queueCount} candidate(s) in queue. Outside-world follow-up may be the highest-leverage move.`,
      patterns_detected: [
        careerCold ? "Career avoidance signal" : "Career thread has recent signal",
        queueCount > 0 ? "Job scout queue has pending review" : "No pending candidates"
      ]
    });
  }

  if (buildHeavy || bodyCooling) {
    analyses.push({
      summary: `Balance diagnosis: Build ${areaCounts.build} vs Body ${areaCounts.body} vs Social/Career ${areaCounts.social_career}. ${
        bodyCooling ? "Body floor may need a tiny move." : "Body thread looks stable enough to defer."
      }`,
      patterns_detected: [
        buildHeavy ? "Build-heavy focus" : "Balanced board",
        bodyCooling ? "Body neglect signal" : "Body floor present"
      ]
    });
  }

  if (resumeModules.length > 0 || jobCandidates.length > 0) {
    analyses.push({
      summary: `Job scout / resume bank diagnosis: ${resumeModules.filter((m) => m.isActive).length} active resume module(s), ${jobCandidates.filter((c) => c.status !== "dismissed").length} candidate(s) tracked.`,
      patterns_detected: [
        resumeModules.length > 0 ? "Resume bank available for tailoring" : "No resume modules exported",
        jobCandidates.length > 0 ? "Candidate queue in play" : "Manual candidate workflow only"
      ]
    });
  }

  return analyses.slice(0, 5);
}

function buildDynamicDecisions(data: HarnessExportInput): HarnessDecision[] {
  const decisions: HarnessDecision[] = [
    {
      summary: "AI responses are read-only and require user approval before changing board state.",
      reason: "Chat Harness can suggest; the user applies changes on the board."
    }
  ];

  const activeSignal = getActiveLimitSignal(data);
  if (activeSignal.isOverLimit) {
    decisions.push({
      summary: "Board is currently over the active limit; activating more should require parking something.",
      reason: activeSignal.message
    });
  }

  const jobCandidates = data.jobCandidates ?? [];
  const jobSourceRuns = data.jobSourceRuns ?? [];
  const locks = checkCareerUseBeforeImproveLocks(
    data.cards,
    data.logs,
    jobCandidates,
    jobSourceRuns
  );

  for (const lock of locks) {
    if ("enabled" in lock && lock.enabled) {
      continue;
    }

    if (lock.current < lock.required) {
      if (lock.id === "resume-automation") {
        decisions.push({
          summary: "Resume automation is locked until manual applications threshold is reached.",
          reason: `${lock.label}: ${lock.current}/${lock.required} manual career actions recorded.`
        });
      } else if (lock.id === "scheduled-fetching") {
        decisions.push({
          summary: "Scheduled job-source fetching is locked until manual candidate workflow has been used.",
          reason: `${lock.label}: ${lock.current}/${lock.required} successful manual source runs.`
        });
      } else if (lock.id === "ai-matching") {
        decisions.push({
          summary: "AI matching remains locked until enough manual career actions exist.",
          reason: `${lock.label}: ${lock.current}/${lock.required} career win logs.`
        });
      }
    }
  }

  return decisions;
}

export function buildHarnessContext(data: HarnessExportInput): HarnessContext {
  const resumeModules = data.resumeModules ?? [];
  const jobCandidates = data.jobCandidates ?? [];
  const cardTitleById = new Map(data.cards.map((card) => [card.id, summarizeLifeCardTitle(card)]));

  const cards = [
    ...data.cards.map(buildHarnessContextCard),
    ...buildCandidateCards(jobCandidates),
    ...buildResumeModuleCards(resumeModules)
  ];

  const mappedLogs = data.logs.map((log) =>
    buildHarnessLogEntry(log, log.cardId ? cardTitleById.get(log.cardId) ?? "General" : "General")
  );

  const logs = [
    ...mappedLogs,
    ...buildSyntheticDailyLogs(data.dailyState),
    ...buildCandidateEventLogs(jobCandidates),
    ...buildCareerApplicationLogs(data.cards)
  ]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, MAX_EXPORT_LOGS);

  const proof_items = [...data.proofItems]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, MAX_EXPORT_PROOF)
    .map((item) => ({
      summary: item.title,
      timestamp: item.timestamp
    }));

  const activeMemory = getActiveMemoryItems(data.memoryItems ?? []);

  const recent_analyses = [
    ...buildMemoryBankAnalyses(activeMemory, 10),
    ...buildChatMemoryAnalyses(data.chatSummaries ?? [], 5),
    ...buildHarnessBoardDiagnosis(data)
  ].slice(0, 15);
  const decisions = [
    ...HARNESS_STATIC_DECISIONS,
    ...buildMemoryBankDecisions(activeMemory, 10),
    ...buildChatMemoryDecisions(data.chatSummaries ?? [], 5),
    ...buildDynamicDecisions(data)
  ];

  return {
    cards,
    logs,
    proof_items,
    recent_analyses,
    decisions
  };
}
