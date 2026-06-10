import type { Briefing, DailyState, LifeCard, LifeLogEntry, PrimaryAction } from "./types";

/**
 * Computes the single recommended primary action for the Today screen.
 * Extracts the first "Suggested pounce:" from briefing.prepared and determines
 * whether it's a direct action (pounce) or a deep link to another screen.
 */
export function computePrimaryAction(
  briefing: Briefing,
  dailyState: DailyState,
  cards: LifeCard[],
  logs: LifeLogEntry[],
  now: Date
): PrimaryAction {
  // Extract first "Suggested pounce:" line from briefing.prepared
  const pounceLines = briefing.prepared.filter((line) =>
    line.includes("Suggested pounce:")
  );

  if (pounceLines.length === 0) {
    // Fallback to dailyState seed data
    return {
      actionText: dailyState.pounceMission ?? "Pick one tiny action",
      buttonLabel: "Start Pounce",
      smallestStart: dailyState.smallestStart,
      isPounce: true,
      isDeepLink: false
    };
  }

  const suggestedPounce = pounceLines[0].replace("Suggested pounce: ", "");

  // Deep link map: keyword patterns → target routes
  const deepLinkMap: Array<{ keyword: string; route: string; label: string }> = [
    { keyword: "paste one job", route: "/candidate-intake", label: "Open Intake" },
    {
      keyword: "review one fetched candidate",
      route: "/career-hub?section=candidates",
      label: "Open Queue"
    },
    {
      keyword: "approve one saved candidate",
      route: "/career-hub?section=candidates",
      label: "Open Queue"
    },
    { keyword: "run due job sources", route: "/job-sources", label: "Run Sources" },
    { keyword: "run one approved job source", route: "/job-sources", label: "Run Sources" },
    {
      keyword: "send one follow-up",
      route: "/career-hub?section=followups",
      label: "Open Follow-ups"
    }
  ];

  // Check if this is a deep link action
  for (const { keyword, route, label } of deepLinkMap) {
    if (suggestedPounce.toLowerCase().includes(keyword)) {
      return {
        actionText: suggestedPounce,
        buttonLabel: label,
        targetRoute: route,
        isPounce: false,
        isDeepLink: true
      };
    }
  }

  // Default: pounce action
  return {
    actionText: suggestedPounce,
    buttonLabel: "Start Pounce",
    smallestStart: dailyState.smallestStart,
    isPounce: true,
    isDeepLink: false
  };
}
