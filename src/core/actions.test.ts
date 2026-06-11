import { describe, expect, it } from "vitest";

import {
  applyAddJobSource,
  applyApproveJobCandidate,
  applyBackfillResumeDraftPacket,
  applyCardStateChange,
  applyCareerIntake,
  applyDismissJobCandidate,
  applyJobCandidateIntake,
  applyMvd,
  applyPounce,
  applyQuickCapture,
  applyRunJobSourceResult,
  applySalvage,
  applySaveJobCandidate,
  applySaveJobSourceWithOptionalImport
} from "./actions";
import type { LifeHarnessData } from "./lifeHarnessData";
import { PREVIEW_JOB_SOURCE_ID, runJobSourceFromRaw } from "./jobSourceRunner";
import { seedJobCandidates, seedJobSources, seedResumeModules } from "../data/seedJobScout";
import { seedCards, seedDailyState, seedLogs, seedProofItems } from "../data/seed";
import type { DailyState } from "./types";

function createState(dailyStateOverrides: Partial<DailyState> = {}): LifeHarnessData {
  return {
    cards: structuredClone(seedCards),
    logs: structuredClone(seedLogs),
    proofItems: structuredClone(seedProofItems),
    dailyState: { ...structuredClone(seedDailyState), ...dailyStateOverrides },
    resumeModules: structuredClone(seedResumeModules),
    jobCandidates: structuredClone(seedJobCandidates),
    jobSources: structuredClone(seedJobSources),
    jobSourceRuns: [],
    chatSummaries: [],
    memoryItems: [],
    projects: [],
    agentSessions: [],
    careerSourcePack: null
  };
}

describe("applyPounce", () => {
  it("rejects a second pounce in the same session", () => {
    const state = createState({ pounceStarted: true });
    const result = applyPounce(state);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("already logged");
    expect(result.state.logs).toHaveLength(state.logs.length);
  });

  it("creates career pounce log and proof on first pounce", () => {
    const state = createState({ pounceStarted: false });
    const result = applyPounce(state);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Career pounce");
    expect(result.state.logs[0]?.area).toBe("social_career");
    expect(result.state.proofItems[0]?.title).toBe("Started career pounce");
    expect(result.state.dailyState.pounceStarted).toBe(true);
  });
});

describe("applyCardStateChange", () => {
  it("creates log and proof when parking via state button", () => {
    const state = createState();
    const activeCard = state.cards.find((card) => card.state === "active");
    expect(activeCard).toBeDefined();

    const result = applyCardStateChange(state, activeCard!.id, "parked");

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Parked");
    expect(result.message).toContain("Proof updated");
    expect(result.state.logs.length).toBe(state.logs.length + 1);
    expect(result.state.proofItems.length).toBe(state.proofItems.length + 1);
    expect(result.state.cards.find((card) => card.id === activeCard!.id)?.state).toBe("parked");
  });

  it("syncs applicationStatus when changing application card state", () => {
    const state = createState();
    const application = state.cards.find((card) => card.id === "qualcomm-application");
    expect(application?.careerApplication).toBeDefined();

    const result = applyCardStateChange(state, application!.id, "done");

    expect(result.ok).toBe(true);
    const updated = result.state.cards.find((card) => card.id === application!.id);
    expect(updated?.state).toBe("done");
    expect(updated?.careerApplication?.applicationStatus).toBe("done");
  });
});

describe("applyMvd", () => {
  it("rejects a second MVD in the same session", () => {
    const state = createState({ minimumViableDayCompleted: true });
    const result = applyMvd(state);

    expect(result.ok).toBe(false);
    expect(result.state.logs).toHaveLength(state.logs.length);
  });
});

describe("applySalvage", () => {
  it("rejects a second salvage in the same session", () => {
    const state = createState({ salvageCompleted: true });
    const result = applySalvage(state, "10-minute walk");

    expect(result.ok).toBe(false);
    expect(result.state.logs).toHaveLength(state.logs.length);
  });
});

describe("applyCareerIntake", () => {
  it("defaults new application cards to inbox", () => {
    const state = createState();
    const result = applyCareerIntake(state, {
      company: "Acme",
      roleTitle: "Engineer",
      jobDescription: "Build things",
      roleType: "software"
    });

    expect(result.ok).toBe(true);
    const card = result.state.cards[0];
    expect(card.state).toBe("inbox");
    expect(card.careerApplication?.applicationStatus).toBe("inbox");
    expect(result.state.proofItems[0]?.title).toBe("Created application card");
  });

  it("blocks active intake when active limit is full", () => {
    const state = createState();
    const result = applyCareerIntake(state, {
      company: "Blocked Co",
      roleTitle: "Engineer",
      jobDescription: "Build things",
      roleType: "software",
      applicationStatus: "active"
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Active is full");
  });
});

describe("applyQuickCapture", () => {
  it("creates a log and proof on matched worked_on", () => {
    const state = createState();
    const result = applyQuickCapture(state, "worked on rpg");

    expect(result.ok).toBe(true);
    expect(result.state.logs.length).toBe(state.logs.length + 1);
    expect(result.state.proofItems.length).toBe(state.proofItems.length + 1);
    expect(result.message).toContain("Work logged");
  });

  it("creates log-only worked_on when no card matches", () => {
    const state = createState();
    const result = applyQuickCapture(state, "worked on unknown project xyz");

    expect(result.ok).toBe(true);
    expect(result.state.logs.length).toBe(state.logs.length + 1);
    expect(result.state.proofItems.length).toBe(state.proofItems.length);
    expect(result.message).toContain("Work logged");
  });

  it("returns grammar hint without mutating on unmatched input", () => {
    const state = createState();
    const result = applyQuickCapture(state, "random note");

    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(result.message).toContain("No rule matched");
  });

  it("logs follow-up without proof when no card matches", () => {
    const state = createState();
    const result = applyQuickCapture(state, "followed up with unknown company");

    expect(result.ok).toBe(true);
    expect(result.state.logs.length).toBe(state.logs.length + 1);
    expect(result.state.proofItems.length).toBe(state.proofItems.length);
  });

  it("captures agent finished without completing sessions", () => {
    const state = createState();
    const beforeSessions = state.agentSessions.length;
    const result = applyQuickCapture(state, "agent finished card split");

    expect(result.ok).toBe(true);
    expect(result.state.agentSessions.length).toBe(beforeSessions);
    expect(result.state.logs.length).toBe(state.logs.length + 1);
  });

  it("records resume exported without creating DOCX", () => {
    const state = createState();
    const result = applyQuickCapture(state, "resume exported for unknown role");

    expect(result.ok).toBe(true);
    expect(result.state.logs.length).toBe(state.logs.length + 1);
    expect(result.message).toContain("Resume export logged");
  });

  it("does not park without a safe card match", () => {
    const state = createState();
    const result = applyQuickCapture(state, "park unknown card title");

    expect(result.ok).toBe(false);
    expect(result.state.cards).toEqual(state.cards);
    expect(result.message).toContain("safe card");
  });

  it("does not match or mutate S3 cards", () => {
    const state = createState();
    const s3Card = {
      ...structuredClone(state.cards[0]!),
      id: "card-s3-capture",
      title: "Secret Vault Project",
      sensitivity: "S3" as const
    };
    state.cards = [s3Card, ...state.cards];

    const result = applyQuickCapture(state, "worked on secret vault project");

    expect(result.ok).toBe(true);
    expect(result.state.logs[0]?.cardId).toBeUndefined();
    expect(result.state.proofItems.length).toBe(state.proofItems.length);
  });
});

describe("job candidate actions", () => {
  it("creates candidate without application card", () => {
    const state = createState();
    const result = applyJobCandidateIntake(state, {
      company: "Test Co",
      roleTitle: "Engineer",
      description: "Python and security experience required.",
      roleType: "software",
      origin: "manual"
    });

    expect(result.ok).toBe(true);
    expect(result.state.jobCandidates.length).toBe(state.jobCandidates.length + 1);
    expect(result.state.cards.length).toBe(state.cards.length);
    expect(result.state.jobCandidates[0]?.origin).toBe("manual");
  });

  it("approves candidate into inbox with bidirectional links", () => {
    const state = createState();
    const intake = applyJobCandidateIntake(state, {
      company: "Approve Co",
      roleTitle: "Security Engineer",
      description: "Python, TypeScript, security, application security.",
      roleType: "cybersecurity",
      origin: "manual"
    });
    const candidateId = intake.candidateId!;

    const approved = applyApproveJobCandidate(intake.state, candidateId);
    expect(approved.ok).toBe(true);
    const card = approved.state.cards[0];
    const candidate = approved.state.jobCandidates.find((item) => item.id === candidateId);

    expect(card?.state).toBe("inbox");
    expect(candidate?.status).toBe("card_created");
    expect(candidate?.applicationCardId).toBe(card?.id);
    expect(card?.careerApplication?.jobCandidateId).toBe(candidateId);
    expect(card?.careerApplication?.resumeDraftPacket).toMatchObject({
      sourceCandidateId: candidateId,
      company: "Approve Co",
      roleTitle: "Security Engineer"
    });
    expect(card?.careerApplication?.resumeDraftPacket?.selectedModuleIds.length).toBeGreaterThan(0);
    expect(card?.nextTinyAction).toBe("Tailor resume angle and submit application.");
    expect(card?.whyItMatters).toContain("Job Scout");
  });

  it("backfills resume draft packet on legacy application cards", () => {
    const state = createState();
    const created = applyCareerIntake(state, {
      company: "Legacy Co",
      roleTitle: "Security Engineer",
      jobDescription: "Python, application security, and TypeScript.",
      roleType: "cybersecurity",
      applicationStatus: "waiting"
    });
    const cardId = created.cardId!;
    expect(created.state.cards[0]?.careerApplication?.resumeDraftPacket).toBeUndefined();

    const backfill = applyBackfillResumeDraftPacket(created.state, cardId);
    expect(backfill.ok).toBe(true);
    const packet = backfill.state.cards.find((card) => card.id === cardId)?.careerApplication
      ?.resumeDraftPacket;
    expect(packet?.selectedModuleIds.length).toBeGreaterThan(0);
    expect(packet?.company).toBe("Legacy Co");
  });

  it("enriches paste intake with fit label and matched skills", () => {
    const state = createState();
    const result = applyJobCandidateIntake(state, {
      company: "Test Co",
      roleTitle: "Junior Security Engineer",
      description: "Entry-level Python and security role.",
      roleType: "cybersecurity",
      origin: "manual"
    });

    const candidate = result.state.jobCandidates[0];
    expect(candidate?.fitLabel).toBeTruthy();
    expect(candidate?.matchedSkills).toBeDefined();
  });

  it("is idempotent when approving again", () => {
    const state = createState();
    const intake = applyJobCandidateIntake(state, {
      company: "Approve Co",
      roleTitle: "Security Engineer",
      description: "Python and security.",
      roleType: "cybersecurity",
      origin: "manual"
    });
    const candidateId = intake.candidateId!;
    const first = applyApproveJobCandidate(intake.state, candidateId);
    const second = applyApproveJobCandidate(first.state, candidateId);

    expect(second.ok).toBe(true);
    expect(second.message).toContain("Already approved");
    expect(second.state.cards.length).toBe(first.state.cards.length);
  });

  it("supports save and dismiss transitions", () => {
    const state = createState();
    const intake = applyJobCandidateIntake(state, {
      company: "Queue Co",
      roleTitle: "Engineer",
      description: "Python",
      roleType: "software",
      origin: "manual"
    });
    const candidateId = intake.candidateId!;

    const saved = applySaveJobCandidate(intake.state, candidateId);
    expect(saved.state.jobCandidates.find((item) => item.id === candidateId)?.status).toBe("saved");

    const dismissed = applyDismissJobCandidate(saved.state, candidateId);
    expect(dismissed.state.jobCandidates.find((item) => item.id === candidateId)?.status).toBe(
      "dismissed"
    );
  });

  it("records source run candidates with source_fetch origin", () => {
    const state = createState();
    const source = state.jobSources.find((item) => item.id === "source-fixture-greenhouse");
    expect(source).toBeDefined();
    const output = runJobSourceFromRaw(
      source!,
      {
        jobs: [
          {
            title: "Platform Engineer",
            absolute_url: "https://boards.example.com/jobs/2001",
            content: "TypeScript React testing software engineer."
          }
        ]
      },
      state.jobCandidates,
      state.resumeModules
    );
    const result = applyRunJobSourceResult(state, output);
    expect(result.ok).toBe(true);
    expect(result.state.jobCandidates[0]?.origin).toBe("source_fetch");
    expect(result.state.jobSourceRuns).toHaveLength(1);
    expect(result.state.cards).toHaveLength(state.cards.length);
  });

  it("adds detected-style job source via applyAddJobSource", () => {
    const state = createState();
    const result = applyAddJobSource(state, {
      name: "Netskope",
      url: "https://boards-api.greenhouse.io/v1/boards/netskope/jobs",
      kind: "greenhouse",
      enabled: true,
      cadence: "manual",
      maxResults: 25
    });
    expect(result.ok).toBe(true);
    expect(result.state.jobSources[0]?.name).toBe("Netskope");
    expect(result.state.jobSources).toHaveLength(state.jobSources.length + 1);
    expect(result.state.jobCandidates).toHaveLength(state.jobCandidates.length);
  });

  it("persists requestConfig on applyAddJobSource", () => {
    const state = createState();
    const requestConfig = {
      method: "POST" as const,
      bodyJson: { appliedFacets: {}, limit: 20, offset: 0, searchText: "" }
    };
    const result = applyAddJobSource(state, {
      name: "Qualcomm Endpoint",
      url: "/fixtures/sample-workday-cxs-response.json",
      kind: "workday",
      requestConfig
    });
    expect(result.state.jobSources[0]?.requestConfig).toEqual(requestConfig);
  });

  it("save without preview import does not add candidates", () => {
    const state = createState();
    const source = state.jobSources.find((item) => item.id === "source-fixture-greenhouse");
    const previewOutput = runJobSourceFromRaw(
      { ...source!, id: PREVIEW_JOB_SOURCE_ID },
      {
        jobs: [
          {
            title: "Preview Role",
            absolute_url: "https://boards.example.com/jobs/preview-1",
            content: "TypeScript React testing."
          }
        ]
      },
      state.jobCandidates,
      state.resumeModules
    );

    const result = applySaveJobSourceWithOptionalImport(state, {
      name: "New Greenhouse Source",
      url: "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
      kind: "greenhouse"
    });
    expect(result.ok).toBe(true);
    expect(result.state.jobCandidates).toHaveLength(state.jobCandidates.length);
    expect(result.state.jobSourceRuns).toHaveLength(0);
    expect(previewOutput.candidates.length).toBeGreaterThan(0);
  });

  it("save with preview import adds source_fetch candidates and run record", () => {
    const state = createState();
    const previewOutput = runJobSourceFromRaw(
      {
        id: PREVIEW_JOB_SOURCE_ID,
        name: "Preview",
        url: "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
        kind: "greenhouse",
        enabled: true,
        cadence: "manual"
      },
      {
        jobs: [
          {
            title: "Imported Role",
            absolute_url: "https://boards.example.com/jobs/import-1",
            content: "Python security application security."
          }
        ]
      },
      state.jobCandidates,
      state.resumeModules
    );

    const result = applySaveJobSourceWithOptionalImport(
      state,
      {
        name: "Imported Source",
        url: "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
        kind: "greenhouse"
      },
      previewOutput
    );
    expect(result.ok).toBe(true);
    expect(result.state.jobCandidates[0]?.origin).toBe("source_fetch");
    expect(result.state.jobCandidates[0]?.sourceId).toBe(result.state.jobSources[0]?.id);
    expect(result.state.jobSourceRuns).toHaveLength(1);
    expect(result.state.jobSourceRuns[0]?.sourceId).toBe(result.state.jobSources[0]?.id);
  });
});
