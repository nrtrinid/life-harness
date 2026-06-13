import type {
  CareerPackResumeModule,
  CareerPackRoleRecipe,
  CareerSourcePackV1,
  StoredCareerSourcePack
} from "./careerSourcePack";

export interface CareerPackEntityChanges {
  added: string[];
  removed: string[];
  updated: string[];
}

export interface CareerPackRefreshSummary {
  incomingGeneratedAt: string;
  storedGeneratedAt?: string;
  isNewerThanStored: boolean;
  moduleChanges: CareerPackEntityChanges;
  roleRecipeChanges: CareerPackEntityChanges;
  modulesToUpsertInBank: number;
  parseWarnings: string[];
}

function sortedJoin(values: string[]): string {
  return [...values].sort().join("\0");
}

function bulletsSignature(bullets: string[]): string {
  return bullets.join("\0");
}

function moduleChanged(
  stored: CareerPackResumeModule,
  incoming: CareerPackResumeModule
): boolean {
  if (stored.title !== incoming.title || stored.summary !== incoming.summary) {
    return true;
  }
  if (bulletsSignature(stored.bullets) !== bulletsSignature(incoming.bullets)) {
    return true;
  }
  if (sortedJoin(stored.skills) !== sortedJoin(incoming.skills)) {
    return true;
  }
  const storedPlacement = stored.resumePlacement;
  const incomingPlacement = incoming.resumePlacement;
  if (Boolean(storedPlacement) !== Boolean(incomingPlacement)) {
    return true;
  }
  if (storedPlacement && incomingPlacement) {
    if (
      storedPlacement.heading !== incomingPlacement.heading ||
      storedPlacement.date !== incomingPlacement.date ||
      storedPlacement.section !== incomingPlacement.section
    ) {
      return true;
    }
  }
  return false;
}

function roleRecipeChanged(stored: CareerPackRoleRecipe, incoming: CareerPackRoleRecipe): boolean {
  if (stored.summaryAngle !== incoming.summaryAngle) {
    return true;
  }
  if (sortedJoin(stored.preferredModuleIds) !== sortedJoin(incoming.preferredModuleIds)) {
    return true;
  }
  if (stored.targetKeywords.length !== incoming.targetKeywords.length) {
    return true;
  }
  return false;
}

function diffEntities<T extends { id: string }>(
  storedItems: T[],
  incomingItems: T[],
  hasChanged: (stored: T, incoming: T) => boolean
): CareerPackEntityChanges {
  const storedById = new Map(storedItems.map((item) => [item.id, item]));
  const incomingById = new Map(incomingItems.map((item) => [item.id, item]));
  const added: string[] = [];
  const removed: string[] = [];
  const updated: string[] = [];

  for (const incoming of incomingItems) {
    const stored = storedById.get(incoming.id);
    if (!stored) {
      added.push(incoming.id);
      continue;
    }
    if (hasChanged(stored, incoming)) {
      updated.push(incoming.id);
    }
  }

  for (const stored of storedItems) {
    if (!incomingById.has(stored.id)) {
      removed.push(stored.id);
    }
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    updated: updated.sort()
  };
}

export function isIncomingPackNewer(
  stored: StoredCareerSourcePack | null,
  incoming: CareerSourcePackV1
): boolean {
  if (!stored) {
    return true;
  }
  return (
    incoming.extractionMetadata.generatedAt > stored.pack.extractionMetadata.generatedAt
  );
}

export function summarizeCareerPackRefresh(
  stored: StoredCareerSourcePack | null,
  incoming: CareerSourcePackV1,
  parseWarnings: string[] = []
): CareerPackRefreshSummary {
  const storedModules = stored?.pack.resumeModules ?? [];
  const storedRecipes = stored?.pack.roleRecipes ?? [];
  const moduleChanges = diffEntities(storedModules, incoming.resumeModules, moduleChanged);
  const roleRecipeChanges = diffEntities(storedRecipes, incoming.roleRecipes, roleRecipeChanged);
  const storedGeneratedAt = stored?.pack.extractionMetadata.generatedAt;
  const incomingGeneratedAt = incoming.extractionMetadata.generatedAt;

  return {
    incomingGeneratedAt,
    storedGeneratedAt,
    isNewerThanStored: isIncomingPackNewer(stored, incoming),
    moduleChanges,
    roleRecipeChanges,
    modulesToUpsertInBank: incoming.resumeModules.length,
    parseWarnings
  };
}

function formatEntityChangeLine(
  label: string,
  changes: CareerPackEntityChanges
): string | undefined {
  const parts: string[] = [];
  if (changes.added.length > 0) {
    parts.push(`${changes.added.length} added (${changes.added.join(", ")})`);
  }
  if (changes.updated.length > 0) {
    parts.push(`${changes.updated.length} updated (${changes.updated.join(", ")})`);
  }
  if (changes.removed.length > 0) {
    parts.push(`${changes.removed.length} removed (${changes.removed.join(", ")})`);
  }
  if (parts.length === 0) {
    return undefined;
  }
  return `${label}: ${parts.join(" · ")}`;
}

export function formatCareerPackRefreshSummary(summary: CareerPackRefreshSummary): string[] {
  const lines: string[] = [];
  const moduleLine = formatEntityChangeLine("Resume modules", summary.moduleChanges);
  const recipeLine = formatEntityChangeLine("Role recipes", summary.roleRecipeChanges);

  if (moduleLine) {
    lines.push(moduleLine);
  }
  if (recipeLine) {
    lines.push(recipeLine);
  }
  if (!moduleLine && !recipeLine) {
    lines.push("No module or role recipe changes detected.");
  }
  lines.push(`${summary.modulesToUpsertInBank} module(s) will upsert into Resume Bank.`);
  return lines;
}

export function hasCareerPackRefreshChanges(summary: CareerPackRefreshSummary): boolean {
  const { moduleChanges, roleRecipeChanges } = summary;
  return (
    moduleChanges.added.length > 0 ||
    moduleChanges.removed.length > 0 ||
    moduleChanges.updated.length > 0 ||
    roleRecipeChanges.added.length > 0 ||
    roleRecipeChanges.removed.length > 0 ||
    roleRecipeChanges.updated.length > 0
  );
}
