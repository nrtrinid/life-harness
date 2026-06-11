import type { LifeHarnessData } from "./actions";
import { createId, nowIso } from "./ids";
import type { HarnessProject } from "./types";

export type HarnessProjectUpsertInput = {
  cardId: string;
  name?: string;
  repoPath?: string;
  branch?: string;
  docs?: string[];
  likelyFiles?: string[];
  verificationCommands?: string[];
  notes?: string;
};

export type CardProjectContextSummary = {
  projectId: string;
  cardId: string;
  name: string;
  repoPath?: string;
  branch?: string;
  docs: string[];
  likelyFiles: string[];
  verificationCommands: string[];
  notes?: string;
};

export function parseListField(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatListField(items: string[] | undefined): string {
  return (items ?? []).join("\n");
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanStringList(items: string[] | undefined): string[] | undefined {
  const cleaned = (items ?? []).map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function getProjectForCard(
  data: LifeHarnessData,
  cardId: string
): HarnessProject | undefined {
  return data.projects.find((project) => project.cardId === cardId);
}

export function buildProjectContextForCard(
  data: LifeHarnessData,
  cardId: string
): CardProjectContextSummary | undefined {
  const project = getProjectForCard(data, cardId);
  if (!project) {
    return undefined;
  }

  return {
    projectId: project.id,
    cardId: project.cardId,
    name: project.name,
    repoPath: project.repoPath,
    branch: project.branch,
    docs: project.docs ?? [],
    likelyFiles: project.likelyFiles ?? [],
    verificationCommands: project.verificationCommands ?? [],
    notes: project.notes
  };
}

export function upsertProjectForCard(
  data: LifeHarnessData,
  input: HarnessProjectUpsertInput,
  now: string = nowIso()
): { ok: true; state: LifeHarnessData } | { ok: false; error: string } {
  const card = data.cards.find((item) => item.id === input.cardId);
  if (!card) {
    return { ok: false, error: `Card not found: ${input.cardId}` };
  }

  const existing = getProjectForCard(data, input.cardId);
  const project: HarnessProject = {
    id: existing?.id ?? createId("project"),
    cardId: input.cardId,
    name: cleanOptional(input.name) ?? existing?.name ?? card.title,
    repoPath: cleanOptional(input.repoPath),
    branch: cleanOptional(input.branch),
    docs: cleanStringList(input.docs),
    likelyFiles: cleanStringList(input.likelyFiles),
    verificationCommands: cleanStringList(input.verificationCommands),
    notes: cleanOptional(input.notes),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  const projects = existing
    ? data.projects.map((item) => (item.cardId === input.cardId ? project : item))
    : [project, ...data.projects];

  return {
    ok: true,
    state: {
      ...data,
      projects
    }
  };
}

export function deleteProjectForCard(data: LifeHarnessData, cardId: string): LifeHarnessData {
  return {
    ...data,
    projects: data.projects.filter((project) => project.cardId !== cardId)
  };
}

export function applyUpsertProjectForCard(
  state: LifeHarnessData,
  input: HarnessProjectUpsertInput,
  now?: string
): { ok: true; state: LifeHarnessData } | { ok: false; error: string } {
  return upsertProjectForCard(state, input, now);
}

export function applyDeleteProjectForCard(state: LifeHarnessData, cardId: string): LifeHarnessData {
  return deleteProjectForCard(state, cardId);
}
