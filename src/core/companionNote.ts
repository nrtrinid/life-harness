import { getFollowUpsDue } from "./career";
import { ACTIVE_CARD_LIMIT, getActiveLimitStatus } from "./guards";
import type { Briefing, DailyState, LifeCard, LifeLogEntry } from "./types";

function hedgeLine(line: string): string {
  const trimmed = line.trim().replace(/\.$/, "");
  if (trimmed.length === 0) {
    return trimmed;
  }
  if (/^(you have|active|follow-up|park)/i.test(trimmed)) {
    return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  }
  return `From the board, it looks like ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

export function buildCompanionNote(
  briefing: Briefing,
  cards: LifeCard[],
  _dailyState: DailyState,
  _logs: LifeLogEntry[],
  now: Date
): string {
  const sentences: string[] = [];
  const followUps = getFollowUpsDue(cards, now);
  const activeLimit = getActiveLimitStatus(cards);

  if (briefing.updated.length > 0) {
    sentences.push(hedgeLine(briefing.updated[0]));
  }

  if (followUps.length > 0) {
    const card = followUps[0];
    const dueDate = card.careerApplication?.followUpDate;
    if (dueDate) {
      sentences.push(`A follow-up on ${card.title} is due today (${dueDate}).`);
    } else {
      sentences.push(`A follow-up on ${card.title} looks due today.`);
    }
  }

  const coldLine = briefing.detected.find(
    (line) => line.includes("is cold") || line.includes("is dormant") || line.includes("cooled while waiting")
  );
  if (coldLine && !sentences.some((s) => s.includes(coldLine.slice(0, 20)))) {
    sentences.push(`${hedgeLine(coldLine)}.`);
  }

  if (activeLimit.isOverLimit) {
    sentences.push(
      `The board has ${activeLimit.count} active cards — the limit is ${ACTIVE_CARD_LIMIT}, so parking one might help.`
    );
  } else if (activeLimit.isAtLimit) {
    sentences.push(`Active slots look full (${activeLimit.count}/${ACTIVE_CARD_LIMIT}).`);
  }

  const limitWarning = briefing.detected.find((line) => line.includes("Park one soon"));
  if (limitWarning && !activeLimit.isOverLimit && !activeLimit.isAtLimit) {
    sentences.push(hedgeLine(limitWarning) + ".");
  }

  if (sentences.length === 0) {
    return "Nothing urgent on the board right now. One small move could be enough.";
  }

  return sentences.slice(0, 4).join(" ");
}
