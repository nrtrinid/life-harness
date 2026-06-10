import type { LifeCard, LifeLogEntry, SensitivityLevel } from "./types";
import { ContextPacketBuildError } from "./contextPacket";
import type { BoardCardSlice } from "./contextPacket";
import { isSensitiveThreadLine } from "./chatThreadState";
import { mapCardState, mapLifeArea, mapWarmth } from "./harnessContext";

const LEAK_MARKERS = /\b(vice|gambl|spend|porn|drink|drug)\b/i;

function effectiveSensitivity(
  entity: { sensitivity?: SensitivityLevel },
  fallback: SensitivityLevel = "S1"
): SensitivityLevel {
  return entity.sensitivity ?? fallback;
}

export function assertRequestSensitivityAllowed(sensitivity: SensitivityLevel): void {
  if (sensitivity === "S3") {
    throw new ContextPacketBuildError(
      "S3 sensitivity is rules-only — context packet cannot be sent to a model."
    );
  }
}

export function shouldIncludeCard(card: LifeCard): boolean {
  return effectiveSensitivity(card) !== "S3";
}

export function shouldIncludeLog(log: LifeLogEntry): boolean {
  return effectiveSensitivity(log) !== "S3";
}

export function redactCardSlice(card: LifeCard, harnessWhy: string, harnessNta: string): BoardCardSlice {
  const sensitivity = effectiveSensitivity(card);
  let whyItMatters = harnessWhy;
  if (
    sensitivity === "S2" &&
    (card.area === "stability_vices" || card.area === "money_independence") &&
    LEAK_MARKERS.test(harnessWhy)
  ) {
    whyItMatters = "";
  }

  return {
    cardId: card.id,
    title: card.title,
    area: mapLifeArea(card.area),
    state: mapCardState(card.state),
    warmth: mapWarmth(card.warmth),
    progress: card.progress ?? 0,
    nextTinyAction: harnessNta,
    whyItMatters,
    isStale: false
  };
}

export function redactLogSummary(log: LifeLogEntry, cardTitle: string): string {
  const sensitivity = effectiveSensitivity(log);
  if (sensitivity === "S2" || sensitivity === "S3") {
    return `${log.type} signal on ${cardTitle} (${mapLifeArea(log.area)}).`;
  }

  if (log.rawText?.trim()) {
    return log.rawText.trim();
  }

  return `${log.type} signal on ${cardTitle} (${mapLifeArea(log.area)}).`;
}

export function filterPinnedFacts(facts: string[]): string[] {
  return facts.filter((fact) => !isSensitiveThreadLine(fact));
}
