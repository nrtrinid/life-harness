import { ACTIVE_CARD_LIMIT, getActiveLimitStatus, getMainQuest } from "./guards";
import { getFollowUpsDue } from "./career";
import type { StoredCareerSourcePack } from "./careerSourcePack";
import { buildCareerPackBriefingStats } from "./careerPackMatching";
import { buildCandidateBriefingSignals, formatFitScore } from "./jobScout";
import { buildSourceHealthBriefingLines } from "./jobSourceHealth";
import { buildSourceScheduleStats } from "./jobSourceSchedule";
import { WARMTH_LABELS } from "./labels";
import {
  computeCardWarmth,
  getEffectiveLastTouched,
  isCooledWhileWaiting,
  isNeglectCandidate,
  isTerminalState,
  shouldFlagAsNeglected,
  shouldSuggestReheat,
  WARMTH_RANK
} from "./warmth";
import type {
  Briefing,
  BriefingHighlight,
  DailyState,
  JobCandidate,
  JobSource,
  JobSourceRunResult,
  LifeCard,
  LifeLogEntry,
  ProofItem,
  ResumeModule,
  Warmth
} from "./types";

function getBriefingSince(dailyState: DailyState): string | undefined {
  return dailyState.briefingSinceAt ?? dailyState.lastOpenedAt;
}

function isSince(iso: string | undefined, since: string | undefined): boolean {
  if (!iso || !since) {
    return false;
  }
  return iso > since;
}

export function selectPounceCandidate(
  cards: LifeCard[],
  logs: LifeLogEntry[],
  dailyState: DailyState,
  now: Date
): LifeCard | undefined {
  const withWarmth = cards
    .filter((card) => card.state === "active" && shouldFlagAsNeglected(card, computeCardWarmth(card, logs, now)))
    .map((card) => ({ card, warmth: computeCardWarmth(card, logs, now) }))
    .sort((a, b) => WARMTH_RANK[a.warmth] - WARMTH_RANK[b.warmth]);

  if (withWarmth.length > 0) {
    return withWarmth[0].card;
  }

  const parkedCold = cards
    .filter((card) => card.state === "parked" && shouldSuggestReheat(card, computeCardWarmth(card, logs, now)))
    .map((card) => ({ card, warmth: computeCardWarmth(card, logs, now) }))
    .sort((a, b) => WARMTH_RANK[a.warmth] - WARMTH_RANK[b.warmth]);

  if (parkedCold.length > 0) {
    return parkedCold[0].card;
  }

  return getMainQuest(cards, dailyState);
}

export function selectReheatAction(card: LifeCard): string {
  return `Suggested pounce: reheat ${card.title} with ${card.nextTinyAction}`;
}

export function generateWhileYouWereAway(
  cards: LifeCard[],
  logs: LifeLogEntry[],
  proofItems: ProofItem[],
  dailyState: DailyState,
  now: Date,
  jobCandidates: JobCandidate[] = [],
  jobSources: JobSource[] = [],
  jobSourceRuns: JobSourceRunResult[] = [],
  careerSourcePack: StoredCareerSourcePack | null = null,
  resumeModules: ResumeModule[] = []
): Briefing {
  const since = getBriefingSince(dailyState);
  const activeLimit = getActiveLimitStatus(cards);

  const updated: string[] = [];

  for (const card of cards) {
    const touched = getEffectiveLastTouched(card, logs);
    if (isSince(touched, since)) {
      const warmth = computeCardWarmth(card, logs, now);
      updated.push(`${card.title} was touched. Now ${WARMTH_LABELS[warmth].toLowerCase()}.`);
    }
  }

  const recentProof = proofItems
    .filter((proof) => isSince(proof.timestamp, since))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 2)
    .map((proof) => `Proof added: ${proof.title}`);

  updated.push(...recentProof);

  const detected: string[] = [];

  for (const card of cards) {
    if (isTerminalState(card.state)) {
      continue;
    }
    const warmth = computeCardWarmth(card, logs, now);
    if (shouldFlagAsNeglected(card, warmth)) {
      detected.push(`${card.title} is ${WARMTH_LABELS[warmth].toLowerCase()}.`);
    } else if (isCooledWhileWaiting(card, warmth)) {
      detected.push(`Waiting: ${card.title} has cooled while waiting.`);
    }
  }

  for (const card of cards) {
    if (!isNeglectCandidate(card) || isTerminalState(card.state)) {
      continue;
    }
    if (!card.nextTinyAction?.trim()) {
      detected.push(`${card.title} is missing a next tiny action.`);
    }
  }

  const parkedDormant = cards.filter((card) => {
    if (card.state !== "parked") {
      return false;
    }
    const warmth = computeCardWarmth(card, logs, now);
    return warmth === "cold" || warmth === "dormant";
  });

  for (const card of parkedDormant.slice(0, 2)) {
    const warmth = computeCardWarmth(card, logs, now);
    if (!detected.some((line) => line.includes(card.title))) {
      detected.push(`${card.title} is ${WARMTH_LABELS[warmth].toLowerCase()} (parked).`);
    }
  }

  if (activeLimit.isOverLimit) {
    detected.push(`You have ${activeLimit.count} active cards; limit is ${ACTIVE_CARD_LIMIT}.`);
    detected.push(`Active cards are ${activeLimit.count}/${ACTIVE_CARD_LIMIT}. Park one soon.`);
  } else {
    detected.push(`Active cards are ${activeLimit.count}/${ACTIVE_CARD_LIMIT}.`);
  }

  const followUpsDue = getFollowUpsDue(cards, now);
  for (const card of followUpsDue.slice(0, 2)) {
    detected.push(`Follow-up due: ${card.title}.`);
  }

  const scoutSignals = buildCandidateBriefingSignals(jobCandidates, jobSources, jobSourceRuns);
  const scheduleStats = buildSourceScheduleStats(jobSources, jobSourceRuns, now);
  if (scheduleStats.dueSources > 0) {
    detected.push(
      `${scheduleStats.dueSources} job source${scheduleStats.dueSources === 1 ? "" : "s"} ${scheduleStats.dueSources === 1 ? "is" : "are"} due.`
    );
  }
  detected.push(...buildSourceHealthBriefingLines(jobSources, jobSourceRuns, jobCandidates, now));
  if (scoutSignals.savedWaiting > 0) {
    detected.push(`${scoutSignals.savedWaiting} saved job candidates waiting for review.`);
  }
  if (scoutSignals.fetchedWaiting > 0) {
    detected.push(`${scoutSignals.fetchedWaiting} fetched candidates are waiting for review.`);
  }
  for (const candidate of scoutSignals.strongFitFetchedCandidates.slice(0, 1)) {
    detected.push(
      `High-fit fetched candidate: ${candidate.company} — ${candidate.roleTitle} (${formatFitScore(candidate.fitScore)}).`
    );
  }
  for (const candidate of scoutSignals.strongFitCandidates
    .filter((item) => item.origin !== "source_fetch")
    .slice(0, 1)) {
    detected.push(
      `High-fit candidate: ${candidate.company} — ${candidate.roleTitle} (${formatFitScore(candidate.fitScore)}).`
    );
  }
  if (scoutSignals.lastSuccessfulSourceRun) {
    detected.push(
      `Source ${scoutSignals.lastSuccessfulSourceRun.sourceName} last run found ${scoutSignals.lastSuccessfulSourceRun.fetchedCount} candidates.`
    );
  }
  if (scoutSignals.enabledSources > 0) {
    detected.push(`Approved job sources ready (${scoutSignals.enabledSources} enabled).`);
  }

  const packStats = buildCareerPackBriefingStats(
    jobCandidates,
    careerSourcePack?.pack ?? null,
    resumeModules,
    jobSources
  );
  const fetchedWaiting =
    jobCandidates.filter(
      (candidate) =>
        candidate.origin === "source_fetch" &&
        (candidate.status === "new" || candidate.status === "saved")
    ).length > 0;
  if (fetchedWaiting && !packStats.imported) {
    detected.push("Import Career Source Pack to rank fetched candidates.");
  }
  if (packStats.imported && packStats.strongCount > 0) {
    detected.push(
      `${packStats.strongCount} queued candidate${packStats.strongCount === 1 ? "" : "s"} match strongly with your Career Pack.`
    );
  } else if (packStats.imported && fetchedWaiting) {
    detected.push("Career Pack imported — use Queue filters to sort by best fit.");
  }

  const prepared: string[] = [];
  const savedCandidates = jobCandidates.filter((candidate) => candidate.status === "saved");
  const fetchedCandidates = jobCandidates.filter(
    (candidate) =>
      candidate.origin === "source_fetch" &&
      (candidate.status === "new" || candidate.status === "saved")
  );
  const careerNetworking = cards.find((card) => card.id === "career-networking");
  const careerCold =
    careerNetworking &&
    shouldFlagAsNeglected(careerNetworking, computeCardWarmth(careerNetworking, logs, now));

  if (careerCold || followUpsDue.length > 0) {
    prepared.push("Suggested pounce: paste one job description or send one follow-up.");
  } else if (scheduleStats.dueSources > 0) {
    prepared.push("Suggested pounce: run due job sources.");
  } else if (fetchedCandidates.length > 0) {
    prepared.push("Suggested pounce: review one fetched candidate.");
  } else if (savedCandidates.length > 0) {
    prepared.push("Suggested pounce: approve one saved candidate to application card.");
  } else if (scoutSignals.enabledSources > 0) {
    prepared.push("Suggested pounce: run one approved job source.");
  } else {
    const pounceCandidate = selectPounceCandidate(cards, logs, dailyState, now);

    if (pounceCandidate) {
      prepared.push(selectReheatAction(pounceCandidate));
    } else {
      prepared.push(
        `Suggested pounce: ${dailyState.pounceMission ?? getMainQuest(cards, dailyState)?.nextTinyAction ?? "pick one tiny action"}.`
      );
    }
  }

  const hasColdActive = cards.some((card) => {
    const warmth = computeCardWarmth(card, logs, now);
    return shouldFlagAsNeglected(card, warmth);
  });

  if (hasColdActive) {
    prepared.push("Suggested salvage: one 10-minute re-entry action.");
  }

  if (!prepared.some((line) => line.includes("Candidate Intake"))) {
    prepared.push("Suggested pounce: paste one job into Candidate Intake.");
  }

  return {
    id: "briefing-today",
    createdAt: now.toISOString(),
    title: "While You Were Away",
    updated,
    detected,
    prepared
  };
}

function findCardIdForBriefingLine(text: string, cards: LifeCard[]): string | undefined {
  const waitingMatch = text.match(/^Waiting: (.+?) has cooled while waiting\.$/);
  if (waitingMatch) {
    return cards.find((card) => card.title === waitingMatch[1])?.id;
  }

  for (const card of cards) {
    if (text.startsWith(`${card.title} `) || text.startsWith(`${card.title} is`)) {
      return card.id;
    }
  }

  return undefined;
}

export function getBriefingHighlights(briefing: Briefing, maxItems = 5): string[] {
  return getBriefingHighlightItems(briefing, [], undefined, [], new Date(), maxItems).map(
    (item) => item.text
  );
}

export function getBriefingHighlightItems(
  briefing: Briefing,
  cards: LifeCard[],
  dailyState: DailyState | undefined,
  logs: LifeLogEntry[],
  now: Date,
  maxItems = 5
): BriefingHighlight[] {
  const picks: BriefingHighlight[] = [];
  const pounceCandidate =
    dailyState !== undefined
      ? selectPounceCandidate(cards, logs, dailyState, now)
      : undefined;

  for (const item of briefing.updated.slice(0, 2)) {
    if (picks.length < maxItems) {
      picks.push({ text: item, cardId: findCardIdForBriefingLine(item, cards) });
    }
  }

  const limitWarning = briefing.detected.find((line) => line.includes("Park one soon"));
  if (limitWarning && picks.length < maxItems) {
    picks.push({ text: limitWarning });
  }

  for (const item of briefing.detected) {
    if (picks.length >= maxItems) {
      break;
    }
    if (item === limitWarning) {
      continue;
    }
    if (item.includes("is cold") || item.includes("is dormant") || item.includes("cooled while waiting")) {
      picks.push({ text: item, cardId: findCardIdForBriefingLine(item, cards) });
      break;
    }
  }

  for (const item of briefing.prepared) {
    if (picks.length >= maxItems) {
      break;
    }
    if (item.startsWith("Suggested pounce:")) {
      picks.push({
        text: item,
        cardId: pounceCandidate?.id
      });
      break;
    }
  }

  for (const item of briefing.prepared) {
    if (picks.length >= maxItems) {
      break;
    }
    if (item.includes("salvage")) {
      picks.push({ text: item });
      break;
    }
  }

  return picks.slice(0, maxItems);
}

export function startSession(dailyState: DailyState, nowIso: string): DailyState {
  const previousOpen = dailyState.lastOpenedAt ?? dailyState.briefingSinceAt;
  return {
    ...dailyState,
    briefingSinceAt: previousOpen ?? nowIso,
    lastOpenedAt: nowIso,
    sessionStartedAt: nowIso
  };
}
