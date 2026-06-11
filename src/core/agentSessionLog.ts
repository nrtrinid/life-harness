import type { LifeHarnessData } from "./lifeHarnessData";
import { createId, nowIso } from "./ids";
import { getProjectForCard } from "./projectRegistry";
import type { HarnessAgentKind, HarnessAgentSession, HarnessAgentSessionStatus, LifeCard } from "./types";

const AGENT_KINDS: HarnessAgentKind[] = [
  "codex",
  "cursor",
  "chatgpt",
  "local",
  "manual",
  "other"
];

export type HarnessAgentSessionCreateInput = {
  cardId: string;
  agent?: HarnessAgentKind;
  taskName?: string;
  goal?: string;
  promptExcerpt?: string;
  resultSummary?: string;
  filesChanged?: string[];
  verificationCommands?: string[];
  verificationResult?: string;
  commitHash?: string;
  followUps?: string[];
};

export type HarnessAgentSessionUpdateInput = Partial<
  Omit<HarnessAgentSession, "id" | "cardId" | "createdAt">
>;

export type HarnessAgentSessionCompleteInput = HarnessAgentSessionUpdateInput;

export type AgentSessionProofSummary = {
  proofTitle: string;
  logText: string;
};

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanStringList(items: string[] | undefined): string[] | undefined {
  const cleaned = (items ?? []).map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

function resolveDefaultSessionGoal(card: LifeCard): string {
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

export function normalizeAgentKind(value: string | undefined): HarnessAgentKind {
  const normalized = value?.trim().toLowerCase();
  if (normalized && AGENT_KINDS.includes(normalized as HarnessAgentKind)) {
    return normalized as HarnessAgentKind;
  }
  return "other";
}

export function sessionAlreadyHasEvidence(session: HarnessAgentSession): boolean {
  return !!(
    session.evidenceLogId ||
    session.evidenceProofItemId ||
    (session.status === "done" && session.completedAt)
  );
}

export function getAgentSessionsForCard(
  data: LifeHarnessData,
  cardId: string
): HarnessAgentSession[] {
  return data.agentSessions
    .filter((session) => session.cardId === cardId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function getRecentAgentSessions(
  data: LifeHarnessData,
  limit = 5
): HarnessAgentSession[] {
  return [...data.agentSessions]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

export function buildAgentSessionProofSummary(session: HarnessAgentSession): AgentSessionProofSummary {
  const proofTitle = `Agent session: ${session.taskName}`;
  const details: string[] = [proofTitle];
  if (session.resultSummary) {
    details.push(session.resultSummary);
  }
  if (session.commitHash) {
    details.push(`commit ${session.commitHash}`);
  }
  return {
    proofTitle,
    logText: details.join(" — ")
  };
}

function resolveProjectId(data: LifeHarnessData, cardId: string): string | undefined {
  return getProjectForCard(data, cardId)?.id;
}

function buildSessionFromInput(
  data: LifeHarnessData,
  cardId: string,
  input: HarnessAgentSessionCreateInput,
  now: string,
  existing?: HarnessAgentSession
): HarnessAgentSession | { error: string } {
  const card = data.cards.find((item) => item.id === cardId);
  if (!card) {
    return { error: `Card not found: ${cardId}` };
  }

  return {
    id: existing?.id ?? createId("agent_session"),
    cardId,
    projectId: existing?.projectId ?? resolveProjectId(data, cardId),
    agent: input.agent ? normalizeAgentKind(String(input.agent)) : existing?.agent ?? "codex",
    status: existing?.status ?? "sent",
    taskName: cleanOptional(input.taskName) ?? existing?.taskName ?? `Work on ${card.title}`,
    goal: cleanOptional(input.goal) ?? existing?.goal ?? resolveDefaultSessionGoal(card),
    promptExcerpt: cleanOptional(input.promptExcerpt) ?? existing?.promptExcerpt,
    resultSummary: cleanOptional(input.resultSummary) ?? existing?.resultSummary,
    filesChanged: cleanStringList(input.filesChanged) ?? existing?.filesChanged,
    verificationCommands:
      cleanStringList(input.verificationCommands) ??
      existing?.verificationCommands ??
      getProjectForCard(data, cardId)?.verificationCommands,
    verificationResult: cleanOptional(input.verificationResult) ?? existing?.verificationResult,
    commitHash: cleanOptional(input.commitHash) ?? existing?.commitHash,
    followUps: cleanStringList(input.followUps) ?? existing?.followUps,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    completedAt: existing?.completedAt,
    evidenceLogId: existing?.evidenceLogId,
    evidenceProofItemId: existing?.evidenceProofItemId
  };
}

export function createAgentSessionForCard(
  data: LifeHarnessData,
  input: HarnessAgentSessionCreateInput,
  now: string = nowIso()
):
  | { ok: true; state: LifeHarnessData; sessionId: string }
  | { ok: false; error: string } {
  const built = buildSessionFromInput(data, input.cardId, input, now);
  if ("error" in built) {
    return { ok: false, error: built.error };
  }

  return {
    ok: true,
    sessionId: built.id,
    state: {
      ...data,
      agentSessions: [built, ...data.agentSessions]
    }
  };
}

export function updateAgentSession(
  data: LifeHarnessData,
  sessionId: string,
  patch: HarnessAgentSessionUpdateInput,
  now: string = nowIso()
): { ok: true; state: LifeHarnessData } | { ok: false; error: string } {
  const existing = data.agentSessions.find((session) => session.id === sessionId);
  if (!existing) {
    return { ok: false, error: `Session not found: ${sessionId}` };
  }

  const session: HarnessAgentSession = {
    ...existing,
    agent: patch.agent !== undefined ? normalizeAgentKind(String(patch.agent)) : existing.agent,
    status: patch.status ?? existing.status,
    taskName: cleanOptional(patch.taskName) ?? existing.taskName,
    goal: cleanOptional(patch.goal) ?? existing.goal,
    promptExcerpt:
      patch.promptExcerpt !== undefined ? cleanOptional(patch.promptExcerpt) : existing.promptExcerpt,
    resultSummary:
      patch.resultSummary !== undefined ? cleanOptional(patch.resultSummary) : existing.resultSummary,
    filesChanged:
      patch.filesChanged !== undefined ? cleanStringList(patch.filesChanged) : existing.filesChanged,
    verificationCommands:
      patch.verificationCommands !== undefined
        ? cleanStringList(patch.verificationCommands)
        : existing.verificationCommands,
    verificationResult:
      patch.verificationResult !== undefined
        ? cleanOptional(patch.verificationResult)
        : existing.verificationResult,
    commitHash: patch.commitHash !== undefined ? cleanOptional(patch.commitHash) : existing.commitHash,
    followUps: patch.followUps !== undefined ? cleanStringList(patch.followUps) : existing.followUps,
    projectId: patch.projectId ?? existing.projectId,
    completedAt: patch.completedAt ?? existing.completedAt,
    evidenceLogId: patch.evidenceLogId ?? existing.evidenceLogId,
    evidenceProofItemId: patch.evidenceProofItemId ?? existing.evidenceProofItemId,
    updatedAt: now
  };

  return {
    ok: true,
    state: {
      ...data,
      agentSessions: data.agentSessions.map((item) => (item.id === sessionId ? session : item))
    }
  };
}

export function completeAgentSession(
  data: LifeHarnessData,
  sessionId: string,
  input: HarnessAgentSessionCompleteInput = {},
  now: string = nowIso()
): { ok: true; state: LifeHarnessData } | { ok: false; error: string } {
  const existing = data.agentSessions.find((session) => session.id === sessionId);
  if (!existing) {
    return { ok: false, error: `Session not found: ${sessionId}` };
  }

  return updateAgentSession(
    data,
    sessionId,
    {
      ...input,
      status: "done" as HarnessAgentSessionStatus,
      completedAt: existing.completedAt ?? now
    },
    now
  );
}

export function deleteAgentSession(data: LifeHarnessData, sessionId: string): LifeHarnessData {
  return {
    ...data,
    agentSessions: data.agentSessions.filter((session) => session.id !== sessionId)
  };
}

export function applyCreateAgentSessionForCard(
  state: LifeHarnessData,
  input: HarnessAgentSessionCreateInput,
  now?: string
) {
  return createAgentSessionForCard(state, input, now);
}

export function applyUpdateAgentSession(
  state: LifeHarnessData,
  sessionId: string,
  patch: HarnessAgentSessionUpdateInput,
  now?: string
) {
  return updateAgentSession(state, sessionId, patch, now);
}

export function applyCompleteAgentSession(
  state: LifeHarnessData,
  sessionId: string,
  input?: HarnessAgentSessionCompleteInput,
  now?: string
) {
  return completeAgentSession(state, sessionId, input, now);
}

export function applyDeleteAgentSession(state: LifeHarnessData, sessionId: string): LifeHarnessData {
  return deleteAgentSession(state, sessionId);
}
