import { findCapturableCard } from "./cardMatching";
import { shouldIncludeCard } from "./contextPacketRedaction";
import { createCareerApplicationCard, syncApplicationStatus, type CareerIntakeInput } from "./career";
import type { LifeHarnessData } from "./lifeHarnessData";
import { createId, nowIso } from "./ids";
import { canActivateCard, getActiveLimitStatus, ACTIVE_CARD_LIMIT } from "./guards";
import { AREA_LABELS } from "./labels";
import {
  buildCareerIntakeFromCandidate,
  createJobCandidate,
  dismissJobCandidate,
  saveJobCandidate,
  scoreJobCandidate,
  type JobCandidateIntakeInput
} from "./jobScout";
import { CAPTURE_GRAMMAR_HINT, parseUniversalCapture } from "./parsing";
import { createProofItem, PROOF_TITLES } from "./proof";
import { computeXP } from "./scoring";
import type {
  CardState,
  JobCandidate,
  JobSource,
  JobSourceKind,
  JobSourceRunResult,
  LifeArea,
  LifeCard,
  LifeLogEntry,
  ProofItem
} from "./types";
import {
  parseCareerSourcePackJson,
  upsertPackResumeModules
} from "./careerSourcePack";
import { matchCandidateWithCareerPack } from "./careerPackMatching";
import { buildResumeDraftPacket } from "./resumeModuleBank";
import type { JobSourceRunOutput } from "./jobSourceRunner";
import { rebindJobSourceRunOutput } from "./jobSourceRunner";
import {
  applyCompleteAgentSession,
  buildAgentSessionProofSummary,
  sessionAlreadyHasEvidence,
  type HarnessAgentSessionCompleteInput
} from "./agentSessionLog";

export type { LifeHarnessData } from "./lifeHarnessData";

export interface JobSourceInput {
  name: string;
  url: string;
  kind: JobSourceKind;
  enabled?: boolean;
  cadence?: JobSource["cadence"];
  maxResults?: number;
  notes?: string;
  adapterNotes?: string;
  requestConfig?: JobSource["requestConfig"];
}

export type JobSourcePatch = Partial<
  Pick<
    JobSource,
    | "name"
    | "url"
    | "kind"
    | "enabled"
    | "cadence"
    | "maxResults"
    | "notes"
    | "adapterNotes"
    | "requestConfig"
    | "runStatus"
    | "lastRunAt"
    | "lastRunMessage"
    | "lastFetchedCount"
    | "lastCheckedAt"
  >
>;

export interface ActionResult {
  state: LifeHarnessData;
  message?: string;
  ok: boolean;
  cardId?: string;
  candidateId?: string;
}

function prependLog(logs: LifeLogEntry[], log: LifeLogEntry): LifeLogEntry[] {
  return [log, ...logs];
}

function prependProof(proofItems: ProofItem[], proof: ProofItem): ProofItem[] {
  return [proof, ...proofItems];
}

function updateCard(cards: LifeCard[], cardId: string, updater: (card: LifeCard) => LifeCard): LifeCard[] {
  return cards.map((card) => (card.id === cardId ? updater(card) : card));
}

function createLogEntry(input: {
  rawText: string;
  area: LifeArea;
  type: LifeLogEntry["type"];
  cardId?: string;
  proofItemId?: string;
}): LifeLogEntry {
  return {
    id: createId("log"),
    timestamp: nowIso(),
    rawText: input.rawText,
    area: input.area,
    cardId: input.cardId,
    type: input.type,
    xp: computeXP(input.type),
    proofItemId: input.proofItemId
  };
}

function touchCard(card: LifeCard, rawText?: string): LifeCard {
  return {
    ...card,
    lastTouched: nowIso(),
    recentWins: rawText ? [rawText, ...card.recentWins].slice(0, 5) : card.recentWins
  };
}

export function withProofSuffix(message: string, proofCreated: boolean): string {
  return proofCreated ? `${message} · Proof updated` : message;
}

function trimmedCapture(rawText: string): string {
  return rawText.trim();
}

function applyParkCard(state: LifeHarnessData, cardId: string, rawText: string): ActionResult {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card) {
    return { state, ok: false, message: "Card not found." };
  }

  const log = createLogEntry({
    rawText,
    area: card.area,
    type: "clarity",
    cardId: card.id
  });
  const proof = createProofItem({
    title: PROOF_TITLES.parked,
    area: card.area,
    cardId: card.id,
    sourceLogId: log.id
  });
  log.proofItemId = proof.id;

  const cards = updateCard(state.cards, cardId, (item) =>
    syncApplicationStatus(
      {
        ...touchCard(item),
        proofItemIds: [proof.id, ...item.proofItemIds]
      },
      "parked"
    )
  );

  return {
    state: {
      ...state,
      cards,
      logs: prependLog(state.logs, log),
      proofItems: prependProof(state.proofItems, proof)
    },
    ok: true,
    message: withProofSuffix(`Parked ${card.title}.`, true)
  };
}

function cardStateMessage(card: LifeCard, newState: CardState): string {
  switch (newState) {
    case "active":
      return `Activated ${card.title}.`;
    case "waiting":
      return `${card.title} moved to Waiting.`;
    case "done":
      return `Marked ${card.title} done.`;
    case "killed":
      return `Killed ${card.title}.`;
    case "parked":
      return withProofSuffix(`Parked ${card.title}.`, true);
    default:
      return `${card.title} updated.`;
  }
}

export function applyPounce(state: LifeHarnessData): ActionResult {
  if (state.dailyState.pounceStarted) {
    return { state, ok: false, message: "Pounce already logged this session." };
  }

  const careerCard =
    state.cards.find((card) => card.id === "career-networking") ??
    (state.dailyState.mainQuestId
      ? state.cards.find((card) => card.id === state.dailyState.mainQuestId)
      : undefined);
  const area: LifeArea = "social_career";

  const log = createLogEntry({
    rawText: "Started career pounce",
    area,
    type: "pounce",
    cardId: careerCard?.id
  });

  const proof = createProofItem({
    title: PROOF_TITLES.pounce,
    area,
    cardId: careerCard?.id,
    sourceLogId: log.id
  });

  log.proofItemId = proof.id;

  let cards = state.cards;
  if (careerCard) {
    cards = updateCard(cards, careerCard.id, (card) => ({
      ...touchCard(card),
      proofItemIds: [proof.id, ...card.proofItemIds]
    }));
  }

  return {
    state: {
      ...state,
      cards,
      logs: prependLog(state.logs, log),
      proofItems: prependProof(state.proofItems, proof),
      dailyState: {
        ...state.dailyState,
        pounceStarted: true,
        mode: "pounce"
      }
    },
    ok: true,
    message: withProofSuffix("+10 XP · Career pounce logged", true)
  };
}

export function applyMvd(state: LifeHarnessData): ActionResult {
  if (state.dailyState.minimumViableDayCompleted) {
    return { state, ok: false, message: "Minimum viable day already logged this session." };
  }

  const log = createLogEntry({
    rawText: "Completed minimum viable day",
    area: "body",
    type: "mvd"
  });

  const proof = createProofItem({
    title: PROOF_TITLES.mvd,
    area: "body",
    sourceLogId: log.id
  });

  log.proofItemId = proof.id;

  return {
    state: {
      ...state,
      logs: prependLog(state.logs, log),
      proofItems: prependProof(state.proofItems, proof),
      dailyState: {
        ...state.dailyState,
        minimumViableDayCompleted: true
      }
    },
    ok: true,
    message: withProofSuffix("+30 XP · Day preserved", true)
  };
}

export function applySalvage(state: LifeHarnessData, optionLabel: string): ActionResult {
  if (state.dailyState.salvageCompleted) {
    return { state, ok: false, message: "Salvage already logged this session." };
  }

  const log = createLogEntry({
    rawText: `Used salvage mode: ${optionLabel}`,
    area: "body",
    type: "salvage"
  });

  const proof = createProofItem({
    title: PROOF_TITLES.salvage,
    area: "body",
    sourceLogId: log.id
  });

  log.proofItemId = proof.id;

  return {
    state: {
      ...state,
      logs: prependLog(state.logs, log),
      proofItems: prependProof(state.proofItems, proof),
      dailyState: {
        ...state.dailyState,
        salvageCompleted: true
      }
    },
    ok: true,
    message: withProofSuffix("+30 XP · Salvage logged", true)
  };
}

function createInboxCard(title: string): LifeCard {
  return {
    id: createId("card"),
    title,
    area: "build",
    state: "inbox",
    progress: 0,
    warmth: "cold",
    nextTinyAction: "Capture first small project idea.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: []
  };
}

export function applyQuickCapture(state: LifeHarnessData, rawText: string): ActionResult {
  const intent = parseUniversalCapture(rawText);
  if (!intent) {
    return {
      state,
      ok: false,
      message: CAPTURE_GRAMMAR_HINT
    };
  }

  let cards = state.cards;
  let logs = state.logs;
  let proofItems = state.proofItems;
  const captured = trimmedCapture(rawText);

  if (intent.type === "idea") {
    const card = createInboxCard(intent.text);
    const log = createLogEntry({
      rawText: captured,
      area: "build",
      type: "idea",
      cardId: card.id
    });
    const proof = createProofItem({
      title: PROOF_TITLES.idea,
      area: "build",
      cardId: card.id,
      sourceLogId: log.id
    });
    log.proofItemId = proof.id;
    card.proofItemIds = [proof.id];

    return {
      state: {
        ...state,
        cards: [card, ...cards],
        logs: prependLog(logs, log),
        proofItems: prependProof(proofItems, proof)
      },
      ok: true,
      message: withProofSuffix("Idea captured to Inbox", true)
    };
  }

  if (intent.type === "park") {
    const matched = findCapturableCard(cards, intent.text);
    if (!matched) {
      return {
        state,
        ok: false,
        message: 'Could not find a safe card to park. Try "park: exact card title".'
      };
    }

    return applyParkCard(state, matched.id, captured);
  }

  const matched = findCapturableCard(cards, intent.text);

  if (intent.type === "resume_exported" && matched) {
    return applyResumeExportedForCard(state, matched.id, { rawText: captured });
  }

  let area: LifeArea = matched?.area ?? "build";
  let message = "";

  if (intent.type === "worked_on") {
    area = matched?.area ?? "build";
  } else if (
    intent.type === "followed_up" ||
    intent.type === "resume_exported"
  ) {
    area = "social_career";
  } else if (intent.type === "agent_finished") {
    area = matched?.area ?? "build";
  }

  const log = createLogEntry({
    rawText: captured,
    area,
    type: "win",
    cardId: matched?.id
  });

  let proof: ProofItem | undefined;
  if (intent.type === "worked_on" && matched) {
    proof = createProofItem({
      title: `Worked on ${matched.title}.`,
      area,
      cardId: matched.id,
      sourceLogId: log.id
    });
    log.proofItemId = proof.id;
  } else if (intent.type === "followed_up" && matched) {
    proof = createProofItem({
      title: PROOF_TITLES.followUp,
      area: "social_career",
      cardId: matched.id,
      sourceLogId: log.id
    });
    log.proofItemId = proof.id;
  } else if (intent.type === "agent_finished" && matched) {
    proof = createProofItem({
      title: `Agent finished: ${matched.title}`,
      area,
      cardId: matched.id,
      sourceLogId: log.id
    });
    log.proofItemId = proof.id;
  }

  if (matched) {
    cards = updateCard(cards, matched.id, (card) => ({
      ...touchCard(card, captured),
      proofItemIds: proof ? [proof.id, ...card.proofItemIds] : card.proofItemIds
    }));
  }

  logs = prependLog(logs, log);
  if (proof) {
    proofItems = prependProof(proofItems, proof);
  }

  if (intent.type === "worked_on") {
    message = matched
      ? withProofSuffix(`+${log.xp} XP · Work logged to ${matched.title}`, Boolean(proof))
      : `+${log.xp} XP · Work logged`;
  } else if (intent.type === "followed_up") {
    message = matched
      ? withProofSuffix(`Follow-up logged for ${matched.title}`, Boolean(proof))
      : `+${log.xp} XP · Follow-up logged`;
  } else if (intent.type === "agent_finished") {
    message = matched
      ? withProofSuffix(`Agent result captured for ${matched.title}`, Boolean(proof))
      : `+${log.xp} XP · Agent result captured`;
  } else if (intent.type === "resume_exported") {
    message = matched
      ? withProofSuffix(`Resume export logged for ${matched.title}`, Boolean(proof))
      : `+${log.xp} XP · Resume export logged`;
  }

  return {
    state: { ...state, cards, logs, proofItems },
    ok: true,
    message
  };
}

export function applyCardStateChange(
  state: LifeHarnessData,
  cardId: string,
  newState: CardState
): ActionResult {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card) {
    return { state, ok: false, message: "Card not found." };
  }

  if (newState === "active") {
    const guard = canActivateCard(state.cards, cardId);
    if (!guard.ok) {
      return { state, ok: false, message: guard.message };
    }
  }

  if (card.state === newState) {
    return { state, ok: true };
  }

  if (newState === "parked") {
    return applyParkCard(state, cardId, `Parked ${card.title}`);
  }

  const cards = updateCard(state.cards, cardId, (item) =>
    syncApplicationStatus(touchCard(item), newState)
  );

  return {
    state: { ...state, cards },
    ok: true,
    message: cardStateMessage(card, newState)
  };
}

export function applyResumeExportedForCard(
  state: LifeHarnessData,
  cardId: string,
  options?: { filename?: string; rawText?: string }
): ActionResult {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card) {
    return { state, ok: false, message: "Card not found." };
  }
  if (!shouldIncludeCard(card)) {
    return {
      state,
      ok: false,
      message: "This card is S3-sensitive and cannot be changed from here."
    };
  }

  const explicitRaw = options?.rawText?.trim();
  const filenameSuffix = options?.filename?.trim() ? ` (${options.filename.trim()})` : "";
  const logText =
    explicitRaw ?? `Resume exported for ${card.title}${filenameSuffix}`;

  const log = createLogEntry({
    rawText: logText,
    area: "social_career",
    type: "win",
    cardId: card.id
  });
  const proof = createProofItem({
    title: PROOF_TITLES.resumeExported,
    area: "social_career",
    cardId: card.id,
    sourceLogId: log.id
  });
  log.proofItemId = proof.id;

  return {
    state: {
      ...state,
      cards: updateCard(state.cards, card.id, (item) => ({
        ...touchCard(item, logText),
        proofItemIds: [proof.id, ...item.proofItemIds]
      })),
      logs: prependLog(state.logs, log),
      proofItems: prependProof(state.proofItems, proof)
    },
    ok: true,
    message: withProofSuffix(`Resume export logged for ${card.title}.`, true)
  };
}

export function applyCareerIntake(state: LifeHarnessData, input: CareerIntakeInput): ActionResult {
  const status = input.applicationStatus ?? "inbox";

  if (status === "active") {
    const { count } = getActiveLimitStatus(state.cards);
    if (count >= ACTIVE_CARD_LIMIT) {
      return {
        state,
        ok: false,
        message: `Active is full (${ACTIVE_CARD_LIMIT}/${ACTIVE_CARD_LIMIT}). Park, wait, finish, or kill one first.`
      };
    }
  }

  const card = createCareerApplicationCard({ ...input, applicationStatus: status });
  const log = createLogEntry({
    rawText: `Created application card: ${card.title}`,
    area: "social_career",
    type: "clarity",
    cardId: card.id
  });
  const proof = createProofItem({
    title: PROOF_TITLES.applicationCard,
    area: "social_career",
    cardId: card.id,
    sourceLogId: log.id
  });
  log.proofItemId = proof.id;
  card.proofItemIds = [proof.id];

  return {
    state: {
      ...state,
      cards: [card, ...state.cards],
      logs: prependLog(state.logs, log),
      proofItems: prependProof(state.proofItems, proof)
    },
    ok: true,
    message: withProofSuffix(`Created ${card.title} in ${status}.`, true),
    cardId: card.id
  };
}

function updateJobCandidate(
  candidates: JobCandidate[],
  candidateId: string,
  updater: (candidate: JobCandidate) => JobCandidate
): JobCandidate[] {
  return candidates.map((candidate) =>
    candidate.id === candidateId ? updater(candidate) : candidate
  );
}

export function applyJobCandidateIntake(
  state: LifeHarnessData,
  input: JobCandidateIntakeInput
): ActionResult {
  const candidate = createJobCandidate(
    { ...input, origin: input.origin ?? "manual" },
    state.resumeModules,
    "new"
  );
  const log = createLogEntry({
    rawText: `Added job candidate: ${candidate.company} — ${candidate.roleTitle}`,
    area: "social_career",
    type: "clarity"
  });

  return {
    state: {
      ...state,
      jobCandidates: [candidate, ...state.jobCandidates],
      logs: prependLog(state.logs, log)
    },
    ok: true,
    message: `Created candidate with ${candidate.fitScore} fit score.`,
    candidateId: candidate.id
  };
}

export function applySaveJobCandidate(state: LifeHarnessData, candidateId: string): ActionResult {
  const candidate = state.jobCandidates.find((item) => item.id === candidateId);
  if (!candidate) {
    return { state, ok: false, message: "Candidate not found." };
  }

  return {
    state: {
      ...state,
      jobCandidates: updateJobCandidate(state.jobCandidates, candidateId, saveJobCandidate)
    },
    ok: true,
    message: `Saved ${candidate.company} — ${candidate.roleTitle}.`
  };
}

export function applyDismissJobCandidate(state: LifeHarnessData, candidateId: string): ActionResult {
  const candidate = state.jobCandidates.find((item) => item.id === candidateId);
  if (!candidate) {
    return { state, ok: false, message: "Candidate not found." };
  }

  return {
    state: {
      ...state,
      jobCandidates: updateJobCandidate(state.jobCandidates, candidateId, dismissJobCandidate)
    },
    ok: true,
    message: `Dismissed ${candidate.company} — ${candidate.roleTitle}.`
  };
}

export function applyApproveJobCandidate(state: LifeHarnessData, candidateId: string): ActionResult {
  const candidate = state.jobCandidates.find((item) => item.id === candidateId);
  if (!candidate) {
    return { state, ok: false, message: "Candidate not found." };
  }

  if (candidate.applicationCardId) {
    return {
      state,
      ok: true,
      message: "Already approved — linked to existing card.",
      cardId: candidate.applicationCardId,
      candidateId: candidate.id
    };
  }

  let intake = buildCareerIntakeFromCandidate(candidate, state.resumeModules);
  if (state.careerSourcePack) {
    const sourceName = state.jobSources.find((s) => s.id === candidate.sourceId)?.name;
    const packMatch = matchCandidateWithCareerPack(
      candidate,
      state.careerSourcePack.pack,
      state.resumeModules,
      sourceName
    );
    if (packMatch.suggestedSummaryAngle) {
      intake = { ...intake, resumeAngle: packMatch.suggestedSummaryAngle };
    }
    if (packMatch.suggestedModuleOrder.length > 0) {
      intake = {
        ...intake,
        projectsToEmphasize: packMatch.suggestedModuleOrder.join("; ")
      };
    }
  }
  intake = {
    ...intake,
    resumeDraftPacket: {
      ...buildResumeDraftPacket(candidate, state.resumeModules, nowIso()),
      resumeAngle: intake.resumeAngle ?? candidate.recommendedResumeAngle ?? ""
    }
  };
  const card = createCareerApplicationCard(intake);
  const weakMatch =
    candidate.roleType === "other" ||
    candidate.fitLabel === "bad_fit" ||
    candidate.fitLabel === "stretch";
  card.nextTinyAction = weakMatch
    ? "Open the posting — decide whether to tailor manually or pass."
    : "Tailor resume angle and submit application.";
  card.whyItMatters = weakMatch
    ? "Saved from Job Scout — confirm this role fits your goals before investing time."
    : "Fit found through Job Scout; applying keeps career momentum warm.";
  if (candidate.location?.trim()) {
    card.openLoops = [...(card.openLoops ?? []), `Location: ${candidate.location.trim()}`];
  }
  const log = createLogEntry({
    rawText: `Approved job candidate: ${candidate.company} — ${candidate.roleTitle}`,
    area: "social_career",
    type: "win",
    cardId: card.id
  });
  const proof = createProofItem({
    title: PROOF_TITLES.approvedCandidate,
    area: "social_career",
    cardId: card.id,
    sourceLogId: log.id
  });
  log.proofItemId = proof.id;
  card.proofItemIds = [proof.id];

  const updatedCandidate: JobCandidate = {
    ...candidate,
    status: "card_created",
    applicationCardId: card.id
  };

  return {
    state: {
      ...state,
      cards: [card, ...state.cards],
      logs: prependLog(state.logs, log),
      proofItems: prependProof(state.proofItems, proof),
      jobCandidates: updateJobCandidate(
        state.jobCandidates,
        candidateId,
        () => updatedCandidate
      )
    },
    ok: true,
    message: withProofSuffix(`Approved ${card.title} to Inbox.`, true),
    cardId: card.id,
    candidateId: candidate.id
  };
}

export function applyBackfillResumeDraftPacket(
  state: LifeHarnessData,
  cardId: string
): ActionResult {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card?.careerApplication) {
    return { state, ok: false, message: "Not an application card." };
  }

  if (card.careerApplication.resumeDraftPacket) {
    return { state, ok: true, message: "Resume draft packet already exists." };
  }

  const application = card.careerApplication;
  const linkedCandidate = application.jobCandidateId
    ? state.jobCandidates.find((item) => item.id === application.jobCandidateId)
    : undefined;

  let packetInput: Parameters<typeof buildResumeDraftPacket>[0];
  let resumeAngle = application.resumeAngle;

  if (linkedCandidate) {
    packetInput = linkedCandidate;
    resumeAngle =
      resumeAngle ??
      linkedCandidate.recommendedResumeAngle ??
      `Review resume bank for this ${linkedCandidate.roleType} role.`;
  } else {
    const scored = scoreJobCandidate(
      {
        company: application.company,
        roleTitle: application.roleTitle,
        description: application.jobDescription,
        roleType: application.roleType
      },
      state.resumeModules
    );
    packetInput = {
      id: card.id,
      company: application.company,
      roleTitle: application.roleTitle,
      recommendedResumeAngle: resumeAngle ?? scored.recommendedResumeAngle,
      suggestedResumeModuleIds: scored.suggestedResumeModuleIds,
      roleType: application.roleType
    };
    resumeAngle = packetInput.recommendedResumeAngle;
  }

  const packet = {
    ...buildResumeDraftPacket(packetInput, state.resumeModules, nowIso()),
    resumeAngle: resumeAngle ?? packetInput.recommendedResumeAngle ?? ""
  };

  const cards = updateCard(state.cards, cardId, (item) => ({
    ...item,
    careerApplication: item.careerApplication
      ? {
          ...item.careerApplication,
          resumeDraftPacket: packet,
          resumeAngle: packet.resumeAngle
        }
      : item.careerApplication
  }));

  return {
    state: { ...state, cards },
    ok: true,
    message: "Resume draft packet created from current resume bank."
  };
}

function updateJobSource(
  sources: JobSource[],
  sourceId: string,
  patch: JobSourcePatch
): JobSource[] {
  return sources.map((source) => (source.id === sourceId ? { ...source, ...patch } : source));
}

export function applyAddJobSource(state: LifeHarnessData, input: JobSourceInput): ActionResult {
  const source: JobSource = {
    id: createId("job-source"),
    name: input.name.trim(),
    url: input.url.trim(),
    kind: input.kind,
    enabled: input.enabled ?? true,
    cadence: input.cadence ?? "manual",
    maxResults: input.maxResults ?? 25,
    notes: input.notes?.trim() || undefined,
    adapterNotes: input.adapterNotes?.trim() || undefined,
    requestConfig: input.requestConfig,
    runStatus: "idle"
  };

  return {
    state: {
      ...state,
      jobSources: [source, ...state.jobSources]
    },
    ok: true,
    message: `Added source ${source.name}.`
  };
}

export function applySaveJobSourceWithOptionalImport(
  state: LifeHarnessData,
  input: JobSourceInput,
  previewOutput?: JobSourceRunOutput
): ActionResult {
  const addResult = applyAddJobSource(state, input);
  if (!addResult.ok) {
    return addResult;
  }

  const savedSource = addResult.state.jobSources[0];
  if (!previewOutput || !savedSource) {
    return addResult;
  }

  const rebound = rebindJobSourceRunOutput(previewOutput, savedSource);
  return applyRunJobSourceResult(addResult.state, rebound);
}

export function applyUpdateJobSource(
  state: LifeHarnessData,
  sourceId: string,
  patch: JobSourcePatch
): ActionResult {
  const source = state.jobSources.find((item) => item.id === sourceId);
  if (!source) {
    return { state, ok: false, message: "Source not found." };
  }

  return {
    state: {
      ...state,
      jobSources: updateJobSource(state.jobSources, sourceId, patch)
    },
    ok: true,
    message: `Updated ${source.name}.`
  };
}

export function applyImportCareerSourcePack(
  state: LifeHarnessData,
  json: string,
  importedAt = nowIso()
): ActionResult {
  const parsed = parseCareerSourcePackJson(json);
  if (!parsed.ok) {
    return {
      state,
      ok: false,
      message: parsed.error
    };
  }

  const updatedModules = upsertPackResumeModules(state.resumeModules, parsed.pack.resumeModules);
  const warningNote =
    parsed.warnings.length > 0
      ? ` Warnings: ${parsed.warnings.slice(0, 2).join(" · ")}`
      : "";

  return {
    state: {
      ...state,
      resumeModules: updatedModules,
      careerSourcePack: { pack: parsed.pack, importedAt }
    },
    ok: true,
    message: `Imported Career Source Pack (${parsed.pack.resumeModules.length} modules, ${parsed.pack.roleRecipes.length} role recipes).${warningNote}`
  };
}

export function applyClearCareerSourcePack(state: LifeHarnessData): ActionResult {
  if (!state.careerSourcePack) {
    return { state, ok: true, message: "No Career Pack is imported." };
  }

  return {
    state: {
      ...state,
      careerSourcePack: null
    },
    ok: true,
    message:
      "Cleared Career Pack. Matching and queue filters removed; imported Resume Bank modules remain."
  };
}

export function applyRunJobSourceResult(
  state: LifeHarnessData,
  output: JobSourceRunOutput
): ActionResult {
  const source = state.jobSources.find((item) => item.id === output.result.sourceId);
  if (!source) {
    return { state, ok: false, message: "Source not found." };
  }

  const log = createLogEntry({
    rawText: `Ran job source: ${source.name}`,
    area: "social_career",
    type: "clarity"
  });
  const proofs: ProofItem[] = [];
  const ranProof = createProofItem({
    title: PROOF_TITLES.ranJobSource,
    area: "social_career",
    sourceLogId: log.id
  });
  proofs.push(ranProof);

  if (output.result.createdCandidateIds.length > 0) {
    proofs.push(
      createProofItem({
        title: PROOF_TITLES.foundJobCandidates,
        area: "social_career",
        sourceLogId: log.id
      })
    );
  }

  log.proofItemId = proofs[0]?.id;

  return {
    state: {
      ...state,
      jobCandidates: [...output.candidates, ...state.jobCandidates],
      jobSources: updateJobSource(state.jobSources, source.id, output.updatedSource),
      jobSourceRuns: [output.result, ...state.jobSourceRuns],
      logs: prependLog(state.logs, log),
      proofItems: [...proofs, ...state.proofItems]
    },
    ok: output.result.errors.length === 0,
    message:
      output.result.errors.length === 0
        ? withProofSuffix(output.result.message, proofs.length > 1)
        : output.result.message
  };
}

export function applyCompleteAgentSessionWithEvidence(
  state: LifeHarnessData,
  sessionId: string,
  input: HarnessAgentSessionCompleteInput = {},
  now: string = nowIso()
): ActionResult {
  const existing = state.agentSessions.find((session) => session.id === sessionId);
  if (!existing) {
    return { ok: false, state, message: "Session not found." };
  }

  const hadEvidence = sessionAlreadyHasEvidence(existing);
  const completed = applyCompleteAgentSession(state, sessionId, input, now);
  if (!completed.ok) {
    return { ok: false, state, message: completed.error };
  }

  let nextState = completed.state;
  const session = nextState.agentSessions.find((item) => item.id === sessionId);
  if (!session) {
    return { ok: false, state, message: "Session not found." };
  }

  const card = nextState.cards.find((item) => item.id === session.cardId);
  if (!card || hadEvidence) {
    return {
      ok: true,
      state: nextState,
      message: hadEvidence ? "Session updated." : "Session marked done."
    };
  }

  const { proofTitle, logText } = buildAgentSessionProofSummary(session);
  const log = createLogEntry({
    rawText: logText,
    area: card.area,
    type: "win",
    cardId: card.id
  });
  const proof = createProofItem({
    title: proofTitle,
    area: card.area,
    cardId: card.id,
    sourceLogId: log.id
  });
  log.proofItemId = proof.id;

  const agentSessions = nextState.agentSessions.map((item) =>
    item.id === sessionId
      ? {
          ...item,
          evidenceLogId: log.id,
          evidenceProofItemId: proof.id
        }
      : item
  );

  return {
    ok: true,
    state: {
      ...nextState,
      agentSessions,
      logs: prependLog(nextState.logs, log),
      proofItems: prependProof(nextState.proofItems, proof),
      cards: updateCard(nextState.cards, card.id, (current) => ({
        ...touchCard(current, session.taskName),
        proofItemIds: [proof.id, ...current.proofItemIds]
      }))
    },
    message: withProofSuffix("Session marked done.", true),
    cardId: card.id
  };
}
