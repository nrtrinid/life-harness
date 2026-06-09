import { findCardByTitleTokens } from "./cardMatching";
import { createCareerApplicationCard, syncApplicationStatus, type CareerIntakeInput } from "./career";
import { createId, nowIso } from "./ids";
import { canActivateCard, getActiveLimitStatus, ACTIVE_CARD_LIMIT } from "./guards";
import { AREA_LABELS } from "./labels";
import {
  buildCareerIntakeFromCandidate,
  createJobCandidate,
  dismissJobCandidate,
  saveJobCandidate,
  type JobCandidateIntakeInput
} from "./jobScout";
import { parseQuickCapture } from "./parsing";
import { createProofItem, PROOF_TITLES } from "./proof";
import { computeXP } from "./scoring";
import type {
  CardState,
  DailyState,
  JobCandidate,
  JobSource,
  JobSourceKind,
  JobSourceRunResult,
  LifeArea,
  LifeCard,
  LifeLogEntry,
  ProofItem,
  ResumeModule
} from "./types";
import type { JobSourceRunOutput } from "./jobSourceRunner";

export interface LifeHarnessData {
  cards: LifeCard[];
  logs: LifeLogEntry[];
  proofItems: ProofItem[];
  dailyState: DailyState;
  resumeModules: ResumeModule[];
  jobCandidates: JobCandidate[];
  jobSources: JobSource[];
  jobSourceRuns: JobSourceRunResult[];
}

export interface JobSourceInput {
  name: string;
  url: string;
  kind: JobSourceKind;
  enabled?: boolean;
  cadence?: JobSource["cadence"];
  maxResults?: number;
  notes?: string;
  adapterNotes?: string;
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
  const intent = parseQuickCapture(rawText);
  if (!intent) {
    return {
      state,
      ok: false,
      message: "No rule matched. Try: worked on …, new idea: …, park …"
    };
  }

  let cards = state.cards;
  let logs = state.logs;
  let proofItems = state.proofItems;
  let message = "";

  if (intent.kind === "new_idea") {
    const card = createInboxCard(intent.title);
    const log = createLogEntry({
      rawText: trimmedCapture(rawText),
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

    cards = [card, ...cards];
    logs = prependLog(logs, log);
    proofItems = prependProof(proofItems, proof);
    message = withProofSuffix("Idea captured to Inbox", true);
  } else if (intent.kind === "park") {
    const matched = findCardByTitleTokens(cards, rawText);
    if (!matched) {
      return { state, ok: false, message: "Could not find a card to park. Try including more of the title." };
    }

    const parkResult = applyParkCard(state, matched.id, trimmedCapture(rawText));
    return parkResult;
  } else {
    const matched = findCardByTitleTokens(cards, rawText);
    const log = createLogEntry({
      rawText: trimmedCapture(rawText),
      area: intent.area,
      type: intent.type,
      cardId: matched?.id
    });

    let proof: ProofItem | undefined;
    if (intent.applied) {
      proof = createProofItem({
        title: PROOF_TITLES.appliedToJob,
        area: "social_career",
        cardId: matched?.id,
        sourceLogId: log.id
      });
      log.proofItemId = proof.id;
    } else if (intent.type === "win" && matched) {
      proof = createProofItem({
        title: `Worked on ${matched.title}.`,
        area: intent.area,
        cardId: matched.id,
        sourceLogId: log.id
      });
      log.proofItemId = proof.id;
    } else if (intent.area === "social_career" && /follow-up|texted|emailed/i.test(rawText)) {
      proof = createProofItem({
        title: PROOF_TITLES.followUp,
        area: "social_career",
        cardId: matched?.id,
        sourceLogId: log.id
      });
      log.proofItemId = proof.id;
    }

    if (matched) {
      cards = updateCard(cards, matched.id, (card) => ({
        ...touchCard(card, intent.type === "win" ? trimmedCapture(rawText) : undefined),
        proofItemIds: proof ? [proof.id, ...card.proofItemIds] : card.proofItemIds
      }));
    }

    logs = prependLog(logs, log);
    if (proof) {
      proofItems = prependProof(proofItems, proof);
    }

    if (intent.type === "leak") {
      message = "Leak logged";
    } else if (intent.applied) {
      message = withProofSuffix(`+${log.xp} XP · Applied to job logged`, true);
    } else if (intent.type === "win" && !matched) {
      message = `+${log.xp} XP · ${AREA_LABELS[intent.area]} win logged (no card match — proof not added)`;
    } else {
      message = withProofSuffix(`+${log.xp} XP · ${AREA_LABELS[intent.area]} win logged`, Boolean(proof));
    }
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

  const intake = buildCareerIntakeFromCandidate(candidate, state.resumeModules);
  const card = createCareerApplicationCard(intake);
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
