import type { LifeHarnessData } from "./actions";
import { ACTIVE_CARD_LIMIT, getActiveLimitStatus } from "./guards";
import { computeCardWarmth } from "./warmth";

export type WeeklyReviewSummary = {
  starts: number;
  pounces: number;
  recoveries: number;
  proofCount: number;
  dormantCards: Array<{ id: string; title: string }>;
  activeCount: number;
  activeLimit: number;
  bestProof?: string;
  suggestedPatch: string;
};

const RECOVERY_TYPES = new Set(["mvd", "salvage"]);

function weekCutoff(nowIso: string): string {
  const cutoff = new Date(nowIso);
  cutoff.setDate(cutoff.getDate() - 7);
  return cutoff.toISOString();
}

function inWindow(timestamp: string, cutoff: string, nowIso: string): boolean {
  return timestamp >= cutoff && timestamp <= nowIso;
}

function buildSuggestedPatch(summary: {
  activeCount: number;
  activeLimit: number;
  dormantCards: Array<{ id: string; title: string }>;
  proofCount: number;
  pounces: number;
}): string {
  if (summary.activeCount > summary.activeLimit) {
    return "Park one active card before adding more.";
  }
  if (summary.dormantCards.length > 0) {
    return "Reheat one dormant card or park it to lighten the board.";
  }
  if (summary.proofCount === 0) {
    return "Log one proof item next week — even a small win counts.";
  }
  if (summary.pounces === 0) {
    return "Do one pounce next week to keep momentum.";
  }
  return "Keep the current system stable — you're in a good rhythm.";
}

export function buildWeeklyReviewSummary(
  state: LifeHarnessData,
  now?: string
): WeeklyReviewSummary {
  const nowIso = now ?? new Date().toISOString();
  const cutoff = weekCutoff(nowIso);
  const nowDate = new Date(nowIso);

  const weekLogs = state.logs.filter((log) => inWindow(log.timestamp, cutoff, nowIso));
  const weekProof = state.proofItems.filter((proof) => inWindow(proof.timestamp, cutoff, nowIso));

  const pounces = weekLogs.filter((log) => log.type === "pounce").length;
  const recoveries = weekLogs.filter((log) => RECOVERY_TYPES.has(log.type)).length;

  // Soft indicator: clarity logs approximate "starts" when no dedicated start log type exists.
  const starts = weekLogs.filter((log) => log.type === "clarity").length;

  const dormantCards = state.cards
    .filter((card) => card.state === "active" && computeCardWarmth(card, state.logs, nowDate) === "dormant")
    .map((card) => ({ id: card.id, title: card.title }));

  const activeLimit = getActiveLimitStatus(state.cards);
  const bestProof = [...weekProof].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.title;

  const counts = {
    activeCount: activeLimit.count,
    activeLimit: ACTIVE_CARD_LIMIT,
    dormantCards,
    proofCount: weekProof.length,
    pounces
  };

  return {
    starts,
    pounces,
    recoveries,
    proofCount: weekProof.length,
    dormantCards,
    activeCount: activeLimit.count,
    activeLimit: ACTIVE_CARD_LIMIT,
    bestProof,
    suggestedPatch: buildSuggestedPatch(counts)
  };
}
