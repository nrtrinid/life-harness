import type { Briefing, DailyState, RecoveryVisibility } from "./types";

/**
 * Determines when to show recovery options (MVD/Salvage) prominently on Today screen.
 * Recovery panel renders early (above fold) when recovery is relevant based on:
 * - Briefing suggests salvage (cold/dormant cards detected)
 * - MVD incomplete after 6 PM
 */
export function computeRecoveryVisibility(
  briefing: Briefing,
  dailyState: DailyState,
  now: Date
): RecoveryVisibility {
  // Check if briefing suggests salvage
  const hasSalvageSuggestion = briefing.prepared.some((line) =>
    line.toLowerCase().includes("salvage")
  );

  // Find reason for salvage suggestion from detected issues
  const salvageReason = hasSalvageSuggestion
    ? briefing.detected.find(
        (line) => line.includes("cold") || line.includes("dormant") || line.includes("cooling")
      )
    : undefined;

  // MVD visibility: incomplete after 6 PM
  const mvdIncomplete = !dailyState.minimumViableDayCompleted;
  const isEvening = now.getHours() >= 18;
  const showMvd = mvdIncomplete && isEvening;

  // TODO: Compute actual MVD progress from dailyState
  // For now, return placeholder values
  const mvdProgress = {
    completed: 0,
    total: 4 as const,
    items: ["capture", "pounce", "move_one", "log_win"]
  };

  return {
    showSalvage: hasSalvageSuggestion,
    showMvd,
    shouldPromote: hasSalvageSuggestion || showMvd,
    salvageReason,
    mvdProgress
  };
}
