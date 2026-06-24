import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import { seedJobSources, seedResumeModules } from "../data/seedJobScout";
import { createCareerApplicationCard } from "./career";
import {
  hydrateState,
  mergeSeedDefaults,
  normalizeData,
  preparePersistedState,
  RUN_INTERRUPTED_MESSAGE
} from "./stateHydration";

describe("normalizeData", () => {
  it("defaults missing arrays to empty arrays", () => {
    const normalized = normalizeData({
      cards: [],
      dailyState: {
        date: "2026-06-09",
        mode: "normal",
        pounceStarted: false,
        minimumViableDayCompleted: false,
        salvageCompleted: false
      }
    });

    expect(normalized.logs).toEqual([]);
    expect(normalized.proofItems).toEqual([]);
    expect(normalized.jobSourceRuns).toEqual([]);
    expect(normalized.jobCandidates).toEqual([]);
    expect(normalized.jobSources).toEqual([]);
    expect(normalized.resumeModules).toEqual([]);
    expect(normalized.careerSourcePack).toBeNull();
    expect(normalized.featureSprintPlans).toEqual([]);
    expect(normalized.featureSprintRunnerRuns).toEqual([]);
  });

  it("hydrates old resume modules with default placement", () => {
    const normalized = normalizeData({
      resumeModules: [
        {
          id: "legacy-project",
          title: "Legacy Project",
          category: "project",
          summary: "Old saved module.",
          tags: [],
          bullets: ["Built useful thing"],
          skills: ["TypeScript"],
          bestFor: ["software"],
          isActive: true
        }
      ]
    });

    expect(normalized.resumeModules[0]?.resumePlacement).toMatchObject({
      section: "projects",
      heading: "Legacy Project",
      order: 0
    });
  });

  it("hydrates old application cards without resume draft packets", () => {
    const normalized = normalizeData({
      cards: [
        {
          id: "card-legacy-application",
          title: "Legacy Co - Engineer",
          area: "social_career",
          state: "inbox",
          progress: 0,
          warmth: "cold",
          nextTinyAction: "Choose resume angle.",
          recentWins: [],
          openLoops: [],
          optimizationIdeas: [],
          proofItemIds: [],
          careerApplication: {
            company: "Legacy Co",
            roleTitle: "Engineer",
            jobDescription: "Software role.",
            roleType: "software",
            applicationStatus: "inbox",
            jobCandidateId: "candidate-legacy"
          }
        }
      ]
    });

    expect(normalized.cards[0]?.careerApplication?.resumeDraftPacket).toBeUndefined();
  });

  it("hydrates old snapshots with careerSourcePack null", () => {
    const state = createSeedState();
    const { careerSourcePack: _removed, ...withoutPack } = state;
    const normalized = normalizeData(withoutPack);
    expect(normalized.careerSourcePack).toBeNull();
  });

  it("round-trips feature sprint plan featureSpec and automationPhase", () => {
    const normalized = normalizeData({
      featureSprintPlans: [
        {
          id: "plan-1",
          cardId: "card-1",
          title: "Web architect",
          goal: "Persist spec",
          status: "planning",
          acceptanceCriteria: ["Spec saved"],
          nonGoals: [],
          constraints: [],
          steps: [],
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z",
          featureSpec: {
            body: "Approved body",
            source: "chatgpt_web",
            updatedAt: "2026-06-09T12:00:00.000Z",
            approvedAt: "2026-06-09T12:00:00.000Z",
            approvedBy: "user"
          },
          automationPhase: "spec_approved"
        }
      ]
    });

    expect(normalized.featureSprintPlans[0]?.featureSpec).toMatchObject({
      body: "Approved body",
      approvedAt: "2026-06-09T12:00:00.000Z"
    });
    expect(normalized.featureSprintPlans[0]?.automationPhase).toBe("spec_approved");
  });

  it("round-trips currentSlice and drops invalid slice objects on load", () => {
    const normalized = normalizeData({
      featureSprintPlans: [
        {
          id: "plan-1",
          cardId: "card-1",
          title: "Slice hydrate",
          goal: "Persist slice",
          status: "in_progress",
          acceptanceCriteria: ["Slice saved"],
          nonGoals: [],
          constraints: [],
          steps: [
            {
              id: "step-1",
              title: "Core",
              goal: "Add slice",
              status: "ready",
              acceptanceCriteria: ["Saved"],
              createdAt: "2026-06-09T12:00:00.000Z",
              updatedAt: "2026-06-09T12:00:00.000Z"
            }
          ],
          currentStepId: "step-1",
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z",
          currentSlice: {
            id: "slice-1",
            title: "Core",
            status: "active",
            phase: "ready",
            source: "planned_step",
            linkedStepId: "step-1",
            createdAt: "2026-06-09T12:00:00.000Z",
            updatedAt: "2026-06-09T12:00:00.000Z"
          }
        },
        {
          id: "plan-2",
          cardId: "card-2",
          title: "Bad slice",
          goal: "Drop invalid",
          status: "in_progress",
          acceptanceCriteria: ["Drop"],
          nonGoals: [],
          constraints: [],
          steps: [],
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z",
          currentSlice: {
            id: "",
            title: "",
            status: "not_valid" as never,
            phase: "not_valid" as never,
            source: "not_valid" as never,
            createdAt: "2026-06-09T12:00:00.000Z",
            updatedAt: "2026-06-09T12:00:00.000Z"
          }
        }
      ]
    });

    expect(normalized.featureSprintPlans[0]?.currentSlice).toMatchObject({
      id: "slice-1",
      phase: "ready",
      status: "active",
      source: "planned_step"
    });
    expect(normalized.featureSprintPlans[1]?.currentSlice).toBeUndefined();
  });

  it("strips empty featureSpec body and invalid automationPhase on load", () => {
    const normalized = normalizeData({
      featureSprintPlans: [
        {
          id: "plan-1",
          cardId: "card-1",
          title: "Empty spec",
          goal: "Hydrate",
          status: "planning",
          acceptanceCriteria: ["Hydrate"],
          nonGoals: [],
          constraints: [],
          steps: [],
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z",
          featureSpec: {
            body: "   ",
            updatedAt: "2026-06-09T12:00:00.000Z"
          },
          automationPhase: "not_a_real_phase" as never
        }
      ]
    });

    expect(normalized.featureSprintPlans[0]?.featureSpec).toBeUndefined();
    expect(normalized.featureSprintPlans[0]?.automationPhase).toBeUndefined();
  });

  it("round-trips step promptLocalization and strips empty revised prompt", () => {
    const normalized = normalizeData({
      featureSprintPlans: [
        {
          id: "plan-1",
          cardId: "card-1",
          title: "Localization",
          goal: "Persist localization",
          status: "in_progress",
          acceptanceCriteria: ["Saved"],
          nonGoals: [],
          constraints: [],
          steps: [
            {
              id: "step-1",
              title: "Core",
              goal: "Add localization",
              status: "ready",
              acceptanceCriteria: ["Tests pass"],
              promptLocalization: {
                rawOutput: "raw",
                likelyFiles: ["src/core/types.ts"],
                existingHelpers: [],
                testsToRun: [],
                risks: [],
                revisedImplementationPrompt: "Implement B1.",
                createdAt: "2026-06-09T12:00:00.000Z",
                updatedAt: "2026-06-09T12:00:00.000Z"
              },
              createdAt: "2026-06-09T12:00:00.000Z",
              updatedAt: "2026-06-09T12:00:00.000Z"
            }
          ],
          currentStepId: "step-1",
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z"
        }
      ]
    });

    expect(normalized.featureSprintPlans[0]?.steps[0]?.promptLocalization?.revisedImplementationPrompt).toBe(
      "Implement B1."
    );

    const stripped = normalizeData({
      featureSprintPlans: [
        {
          id: "plan-2",
          cardId: "card-1",
          title: "Empty localization",
          goal: "Strip",
          status: "in_progress",
          acceptanceCriteria: ["Strip"],
          nonGoals: [],
          constraints: [],
          steps: [
            {
              id: "step-1",
              title: "Core",
              goal: "Strip",
              status: "ready",
              acceptanceCriteria: ["Tests pass"],
              promptLocalization: {
                rawOutput: "   ",
                likelyFiles: [],
                existingHelpers: [],
                testsToRun: [],
                risks: [],
                revisedImplementationPrompt: "   ",
                createdAt: "2026-06-09T12:00:00.000Z",
                updatedAt: "2026-06-09T12:00:00.000Z"
              },
              createdAt: "2026-06-09T12:00:00.000Z",
              updatedAt: "2026-06-09T12:00:00.000Z"
            }
          ],
          currentStepId: "step-1",
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z"
        }
      ]
    });

    expect(stripped.featureSprintPlans[0]?.steps[0]?.promptLocalization).toBeUndefined();
  });

  it("round-trips step promptAudit and strips invalid audit", () => {
    const normalized = normalizeData({
      featureSprintPlans: [
        {
          id: "plan-1",
          cardId: "card-1",
          title: "Audit",
          goal: "Persist audit",
          status: "in_progress",
          acceptanceCriteria: ["Saved"],
          nonGoals: [],
          constraints: [],
          steps: [
            {
              id: "step-1",
              title: "Core",
              goal: "Add audit",
              status: "ready",
              acceptanceCriteria: ["Tests pass"],
              promptAudit: {
                rawOutput: "raw",
                verdict: "ready",
                risks: [],
                requiredPromptChanges: [],
                finalImplementationPrompt: "Audited prompt.",
                mustCheckFiles: [],
                verificationCommands: [],
                createdAt: "2026-06-09T12:00:00.000Z",
                updatedAt: "2026-06-09T12:00:00.000Z"
              },
              createdAt: "2026-06-09T12:00:00.000Z",
              updatedAt: "2026-06-09T12:00:00.000Z"
            }
          ],
          currentStepId: "step-1",
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z"
        }
      ]
    });

    expect(normalized.featureSprintPlans[0]?.steps[0]?.promptAudit?.finalImplementationPrompt).toBe(
      "Audited prompt."
    );

    const stripped = normalizeData({
      featureSprintPlans: [
        {
          id: "plan-2",
          cardId: "card-1",
          title: "Empty audit",
          goal: "Strip",
          status: "in_progress",
          acceptanceCriteria: ["Strip"],
          nonGoals: [],
          constraints: [],
          steps: [
            {
              id: "step-1",
              title: "Core",
              goal: "Strip",
              status: "ready",
              acceptanceCriteria: ["Tests pass"],
              promptAudit: {
                rawOutput: "   ",
                verdict: "not_valid" as never,
                risks: [],
                requiredPromptChanges: [],
                finalImplementationPrompt: "   ",
                mustCheckFiles: [],
                verificationCommands: [],
                createdAt: "2026-06-09T12:00:00.000Z",
                updatedAt: "2026-06-09T12:00:00.000Z"
              },
              createdAt: "2026-06-09T12:00:00.000Z",
              updatedAt: "2026-06-09T12:00:00.000Z"
            }
          ],
          currentStepId: "step-1",
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z"
        }
      ]
    });

    expect(stripped.featureSprintPlans[0]?.steps[0]?.promptAudit).toBeUndefined();
  });

  it("round-trips step implementationProof and strips invalid proof", () => {
    const normalized = normalizeData({
      featureSprintPlans: [
        {
          id: "plan-1",
          cardId: "card-1",
          title: "Proof",
          goal: "Persist proof",
          status: "in_progress",
          acceptanceCriteria: ["Saved"],
          nonGoals: [],
          constraints: [],
          steps: [
            {
              id: "step-1",
              title: "Core",
              goal: "Add proof",
              status: "ready",
              acceptanceCriteria: ["Tests pass"],
              implementationProof: {
                rawOutput: "Changed files\n- src/core/foo.ts",
                filesChanged: ["src/core/foo.ts"],
                behaviorChanged: ["See raw implementation output."],
                testsRun: ["npm test"],
                testsNotRun: [],
                verificationResult: "pass",
                knownRisks: [],
                suggestedReviewFocus: ["Review scope"],
                runnerEvidence: {
                  diffStat: "1 file changed",
                  gitStatus: "M src/core/foo.ts",
                  verificationSummary: ["npm test: passed"]
                },
                createdAt: "2026-06-09T12:00:00.000Z",
                updatedAt: "2026-06-09T12:00:00.000Z"
              },
              createdAt: "2026-06-09T12:00:00.000Z",
              updatedAt: "2026-06-09T12:00:00.000Z"
            }
          ],
          currentStepId: "step-1",
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z"
        }
      ]
    });

    expect(normalized.featureSprintPlans[0]?.steps[0]?.implementationProof?.filesChanged).toEqual([
      "src/core/foo.ts"
    ]);
    expect(
      normalized.featureSprintPlans[0]?.steps[0]?.implementationProof?.runnerEvidence?.diffStat
    ).toContain("1 file changed");

    const stripped = normalizeData({
      featureSprintPlans: [
        {
          id: "plan-2",
          cardId: "card-1",
          title: "Empty proof",
          goal: "Strip",
          status: "in_progress",
          acceptanceCriteria: ["Strip"],
          nonGoals: [],
          constraints: [],
          steps: [
            {
              id: "step-1",
              title: "Core",
              goal: "Strip",
              status: "ready",
              acceptanceCriteria: ["Tests pass"],
              implementationProof: {
                rawOutput: "   ",
                filesChanged: [],
                behaviorChanged: [],
                testsRun: [],
                testsNotRun: [],
                verificationResult: "not_valid" as never,
                knownRisks: [],
                suggestedReviewFocus: [],
                createdAt: "2026-06-09T12:00:00.000Z",
                updatedAt: "2026-06-09T12:00:00.000Z"
              },
              createdAt: "2026-06-09T12:00:00.000Z",
              updatedAt: "2026-06-09T12:00:00.000Z"
            }
          ],
          currentStepId: "step-1",
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z"
        }
      ]
    });

    expect(stripped.featureSprintPlans[0]?.steps[0]?.implementationProof).toBeUndefined();
  });
});

describe("mergeSeedDefaults", () => {
  it("preserves user-edited job source fields", () => {
    const state = createSeedState();
    const editedUrl = "https://user-edited.example/jobs";
    state.jobSources = state.jobSources.map((source) =>
      source.id === "source-microsoft" ? { ...source, url: editedUrl, enabled: true } : source
    );

    const merged = mergeSeedDefaults(state).data;
    const microsoft = merged.jobSources.find((source) => source.id === "source-microsoft");
    expect(microsoft?.url).toBe(editedUrl);
    expect(microsoft?.enabled).toBe(true);
  });

  it("adds new seed resume modules without overwriting existing ones", () => {
    const state = createSeedState();
    state.resumeModules = state.resumeModules.filter((module) => module.id !== "resume-asu");

    const merged = mergeSeedDefaults(state).data;
    expect(merged.resumeModules.some((module) => module.id === "resume-asu")).toBe(true);
    expect(merged.resumeModules.length).toBe(seedResumeModules.length);
  });

  it("adds new seed job sources without overwriting user-added sources", () => {
    const state = createSeedState();
    state.jobSources = [
      {
        id: "source-user-custom",
        name: "Custom",
        url: "https://custom.example",
        kind: "manual",
        enabled: true,
        cadence: "manual"
      }
    ];

    const merged = mergeSeedDefaults(state).data;
    expect(merged.jobSources.some((source) => source.id === "source-user-custom")).toBe(true);
    expect(merged.jobSources.some((source) => source.id === "source-fixture-greenhouse")).toBe(true);
    expect(merged.jobSources.length).toBe(seedJobSources.length + 1);
  });

  it("tracks newly merged starter source ids for announcement", () => {
    const state = createSeedState();
    state.jobSources = state.jobSources.filter(
      (source) => source.id !== "source-qualcomm-workday-cxs" && source.id !== "source-viasat-icims"
    );
    const { addedStarterSourceIds } = mergeSeedDefaults(state);
    expect(addedStarterSourceIds).toContain("source-qualcomm-workday-cxs");
    expect(addedStarterSourceIds).toContain("source-viasat-icims");
  });
});

describe("hydrateState", () => {
  it("syncs drifted applicationStatus to card.state", () => {
    const card = createCareerApplicationCard({
      company: "Acme",
      roleTitle: "Engineer",
      jobDescription: "Build things",
      roleType: "software",
      applicationStatus: "inbox"
    });
    card.state = "waiting";
    card.careerApplication!.applicationStatus = "inbox";

    const hydrated = hydrateState(
      {
        ...createSeedState(),
        cards: [card]
      },
      new Date("2026-06-09T12:00:00.000Z")
    );

    expect(hydrated.cards[0].state).toBe("waiting");
    expect(hydrated.cards[0].careerApplication?.applicationStatus).toBe("waiting");
  });

  it("resets interrupted running job sources to error", () => {
    const state = createSeedState();
    state.jobSources = state.jobSources.map((source) =>
      source.id === "source-fixture-greenhouse"
        ? { ...source, runStatus: "running", lastRunMessage: "Running..." }
        : source
    );

    const hydrated = hydrateState(state, new Date("2026-06-09T12:00:00.000Z"));
    const fixture = hydrated.jobSources.find((source) => source.id === "source-fixture-greenhouse");
    expect(fixture?.runStatus).toBe("error");
    expect(fixture?.lastRunMessage).toBe(RUN_INTERRUPTED_MESSAGE);
  });

  it("resets daily flags on day rollover", () => {
    const state = createSeedState();
    state.dailyState = {
      ...state.dailyState,
      date: "2026-06-08",
      pounceStarted: true,
      minimumViableDayCompleted: true,
      salvageCompleted: true
    };

    const hydrated = hydrateState(state, new Date("2026-06-09T12:00:00.000Z"));
    expect(hydrated.dailyState.date).toBe("2026-06-09");
    expect(hydrated.dailyState.pounceStarted).toBe(false);
    expect(hydrated.dailyState.minimumViableDayCompleted).toBe(false);
    expect(hydrated.dailyState.salvageCompleted).toBe(false);
  });

  it("repairs one-sided candidate to card link", () => {
    const card = createCareerApplicationCard({
      company: "Acme",
      roleTitle: "Engineer",
      jobDescription: "Build things",
      roleType: "software"
    });
    const candidateId = "candidate-link-test";
    card.careerApplication!.jobCandidateId = candidateId;

    const state = createSeedState();
    state.cards = [card];
    state.jobCandidates = [
      {
        id: candidateId,
        company: "Acme",
        roleTitle: "Engineer",
        description: "Build things",
        roleType: "software",
        discoveredAt: "2026-06-09T12:00:00.000Z",
        origin: "manual",
        status: "saved",
        fitScore: 50,
        fitReasons: [],
        gaps: [],
        suggestedResumeModuleIds: [],
        nextTinyAction: "Review."
      }
    ];

    const hydrated = hydrateState(state, new Date("2026-06-09T12:00:00.000Z"));
    expect(hydrated.jobCandidates[0].applicationCardId).toBe(card.id);
  });
});

describe("preparePersistedState", () => {
  it("handles partial legacy snapshot missing jobSourceRuns", () => {
    const partial = {
      cards: createSeedState().cards,
      logs: [],
      proofItems: [],
      dailyState: createSeedState().dailyState,
      resumeModules: createSeedState().resumeModules,
      jobCandidates: [],
      jobSources: createSeedState().jobSources
    };

    const prepared = preparePersistedState(partial, new Date("2026-06-09T12:00:00.000Z"));
    expect(prepared.jobSourceRuns).toEqual([]);
  });
});
