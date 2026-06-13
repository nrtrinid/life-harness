import { applyCardStateChange, applyQuickCapture } from "./actions";
import type { CapabilityRoutingResult } from "./capabilityRouter";
import { isAssistantActionAllowed } from "./capabilityRouter";
import type { LifeHarnessData } from "./actions";
import { createAgentSessionForCard, normalizeAgentKind } from "./agentSessionLog";
import { shouldIncludeCard } from "./contextPacketRedaction";
import { nowIso } from "./ids";
import { CAPTURE_GRAMMAR_HINT, parseUniversalCapture } from "./parsing";
import type { LifeCard } from "./types";

export const MAX_ASSISTANT_ACTIONS_PER_MESSAGE = 5;

export const ASSISTANT_ACTIONS_FENCE_LABEL = "assistant-actions";

export const ASSISTANT_ACTION_KINDS: AssistantActionKind[] = [
  "quick_capture",
  "log_win",
  "park_card",
  "update_next_tiny_action",
  "create_agent_session"
];

export type AssistantActionParseDiagnosis = {
  hasFence: boolean;
  parsedCount: number;
  fenceBlockCount: number;
  invalidJsonBlockCount: number;
};

export type AssistantActionKind =
  | "quick_capture"
  | "log_win"
  | "park_card"
  | "update_next_tiny_action"
  | "create_agent_session";

export type AssistantActionRisk = "low" | "medium";

export type AssistantProposedAction =
  | { type: "quick_capture"; text: string }
  | { type: "log_win"; text: string; cardId?: string }
  | { type: "park_card"; cardId: string; reason?: string }
  | { type: "update_next_tiny_action"; cardId: string; nextTinyAction: string }
  | {
      type: "create_agent_session";
      cardId: string;
      agent?: string;
      taskName?: string;
      goal?: string;
    };

export type AssistantActionPreview = {
  title: string;
  description: string;
  risk: AssistantActionRisk;
  cardTitle?: string;
};

export type AssistantActionValidationResult =
  | { ok: true; preview: AssistantActionPreview }
  | { ok: false; error: string };

export type AssistantActionApplyResult =
  | { ok: true; data: LifeHarnessData; message: string }
  | { ok: false; error: string };

const ASSISTANT_ACTION_FENCE = new RegExp(
  `\`\`\`${ASSISTANT_ACTIONS_FENCE_LABEL}(?:\\s|$)([\\s\\S]*?)\`\`\``,
  "g"
);

function scanAssistantActionFenceBodies(text: string): string[] {
  const pattern = new RegExp(ASSISTANT_ACTION_FENCE.source, "g");
  const bodies: string[] = [];
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    bodies.push(match[1]);
    match = pattern.exec(text);
  }
  return bodies;
}

export function buildAssistantActionSchemaHint(): string {
  return [
    "Proposable board actions (user must Approve in UI; max 5 per message):",
    `- Fence label inside answer: \`\`\`${ASSISTANT_ACTIONS_FENCE_LABEL}`,
    "- quick_capture: { type, text } — text must use Universal Capture prefix grammar (e.g. new idea: …, worked on …, followed up with …, agent finished …, resume exported for …, park …). Plain prose fails validation.",
    "- log_win: { type, text, cardId? } — prefer over quick_capture for progress notes; prefixes worked on automatically when cardId is set",
    "- park_card: { type, cardId, reason? } — prefer over quick_capture park … when the target card is known",
    "- update_next_tiny_action: { type, cardId, nextTinyAction }",
    "- create_agent_session: { type, cardId, goal?, agent?, taskName? }",
    "Do not claim an action is done until the user approves it."
  ].join("\n");
}

export function diagnoseAssistantActionParse(text: string): AssistantActionParseDiagnosis {
  const bodies = scanAssistantActionFenceBodies(text);
  let invalidJsonBlockCount = 0;
  for (const body of bodies) {
    try {
      const parsed = JSON.parse(body.trim());
      if (!Array.isArray(parsed)) {
        invalidJsonBlockCount += 1;
      }
    } catch {
      invalidJsonBlockCount += 1;
    }
  }
  return {
    hasFence: bodies.length > 0,
    fenceBlockCount: bodies.length,
    invalidJsonBlockCount,
    parsedCount: parseAssistantProposedActions(text).length
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function resolveCard(data: LifeHarnessData, cardId: string): LifeCard | null {
  return data.cards.find((card) => card.id === cardId) ?? null;
}

function rejectIfS3Card(card: LifeCard): string | null {
  if (!shouldIncludeCard(card)) {
    return "This card is S3-sensitive and cannot be changed from Companion.";
  }
  return null;
}

function riskForAction(type: AssistantActionKind): AssistantActionRisk {
  if (type === "quick_capture" || type === "log_win") {
    return "low";
  }
  return "medium";
}

function resolveSessionGoal(card: LifeCard, goal?: string): string {
  const explicit = goal?.trim();
  if (explicit) {
    return explicit;
  }
  const nextTinyAction = card.nextTinyAction?.trim();
  if (nextTinyAction) {
    return nextTinyAction;
  }
  return "";
}

function buildLogWinCaptureText(card: LifeCard | null, text: string): string {
  const trimmed = text.trim();
  if (card) {
    return `worked on ${card.title}: ${trimmed}`;
  }
  return `worked on ${trimmed}`;
}

function normalizeActionForHash(action: AssistantProposedAction): Record<string, string> {
  const base: Record<string, string> = { type: action.type };
  switch (action.type) {
    case "quick_capture":
      base.text = action.text.trim();
      break;
    case "log_win":
      base.text = action.text.trim();
      if (action.cardId) {
        base.cardId = action.cardId;
      }
      break;
    case "park_card":
      base.cardId = action.cardId;
      if (action.reason?.trim()) {
        base.reason = action.reason.trim();
      }
      break;
    case "update_next_tiny_action":
      base.cardId = action.cardId;
      base.nextTinyAction = action.nextTinyAction.trim();
      break;
    case "create_agent_session":
      base.cardId = action.cardId;
      if (action.agent?.trim()) {
        base.agent = action.agent.trim();
      }
      if (action.taskName?.trim()) {
        base.taskName = action.taskName.trim();
      }
      if (action.goal?.trim()) {
        base.goal = action.goal.trim();
      }
      break;
    default:
      break;
  }
  return base;
}

function hashStableJson(value: Record<string, string>): string {
  const serialized = JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce<Record<string, string>>((accumulator, key) => {
        accumulator[key] = value[key];
        return accumulator;
      }, {})
  );

  let hash = 0;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 31 + serialized.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function buildAssistantProposalId(
  turnId: string,
  actionIndex: number,
  action: AssistantProposedAction
): string {
  return `${turnId}/${actionIndex}/${hashStableJson(normalizeActionForHash(action))}`;
}

export function applyUpdateNextTinyAction(
  data: LifeHarnessData,
  cardId: string,
  nextTinyAction: string,
  now: string = nowIso()
): LifeHarnessData {
  const trimmed = nextTinyAction.trim();
  return {
    ...data,
    cards: data.cards.map((card) =>
      card.id === cardId
        ? {
            ...card,
            nextTinyAction: trimmed,
            lastTouched: now
          }
        : card
    )
  };
}

function parseActionItem(raw: unknown): AssistantProposedAction | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const type = item.type;
  if (typeof type !== "string" || !ASSISTANT_ACTION_KINDS.includes(type as AssistantActionKind)) {
    return null;
  }

  switch (type) {
    case "quick_capture":
      return isNonEmptyString(item.text) ? { type, text: item.text.trim() } : null;
    case "log_win":
      if (!isNonEmptyString(item.text)) {
        return null;
      }
      return {
        type,
        text: item.text.trim(),
        cardId: typeof item.cardId === "string" ? item.cardId : undefined
      };
    case "park_card":
      if (typeof item.cardId !== "string" || !isOptionalString(item.reason)) {
        return null;
      }
      return {
        type,
        cardId: item.cardId,
        reason: item.reason?.trim() || undefined
      };
    case "update_next_tiny_action":
      if (typeof item.cardId !== "string" || !isNonEmptyString(item.nextTinyAction)) {
        return null;
      }
      return {
        type,
        cardId: item.cardId,
        nextTinyAction: item.nextTinyAction.trim()
      };
    case "create_agent_session":
      if (typeof item.cardId !== "string") {
        return null;
      }
      if (
        !isOptionalString(item.agent) ||
        !isOptionalString(item.taskName) ||
        !isOptionalString(item.goal)
      ) {
        return null;
      }
      return {
        type,
        cardId: item.cardId,
        agent: item.agent?.trim() || undefined,
        taskName: item.taskName?.trim() || undefined,
        goal: item.goal?.trim() || undefined
      };
    default:
      return null;
  }
}

export function extractAssistantActionBlocks(text: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = new RegExp(ASSISTANT_ACTION_FENCE.source, "g");
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        blocks.push(parsed);
      }
    } catch {
      // ignore invalid JSON
    }
    match = pattern.exec(text);
  }
  return blocks;
}

export function parseAssistantProposedActions(text: string): AssistantProposedAction[] {
  const actions: AssistantProposedAction[] = [];
  for (const block of extractAssistantActionBlocks(text)) {
    if (!Array.isArray(block)) {
      continue;
    }
    for (const item of block) {
      const parsed = parseActionItem(item);
      if (parsed) {
        actions.push(parsed);
        if (actions.length >= MAX_ASSISTANT_ACTIONS_PER_MESSAGE) {
          return actions;
        }
      }
    }
  }
  return actions;
}

export function stripAssistantActionBlocks(text: string): string {
  return text.replace(ASSISTANT_ACTION_FENCE, "").trim();
}

export function validateAssistantAction(
  data: LifeHarnessData,
  action: AssistantProposedAction,
  routing?: CapabilityRoutingResult
): AssistantActionValidationResult {
  if (routing && !isAssistantActionAllowed(action.type, routing)) {
    return {
      ok: false,
      error: `Action "${action.type}" is not allowed for this request intent (${routing.intent}).`
    };
  }

  const risk = riskForAction(action.type);

  switch (action.type) {
    case "quick_capture": {
      const text = action.text.trim();
      if (!text) {
        return { ok: false, error: "Capture text is required." };
      }
      if (!parseUniversalCapture(text)) {
        return { ok: false, error: CAPTURE_GRAMMAR_HINT };
      }
      return {
        ok: true,
        preview: {
          title: "Quick capture",
          description: text,
          risk
        }
      };
    }
    case "log_win": {
      const text = action.text.trim();
      if (!text) {
        return { ok: false, error: "Win text is required." };
      }
      if (action.cardId) {
        const card = resolveCard(data, action.cardId);
        if (!card) {
          return { ok: false, error: "Card not found." };
        }
        const s3Error = rejectIfS3Card(card);
        if (s3Error) {
          return { ok: false, error: s3Error };
        }
        return {
          ok: true,
          preview: {
            title: "Log win",
            description: text,
            risk,
            cardTitle: card.title
          }
        };
      }
      return {
        ok: true,
        preview: {
          title: "Log win",
          description: text,
          risk
        }
      };
    }
    case "park_card": {
      const card = resolveCard(data, action.cardId);
      if (!card) {
        return { ok: false, error: "Card not found." };
      }
      const s3Error = rejectIfS3Card(card);
      if (s3Error) {
        return { ok: false, error: s3Error };
      }
      if (card.state === "parked" || card.state === "killed") {
        return { ok: false, error: `Card is already ${card.state}.` };
      }
      const reason = action.reason?.trim();
      return {
        ok: true,
        preview: {
          title: "Park card",
          description: reason ? `Park ${card.title} — ${reason}` : `Park ${card.title}`,
          risk,
          cardTitle: card.title
        }
      };
    }
    case "update_next_tiny_action": {
      const nextTinyAction = action.nextTinyAction.trim();
      if (!nextTinyAction) {
        return { ok: false, error: "Next tiny action is required." };
      }
      const card = resolveCard(data, action.cardId);
      if (!card) {
        return { ok: false, error: "Card not found." };
      }
      const s3Error = rejectIfS3Card(card);
      if (s3Error) {
        return { ok: false, error: s3Error };
      }
      return {
        ok: true,
        preview: {
          title: "Update next tiny action",
          description: nextTinyAction,
          risk,
          cardTitle: card.title
        }
      };
    }
    case "create_agent_session": {
      const card = resolveCard(data, action.cardId);
      if (!card) {
        return { ok: false, error: "Card not found." };
      }
      const s3Error = rejectIfS3Card(card);
      if (s3Error) {
        return { ok: false, error: s3Error };
      }
      const goal = resolveSessionGoal(card, action.goal);
      if (!goal) {
        return { ok: false, error: "Session goal is required." };
      }
      const agent = normalizeAgentKind(action.agent);
      const taskName = action.taskName?.trim() || `Work on ${card.title}`;
      return {
        ok: true,
        preview: {
          title: "Create agent session",
          description: `${taskName} · ${goal} (${agent})`,
          risk,
          cardTitle: card.title
        }
      };
    }
    default:
      return { ok: false, error: "Unsupported action." };
  }
}

export function applyConfirmedAssistantAction(
  data: LifeHarnessData,
  action: AssistantProposedAction
): AssistantActionApplyResult {
  const validation = validateAssistantAction(data, action);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  switch (action.type) {
    case "quick_capture": {
      const result = applyQuickCapture(data, action.text.trim());
      if (!result.ok) {
        return { ok: false, error: result.message ?? "Capture failed." };
      }
      return { ok: true, data: result.state, message: result.message ?? "Captured." };
    }
    case "log_win": {
      const card = action.cardId ? resolveCard(data, action.cardId) : null;
      const captureText = buildLogWinCaptureText(card, action.text);
      const result = applyQuickCapture(data, captureText);
      if (!result.ok) {
        return { ok: false, error: result.message ?? "Win log failed." };
      }
      return { ok: true, data: result.state, message: result.message ?? "Win logged." };
    }
    case "park_card": {
      const result = applyCardStateChange(data, action.cardId, "parked");
      if (!result.ok) {
        return { ok: false, error: result.message ?? "Park failed." };
      }
      return { ok: true, data: result.state, message: result.message ?? "Card parked." };
    }
    case "update_next_tiny_action": {
      const nextData = applyUpdateNextTinyAction(data, action.cardId, action.nextTinyAction);
      return {
        ok: true,
        data: nextData,
        message: "Next tiny action updated."
      };
    }
    case "create_agent_session": {
      const card = resolveCard(data, action.cardId);
      if (!card) {
        return { ok: false, error: "Card not found." };
      }
      const goal = resolveSessionGoal(card, action.goal);
      const result = createAgentSessionForCard(data, {
        cardId: action.cardId,
        agent: normalizeAgentKind(action.agent),
        taskName: action.taskName?.trim() || `Work on ${card.title}`,
        goal
      });
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return {
        ok: true,
        data: result.state,
        message: "Agent session created."
      };
    }
    default:
      return { ok: false, error: "Unsupported action." };
  }
}
