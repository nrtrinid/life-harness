import type { Briefing, LifeCard, PrimaryAction } from "./types";

export interface BonusTrack {
  title: string;
  reason: string;
  ctaLabel?: string;
  targetRoute?: string;
  cardId?: string;
}

function lineUsedByPrimary(line: string, primaryAction: PrimaryAction): boolean {
  const lower = line.toLowerCase();
  if (primaryAction.kind === "pounce" && lower.includes("pounce")) {
    return true;
  }
  if (primaryAction.smallestAction && lower.includes(primaryAction.smallestAction.toLowerCase().slice(0, 24))) {
    return true;
  }
  if (primaryAction.title && lower.includes(primaryAction.title.toLowerCase().slice(0, 24))) {
    return true;
  }
  return false;
}

export function computeBonusTrack(
  briefing: Briefing,
  primaryAction: PrimaryAction,
  cards: LifeCard[] = []
): BonusTrack | null {
  for (const line of briefing.prepared) {
    if (lineUsedByPrimary(line, primaryAction)) {
      continue;
    }

    if (line.startsWith("Suggested salvage:")) {
      return {
        title: line.replace("Suggested salvage: ", ""),
        reason: "A small salvage move could restart momentum.",
        ctaLabel: "Take it"
      };
    }

    if (line.startsWith("Suggested pounce:")) {
      return {
        title: line.replace("Suggested pounce: ", ""),
        reason: "Optional — keeps the loop warm without pressure.",
        ctaLabel: "Take it",
        targetRoute: "/career"
      };
    }
  }

  const improvement = briefing.detected.find(
    (line) =>
      !lineUsedByPrimary(line, primaryAction) &&
      (line.includes("README") ||
        line.includes("idle") ||
        line.includes("dormant") ||
        line.includes("is cold") ||
        line.includes("improve"))
  );

  if (improvement) {
    const cardMatch = cards.find((card) => improvement.includes(card.title));
    return {
      title: improvement.replace(/\.$/, ""),
      reason: "Bonus track — small and optional.",
      ctaLabel: "Take it",
      cardId: cardMatch?.id,
      targetRoute: cardMatch ? `/card/${cardMatch.id}` : undefined
    };
  }

  return null;
}
