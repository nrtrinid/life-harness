import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import {
  FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS,
  FEATURE_SPRINT_REVIEW_PACKET_MAX_FILES,
  FEATURE_SPRINT_REVIEW_PACKET_RAW_EXCERPT_MAX,
  buildImplementationProofFromSources,
  buildRunnerEvidenceSnapshot,
  capRawOutputExcerptForReviewPacket,
  capStringListForReviewPacket,
  normalizeImplementationProofRecord,
  parseManualImplementationOutputSections,
  resolveLatestImplementationRunForStep,
  summarizeVerificationProofResult
} from "./featureSprintImplementationProof";
import { parseFeatureSprintWorkerOutputEvidence } from "./featureSprintWorkerOutput";
import { normalizeFeatureSprintPlan } from "./stateHydration";
import type { LifeHarnessData } from "./lifeHarnessData";
import type { FeatureSprintVerificationResult } from "./featureSprintRunner";
import type { HarnessFeatureSprintRunnerRun, HarnessFeatureSprintStep } from "./types";

const FIXED_NOW = "2026-06-09T12:00:00.000Z";
const PLAN_ID = "plan-1";
const STEP_ID = "step-1";

function verificationResult(
  input: Pick<FeatureSprintVerificationResult, "command" | "status"> &
    Partial<FeatureSprintVerificationResult>
): FeatureSprintVerificationResult {
  return {
    startedAt: FIXED_NOW,
    completedAt: FIXED_NOW,
    ...input
  };
}

function fixtureStep(overrides: Partial<HarnessFeatureSprintStep> = {}): HarnessFeatureSprintStep {
  return {
    id: STEP_ID,
    title: "Core",
    goal: "Add proof normalizer",
    status: "ready",
    acceptanceCriteria: ["Tests pass"],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides
  };
}

function fixtureRun(
  overrides: Partial<HarnessFeatureSprintRunnerRun> = {}
): HarnessFeatureSprintRunnerRun {
  return {
    id: "run-impl-1",
    profile: "codex_implementation",
    status: "succeeded",
    planId: PLAN_ID,
    stepId: STEP_ID,
    changedFiles: ["src/core/featureSprintImplementationProof.ts"],
    diffStat: "1 file changed, 50 insertions(+)",
    gitStatus: "M src/core/featureSprintImplementationProof.ts",
    verificationResults: [
      verificationResult({ command: "npm test -- featureSprint", status: "passed" }),
      verificationResult({ command: "npm run typecheck", status: "skipped" })
    ],
    startedAt: FIXED_NOW,
    completedAt: FIXED_NOW,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides
  };
}

function baseData(runs: HarnessFeatureSprintRunnerRun[] = []): LifeHarnessData {
  return {
    ...createSeedState(FIXED_NOW),
    featureSprintRunnerRuns: runs
  };
}

describe("featureSprintImplementationProof", () => {
  describe("parseManualImplementationOutputSections", () => {
    it("extracts changed-files bullets and verification command lines only", () => {
      const raw = `
Changed files
- src/core/foo.ts
- src/core/bar.ts

## Verification
- command: npm test -- foo
- status: passed
- command: npm run typecheck

Worktree: /tmp/wt
Diff stat: 2 files changed
`;
      const parsed = parseManualImplementationOutputSections(raw);
      expect(parsed.filesChanged).toEqual(["src/core/foo.ts", "src/core/bar.ts"]);
      expect(parsed.testsRun).toEqual(["npm test -- foo", "npm run typecheck"]);
      expect(parsed.parseIncomplete).toBe(false);
    });

    it("marks parseIncomplete when no structured sections found", () => {
      const parsed = parseManualImplementationOutputSections("Just a free-form summary.");
      expect(parsed.filesChanged).toEqual([]);
      expect(parsed.testsRun).toEqual([]);
      expect(parsed.parseIncomplete).toBe(true);
    });
  });

  describe("resolveLatestImplementationRunForStep", () => {
    it("returns latest matching implementation run including failed", () => {
      const data = baseData([
        fixtureRun({ id: "run-old", startedAt: "2026-06-08T12:00:00.000Z" }),
        fixtureRun({
          id: "run-failed",
          status: "failed",
          error: "Verification failed",
          startedAt: "2026-06-09T13:00:00.000Z"
        })
      ]);

      const run = resolveLatestImplementationRunForStep(data, PLAN_ID, STEP_ID);
      expect(run?.id).toBe("run-failed");
      expect(run?.status).toBe("failed");
    });

    it("ignores runs for other steps or non-implementation profiles", () => {
      const data = baseData([
        fixtureRun({ stepId: "other-step", startedAt: "2026-06-09T14:00:00.000Z" }),
        fixtureRun({
          id: "run-review",
          profile: "codex_review",
          startedAt: "2026-06-09T15:00:00.000Z"
        })
      ]);

      expect(resolveLatestImplementationRunForStep(data, PLAN_ID, STEP_ID)).toBeUndefined();
    });
  });

  describe("summarizeVerificationProofResult", () => {
    it("maps runner verification results to proof result", () => {
      expect(
        summarizeVerificationProofResult(
          fixtureRun({
            verificationResults: [verificationResult({ command: "npm test", status: "passed" })]
          })
        )
      ).toBe("pass");

      expect(
        summarizeVerificationProofResult(
          fixtureRun({
            verificationResults: [
              verificationResult({ command: "npm test", status: "passed" }),
              verificationResult({ command: "npm run lint", status: "skipped" })
            ]
          })
        )
      ).toBe("partial");

      expect(
        summarizeVerificationProofResult(
          fixtureRun({
            status: "failed",
            verificationResults: [
              verificationResult({ command: "npm test", status: "failed", error: "boom" })
            ]
          })
        )
      ).toBe("fail");

      expect(summarizeVerificationProofResult(undefined)).toBe("not_run");
    });
  });

  describe("buildRunnerEvidenceSnapshot", () => {
    it("captures capped diff, git status, and verification summary", () => {
      const snapshot = buildRunnerEvidenceSnapshot(fixtureRun());
      expect(snapshot?.diffStat).toContain("1 file changed");
      expect(snapshot?.gitStatus).toContain("featureSprintImplementationProof.ts");
      expect(snapshot?.verificationSummary?.[0]).toContain("npm test -- featureSprint: passed");
    });

    it("preserves map correlation through normalize and plan hydration", () => {
      const snapshot = buildRunnerEvidenceSnapshot(
        fixtureRun({
          sprintId: "sprint-1",
          storyId: "story-1",
          taskId: "task-1",
          mapPhase: "implement"
        })
      );
      expect(snapshot).toMatchObject({
        sprintId: "sprint-1",
        storyId: "story-1",
        taskId: "task-1",
        mapPhase: "implement"
      });

      const proof = buildImplementationProofFromSources({
        rawOutput: "Changed files\n- src/core/featureSprintImplementationProof.ts",
        step: fixtureStep(),
        projectVerificationCommands: ["npm test -- featureSprint"],
        matchingRun: fixtureRun({
          sprintId: "sprint-1",
          storyId: "story-1",
          taskId: "task-1",
          mapPhase: "implement"
        }),
        timestamp: FIXED_NOW
      });
      expect(proof.runnerEvidence?.sprintId).toBe("sprint-1");
      expect(proof.runnerEvidence?.mapPhase).toBe("implement");

      const normalized = normalizeImplementationProofRecord(proof);
      expect(normalized?.runnerEvidence).toMatchObject({
        sprintId: "sprint-1",
        storyId: "story-1",
        taskId: "task-1",
        mapPhase: "implement"
      });

      const plan = normalizeFeatureSprintPlan({
        id: PLAN_ID,
        cardId: "card-1",
        title: "Proof plan",
        goal: "Keep map correlation",
        status: "in_progress",
        acceptanceCriteria: ["ok"],
        nonGoals: [],
        constraints: [],
        steps: [
          {
            ...fixtureStep(),
            implementationProof: normalized
          }
        ],
        currentStepId: STEP_ID,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW
      });
      expect(plan.steps[0]?.implementationProof?.runnerEvidence).toMatchObject({
        sprintId: "sprint-1",
        storyId: "story-1",
        taskId: "task-1",
        mapPhase: "implement"
      });
    });

    it("still normalizes legacy runnerEvidence without map fields", () => {
      const proof = buildImplementationProofFromSources({
        rawOutput: "Changed files\n- src/manual.ts",
        step: fixtureStep(),
        projectVerificationCommands: [],
        matchingRun: fixtureRun({
          sprintId: undefined,
          storyId: undefined,
          taskId: undefined,
          mapPhase: undefined
        }),
        timestamp: FIXED_NOW
      });
      const normalized = normalizeImplementationProofRecord(proof);
      expect(normalized?.runnerEvidence?.diffStat).toBeTruthy();
      expect(normalized?.runnerEvidence?.sprintId).toBeUndefined();
      expect(normalized?.runnerEvidence?.mapPhase).toBeUndefined();
    });
  });

  describe("buildImplementationProofFromSources", () => {
    it("prefers runner metadata and stores runnerEvidence snapshot", () => {
      const proof = buildImplementationProofFromSources({
        rawOutput: "Changed files\n- manual-only.ts",
        step: fixtureStep(),
        projectVerificationCommands: ["npm run typecheck", "npm test -- featureSprint"],
        matchingRun: fixtureRun(),
        timestamp: FIXED_NOW
      });

      expect(proof.filesChanged).toEqual(["src/core/featureSprintImplementationProof.ts"]);
      expect(proof.testsRun).toEqual(["npm test -- featureSprint"]);
      expect(proof.verificationResult).toBe("partial");
      expect(proof.behaviorChanged).toEqual(["See raw implementation output."]);
      expect(proof.sourceRunnerRunId).toBe("run-impl-1");
      expect(proof.runnerEvidence?.diffStat).toBeTruthy();
    });

    it("includes failed-run risk and uses manual parse fallback", () => {
      const proof = buildImplementationProofFromSources({
        rawOutput: `
Changed files
- src/manual.ts

## Verification
- command: npm test -- manual
`,
        step: fixtureStep(),
        projectVerificationCommands: ["npm run typecheck"],
        matchingRun: fixtureRun({
          status: "failed",
          error: "Exit 1",
          changedFiles: [],
          verificationResults: []
        }),
        timestamp: FIXED_NOW
      });

      expect(proof.filesChanged).toEqual(["src/manual.ts"]);
      expect(proof.testsRun).toEqual(["npm test -- manual"]);
      expect(proof.verificationResult).toBe("fail");
      expect(proof.knownRisks.some((risk) => risk.includes("failed"))).toBe(true);
    });

    it("notes missing runner run and incomplete parse", () => {
      const proof = buildImplementationProofFromSources({
        rawOutput: "Unstructured output only.",
        step: fixtureStep(),
        projectVerificationCommands: ["npm run typecheck"],
        timestamp: FIXED_NOW
      });

      expect(proof.knownRisks).toContain("No matching implementation runner run for this step.");
      expect(proof.knownRisks).toContain("Manual output parsing may be incomplete.");
      expect(proof.knownRisks).toContain("Verification was not run or not captured.");
    });

    it("uses worker output evidence when runner metadata is missing", () => {
      const workerOutputEvidence = parseFeatureSprintWorkerOutputEvidence(
        `Files changed:\n- src/from-worker.ts\n\nTests:\n- npm test`,
        { now: new Date(FIXED_NOW), source: "manual" }
      );
      const proof = buildImplementationProofFromSources({
        rawOutput: workerOutputEvidence.rawOutput,
        step: fixtureStep(),
        projectVerificationCommands: ["npm run typecheck"],
        timestamp: FIXED_NOW,
        workerOutputEvidence
      });

      expect(proof.filesChanged).toEqual(["src/from-worker.ts"]);
      expect(proof.testsRun).toEqual(["npm test"]);
      expect(proof.workerOutputEvidence?.source).toBe("manual");
    });
  });

  describe("review packet caps", () => {
    it("caps file lists and raw output excerpts", () => {
      const files = Array.from({ length: 25 }, (_, index) => `file-${index}.ts`);
      const capped = capStringListForReviewPacket(files, FEATURE_SPRINT_REVIEW_PACKET_MAX_FILES);
      expect(capped.truncated).toBe(true);
      expect(capped.lines).toHaveLength(FEATURE_SPRINT_REVIEW_PACKET_MAX_FILES + 1);
      expect(capped.lines.at(-1)).toContain("more");

      const bullets = Array.from({ length: 20 }, (_, index) => `bullet-${index}`);
      const cappedBullets = capStringListForReviewPacket(
        bullets,
        FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS
      );
      expect(cappedBullets.truncated).toBe(true);

      const longRaw = "x".repeat(FEATURE_SPRINT_REVIEW_PACKET_RAW_EXCERPT_MAX + 500);
      const excerpt = capRawOutputExcerptForReviewPacket(longRaw);
      expect(excerpt.length).toBeLessThan(longRaw.length);
      expect(excerpt).toContain("[raw output truncated for review packet]");
    });
  });
});
