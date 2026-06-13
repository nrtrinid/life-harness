import type { CareerHubSummary } from "./careerHub";

export interface TodayCareerShortcut {
  label: string;
  href: string;
  kind: "primary" | "secondary";
}

export function buildTodayCareerShortcuts(
  summary: CareerHubSummary,
  dueSources: number
): TodayCareerShortcut[] {
  const shortcuts: TodayCareerShortcut[] = [
    {
      label: summary.nextAction.ctaLabel,
      href: summary.nextAction.href,
      kind: "primary"
    },
    {
      label: "Open Jobs board",
      href: "/career",
      kind: "secondary"
    }
  ];

  const nextActionPointsToFindSources =
    summary.nextAction.tab === "find" &&
    (summary.nextAction.ctaLabel === "Find jobs" || summary.dueSourceCount > 0);

  if (dueSources > 0 && !nextActionPointsToFindSources) {
    shortcuts.push({
      label: `Run due sources (${dueSources})`,
      href: "/career?tab=find",
      kind: "secondary"
    });
  }

  return shortcuts;
}
