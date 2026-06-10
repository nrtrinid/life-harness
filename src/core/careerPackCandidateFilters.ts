import type { CareerCandidateMatch, CareerFitTier } from "./careerPackMatching";
import type { JobCandidate } from "./types";

export interface CareerPackCandidateFilters {
  fitTier?: CareerFitTier | "all";
  roleRecipeId?: string | "all";
  moduleId?: string | "all";
  skill?: string | "all";
  sourceId?: string | "all";
  hideWeak?: boolean;
  hideCautions?: boolean;
  searchText?: string;
}

export type CareerPackSortMode = "best_fit" | "newest" | "queue_order";

const TIER_RANK: Record<CareerFitTier, number> = {
  strong: 3,
  mixed: 2,
  weak: 1
};

function matchesSearch(candidate: JobCandidate, searchText: string): boolean {
  const needle = searchText.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const haystack = [
    candidate.company,
    candidate.roleTitle,
    candidate.location ?? "",
    candidate.description
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function filterAndSortCandidatesWithCareerPack(
  candidates: JobCandidate[],
  matchesById: Map<string, CareerCandidateMatch>,
  filters: CareerPackCandidateFilters,
  sortMode: CareerPackSortMode
): JobCandidate[] {
  if (matchesById.size === 0) {
    return candidates;
  }

  const fitTier = filters.fitTier ?? "all";
  const roleRecipeId = filters.roleRecipeId ?? "all";
  const moduleId = filters.moduleId ?? "all";
  const skill = filters.skill ?? "all";
  const sourceId = filters.sourceId ?? "all";
  const hideWeak = filters.hideWeak ?? false;
  const hideCautions = filters.hideCautions ?? false;
  const searchText = filters.searchText ?? "";

  const filtered = candidates.filter((candidate) => {
    const match = matchesById.get(candidate.id);
    if (!match) {
      return true;
    }

    if (fitTier !== "all" && match.fitTier !== fitTier) {
      return false;
    }
    if (roleRecipeId !== "all" && match.roleRecipeId !== roleRecipeId) {
      return false;
    }
    if (moduleId !== "all" && !match.matchedModuleIds.includes(moduleId)) {
      return false;
    }
    if (skill !== "all") {
      const skillLower = skill.toLowerCase();
      const hasSkill =
        candidate.matchedSkills?.some((s) => s.toLowerCase().includes(skillLower)) ||
        candidate.description.toLowerCase().includes(skillLower);
      if (!hasSkill) {
        return false;
      }
    }
    if (sourceId !== "all" && candidate.sourceId !== sourceId) {
      return false;
    }
    if (hideWeak && match.fitTier === "weak") {
      return false;
    }
    if (hideCautions && match.cautionSignals.length > 0) {
      return false;
    }
    if (!matchesSearch(candidate, searchText)) {
      return false;
    }
    return true;
  });

  if (sortMode === "queue_order") {
    return filtered;
  }

  const sorted = [...filtered];
  if (sortMode === "newest") {
    sorted.sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt));
    return sorted;
  }

  sorted.sort((a, b) => {
    const matchA = matchesById.get(a.id);
    const matchB = matchesById.get(b.id);
    const tierA = TIER_RANK[matchA?.fitTier ?? "mixed"];
    const tierB = TIER_RANK[matchB?.fitTier ?? "mixed"];
    if (tierB !== tierA) {
      return tierB - tierA;
    }
    return b.fitScore - a.fitScore;
  });
  return sorted;
}
