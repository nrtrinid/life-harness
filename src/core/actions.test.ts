import { describe, expect, it } from "vitest";

import {
  applyAddJobSource,
  applyApproveJobCandidate,
  applyAddDefaultResumeModulesToPacket,
  applyBackfillResumeDraftPacket,
  applyPatchResumeModule,
  applyToggleResumeDraftPacketModule,
  applyCardStateChange,
  applyCareerIntake,
  applyCreateCard,
  applyDismissJobCandidate,
  applyJobCandidateIntake,
  applyMvd,
  applyPounce,
  applyQuickCapture,
  applyResumeExportedForCard,
  applyRunJobSourceResult,
  applySalvage,
  applySaveJobCandidate,
  applySaveJobSourceWithOptionalImport,
  applySetMainQuest
} from "./actions";
import type { LifeHarnessData } from "./lifeHarnessData";
import { buildProofLedger } from "./proofLedger";
import { PROOF_TITLES } from "./proof";
import { PREVIEW_JOB_SOURCE_ID, runJobSourceFromRaw } from "./jobSourceRunner";
import { buildRawLabIdeaCaptureText } from "./rawLabOutputAttachment";
import { buildApplicationResumeReadiness } from "./resumeReadiness";
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
    featureSprintPlans: [],
    featureSprintRunnerRuns: [],
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

describe("applyResumeExportedForCard", () => {
  it("creates win log and proof linked to the card", () => {
    const state = createState();
    const cardId = "qualcomm-application";
    const result = applyResumeExportedForCard(state, cardId);

    expect(result.ok).toBe(true);
    expect(result.state.logs[0]?.type).toBe("win");
    expect(result.state.logs[0]?.cardId).toBe(cardId);
    expect(result.state.logs[0]?.rawText).toBe("Resume exported for Qualcomm — Security Engineer");
    expect(result.state.proofItems[0]?.title).toBe(PROOF_TITLES.resumeExported);
    expect(result.state.proofItems[0]?.cardId).toBe(cardId);

    const card = result.state.cards.find((item) => item.id === cardId);
    expect(card?.proofItemIds[0]).toBe(result.state.proofItems[0]?.id);
    expect(card?.lastTouched).toBeTruthy();
    expect(card?.recentWins[0]).toContain("Resume exported");
    expect(result.message).toContain("Resume export logged");
  });

  it("includes filename in log text when provided", () => {
    const state = createState();
    const result = applyResumeExportedForCard(state, "qualcomm-application", {
      filename: "qualcomm-security.docx"
    });

    expect(result.ok).toBe(true);
    expect(result.state.logs[0]?.rawText).toContain("qualcomm-security.docx");
  });

  it("rejects missing card without mutating state", () => {
    const state = createState();
    const result = applyResumeExportedForCard(state, "missing-card");

    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(result.message).toContain("not found");
  });

  it("rejects S3 cards", () => {
    const state = createState();
    const s3Card = {
      ...structuredClone(state.cards.find((card) => card.id === "qualcomm-application")!),
      id: "card-s3-resume-export",
      sensitivity: "S3" as const
    };
    const withS3 = { ...state, cards: [...state.cards, s3Card] };
    const result = applyResumeExportedForCard(withS3, s3Card.id);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("S3");
  });

  it("appears in Proof Ledger under resume source", () => {
    const state = createState();
    const result = applyResumeExportedForCard(state, "qualcomm-application");
    const summary = buildProofLedger(result.state);

    const resumeEntry = summary.entries.find((entry) => entry.source === "resume");
    expect(resumeEntry?.title).toBe(PROOF_TITLES.resumeExported);
    expect(resumeEntry?.cardId).toBe("qualcomm-application");
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

  it("captures raw lab assistant output via buildRawLabIdeaCaptureText", () => {
    const state = createState();
    const captureText = buildRawLabIdeaCaptureText("Try a smaller slice first.");
    expect(captureText).not.toBeNull();

    const result = applyQuickCapture(state, captureText!);

    expect(result.ok).toBe(true);
    expect(result.state.cards.length).toBe(state.cards.length + 1);
    expect(result.state.cards[0]?.title).toContain("Try a smaller slice first.");
    expect(result.state.logs.length).toBe(state.logs.length + 1);
    expect(result.state.proofItems.length).toBe(state.proofItems.length + 1);
    expect(result.message).toContain("Added to Inbox");
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

  it("toggles resume draft packet modules and updates section coverage", () => {
    const state = createState();
    const intake = applyJobCandidateIntake(state, {
      company: "Toggle Co",
      roleTitle: "Communications Technician",
      description: "Field communications and cabling work.",
      roleType: "other",
      origin: "manual"
    });
    const approved = applyApproveJobCandidate(intake.state, intake.candidateId!);
    const cardId = approved.cardId!;
    const before = approved.state.cards.find((card) => card.id === cardId);
    const packet = before?.careerApplication?.resumeDraftPacket;
    expect(packet).toBeTruthy();

    const readinessBefore = buildApplicationResumeReadiness({
      card: before!,
      resumeModules: approved.state.resumeModules
    });
    expect(
      readinessBefore.warnings.some((warning) => warning.category === "missing_section_coverage")
    ).toBe(true);

    const educationModule = approved.state.resumeModules.find(
      (module) => module.resumePlacement?.section === "education" && module.isActive
    );
    expect(educationModule).toBeTruthy();

    const toggled = applyToggleResumeDraftPacketModule(
      approved.state,
      cardId,
      educationModule!.id
    );
    expect(toggled.ok).toBe(true);
    const after = toggled.state.cards.find((card) => card.id === cardId);
    expect(after?.careerApplication?.resumeDraftPacket?.selectedModuleIds).toContain(
      educationModule!.id
    );
    expect(after?.careerApplication?.resumeDraftPacket?.sectionCoverage).toContain("education");

    const readinessAfter = buildApplicationResumeReadiness({
      card: after!,
      resumeModules: toggled.state.resumeModules
    });
    expect(
      readinessAfter.warnings.some(
        (warning) =>
          warning.category === "missing_section_coverage" && warning.section === "education"
      )
    ).toBe(false);
  });

  it("patches resume module content and clears blocking date warnings", () => {
    const state = createState();
    const intake = applyJobCandidateIntake(state, {
      company: "Patch Co",
      roleTitle: "Software Engineer",
      description: "TypeScript and Python backend work.",
      roleType: "software",
      origin: "manual"
    });
    const approved = applyApproveJobCandidate(intake.state, intake.candidateId!);
    const cardId = approved.cardId!;
    const card = approved.state.cards.find((item) => item.id === cardId)!;
    const projectModule = approved.state.resumeModules.find(
      (module) => module.category === "project" && module.isActive
    )!;
    const projectId = projectModule.id;

    const withoutDate = applyPatchResumeModule(approved.state, projectId, { date: "" });
    expect(withoutDate.ok).toBe(false);

    const patched = applyPatchResumeModule(approved.state, projectId, { date: "2025" });
    expect(patched.ok).toBe(true);

    const readiness = buildApplicationResumeReadiness({
      card,
      resumeModules: patched.state.resumeModules
    });
    expect(
      readiness.warnings.some(
        (warning) => warning.category === "missing_date" && warning.moduleId === projectId
      )
    ).toBe(false);
  });

  it("adds default bank modules for missing critical sections", () => {
    const state = createState();
    const intake = applyJobCandidateIntake(state, {
      company: "Defaults Co",
      roleTitle: "Communications Technician",
      description: "Field communications work.",
      roleType: "other",
      origin: "manual"
    });
    const approved = applyApproveJobCandidate(intake.state, intake.candidateId!);
    const cardId = approved.cardId!;

    const result = applyAddDefaultResumeModulesToPacket(approved.state, cardId);
    expect(result.ok).toBe(true);
    const packet = result.state.cards.find((card) => card.id === cardId)?.careerApplication
      ?.resumeDraftPacket;
    expect(packet?.sectionCoverage).toEqual(
      expect.arrayContaining(["education", "skills", "projects"])
    );
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

describe("applySetMainQuest", () => {
  it("sets main quest for active cards only", () => {
    const state = createState();
    const active = state.cards.find((card) => card.state === "active");
    expect(active).toBeDefined();

    const result = applySetMainQuest(state, active!.id);
    expect(result.ok).toBe(true);
    expect(result.state.dailyState.mainQuestId).toBe(active!.id);
  });

  it("clears main quest when card leaves active", () => {
    const state = createState();
    const active = state.cards.find((card) => card.state === "active");
    expect(active).toBeDefined();
    const withQuest = applySetMainQuest(state, active!.id).state;
    const parked = applyCardStateChange(withQuest, active!.id, "parked");

    expect(parked.ok).toBe(true);
    expect(parked.state.dailyState.mainQuestId).toBeUndefined();
  });
});

describe("applyCreateCard", () => {
  it("creates inbox cards only", () => {
    const state = createState({ mainQuestId: undefined });
    const result = applyCreateCard(state, { title: "Garage cleanup", area: "build" });

    expect(result.ok).toBe(true);
    expect(result.state.cards[0]?.title).toBe("Garage cleanup");
    expect(result.state.cards[0]?.state).toBe("inbox");
    expect(result.message).toContain("Added to Inbox");
  });
});

describe("applyQuickCapture idea message", () => {
  it("includes inbox destination in success message", () => {
    const state = createState();
    const result = applyQuickCapture(state, "new idea: test project");

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Added to Inbox: test project");
  });
});
