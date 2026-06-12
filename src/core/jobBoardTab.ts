import type { CareerHubSummary } from "./careerHub";

export type JobBoardTab = "find" | "review" | "apply" | "followup";

const VALID_TABS: JobBoardTab[] = ["find", "review", "apply", "followup"];

export const JOB_BOARD_TAB_LABELS: Record<JobBoardTab, string> = {
  find: "Find",
  review: "Review",
  apply: "Apply",
  followup: "Follow up"
};

export function parseJobBoardTab(param: string | string[] | undefined): JobBoardTab | null {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!raw) {
    return null;
  }
  return VALID_TABS.includes(raw as JobBoardTab) ? (raw as JobBoardTab) : null;
}

export function suggestJobBoardTab(summary: CareerHubSummary): JobBoardTab {
  if (summary.followUpCount > 0) {
    return "followup";
  }
  if (summary.queueCount > 0) {
    return "review";
  }
  if (summary.activeApplicationCount + summary.waitingApplicationCount > 0) {
    return "apply";
  }
  return "find";
}

export function resolveJobBoardTab(
  param: string | string[] | undefined,
  summary: CareerHubSummary
): JobBoardTab {
  return parseJobBoardTab(param) ?? suggestJobBoardTab(summary);
}

export function jobBoardTabHref(tab: JobBoardTab): string {
  return `/career?tab=${tab}`;
}
