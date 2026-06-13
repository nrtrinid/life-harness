import type { Dispatch, MutableRefObject } from "react";

import { applyRunJobSourceResult } from "../../core/actions";
import { buildFitFinderResult } from "../../core/jobScout";
import {
  RUNNER_UNREACHABLE_MESSAGE,
  RunnerUnreachableError,
  runSourceViaRunner
} from "../../core/jobScoutRunnerClient";
import type { LifeHarnessData } from "../../core/lifeHarnessData";
import {
  buildRunAllSummary,
  formatRunBatchNotice,
  getDueJobSources,
  getHealthyJobSources,
  getRunnableJobSources,
  HEALTHY_RUN_EMPTY_MESSAGE,
  type RunBatchSummary,
  type SourceRunOutcome
} from "../../core/jobSourceSchedule";
import { deriveBatchRunnerLifecycle } from "../../core/jobRunnerLifecycle";
import { buildFetchErrorRunOutput, canRunJobSource } from "../../core/jobSourceRunner";
import type { JobSource } from "../../core/types";
import type { LifeHarnessAction } from "./actions";
import { outcomeFromRun, patchSourceRunning, type BatchRunProgress } from "./jobSourceRunHelpers";

export interface JobSourceRunController {
  runOneJobSource: (
    sourceId: string
  ) => Promise<{ ok: boolean; message?: string; outcome?: SourceRunOutcome; runnerUnreachable?: boolean }>;
  runDueJobSources: () => Promise<{ ok: boolean; message: string; summary: RunBatchSummary }>;
  runHealthyJobSources: () => Promise<{ ok: boolean; message: string; summary: RunBatchSummary }>;
  runAllEnabledJobSources: () => Promise<{ ok: boolean; message: string; summary: RunBatchSummary }>;
  runFitFinder: () => Promise<ReturnType<typeof buildFitFinderResult>>;
}

export function createJobSourceRunActions(
  stateRef: MutableRefObject<LifeHarnessData>,
  dispatch: Dispatch<LifeHarnessAction>,
  setIsBatchRunning: (value: boolean) => void,
  setBatchRunProgress: (value: BatchRunProgress | null) => void
): JobSourceRunController {
  const runSourceOnState = async (
    current: LifeHarnessData,
    source: JobSource
  ): Promise<{
    state: LifeHarnessData;
    outcome: SourceRunOutcome;
    runnerUnreachable: boolean;
  }> => {
    let next = patchSourceRunning(current, source.id);
    dispatch({ type: "state_replaced", state: next });

    try {
      const output = await runSourceViaRunner({
        source,
        existingCandidates: next.jobCandidates,
        resumeModules: next.resumeModules
      });
      const result = applyRunJobSourceResult(next, output);
      next = result.state;
      dispatch({ type: "state_replaced", state: next });
      return {
        state: next,
        outcome: outcomeFromRun(source, result),
        runnerUnreachable: false
      };
    } catch (error) {
      const message =
        error instanceof RunnerUnreachableError
          ? RUNNER_UNREACHABLE_MESSAGE
          : "Local Job Scout Runner request failed.";
      const result = applyRunJobSourceResult(next, buildFetchErrorRunOutput(source, message));
      next = result.state;
      dispatch({ type: "state_replaced", state: next });
      return {
        state: next,
        outcome: {
          ...outcomeFromRun(source, result),
          runnerUnreachable: error instanceof RunnerUnreachableError
        },
        runnerUnreachable: error instanceof RunnerUnreachableError
      };
    }
  };

  const runSourceBatch = async (targets: JobSource[]): Promise<RunBatchSummary> => {
    const outcomes: SourceRunOutcome[] = [];
    setIsBatchRunning(true);

    try {
      for (let index = 0; index < targets.length; index += 1) {
        const source = targets[index];
        setBatchRunProgress({
          current: index + 1,
          total: targets.length,
          sourceName: source.name
        });

        const { outcome, runnerUnreachable } = await runSourceOnState(stateRef.current, source);
        outcomes.push(outcome);

        if (runnerUnreachable) {
          break;
        }
      }
    } finally {
      setBatchRunProgress(null);
      setIsBatchRunning(false);
    }

    return buildRunAllSummary(outcomes);
  };

  return {
    runOneJobSource: async (sourceId: string) => {
      const current = stateRef.current;
      const source = current.jobSources.find((item) => item.id === sourceId);
      if (!source) {
        return { ok: false, message: "Source not found." };
      }

      const guard = canRunJobSource(source);
      if (!guard.ok) {
        return { ok: false, message: guard.reason ?? "Cannot run source." };
      }

      const { outcome, runnerUnreachable } = await runSourceOnState(current, source);
      return {
        ok: outcome.ok,
        message: outcome.message,
        outcome,
        runnerUnreachable
      };
    },

    runDueJobSources: async () => {
      const current = stateRef.current;
      const batchLifecycle = deriveBatchRunnerLifecycle(
        current.jobSources,
        current.jobSourceRuns,
        current.jobCandidates,
        new Date()
      );
      const targets = getDueJobSources(current.jobSources, new Date());
      if (targets.length === 0) {
        return {
          ok: true,
          message: batchLifecycle.dueRunEmptyMessage,
          summary: buildRunAllSummary([])
        };
      }

      const summary = await runSourceBatch(targets);
      return {
        ok: summary.failedSources === 0 && !summary.runnerUnreachable,
        message: formatRunBatchNotice(summary),
        summary
      };
    },

    runHealthyJobSources: async () => {
      const current = stateRef.current;
      const packMode = current.jobSourcePackMode ?? "core";
      const targets = getHealthyJobSources(
        current.jobSources,
        current.jobSourceRuns,
        current.jobCandidates,
        new Date(),
        { packMode }
      );
      if (targets.length === 0) {
        return {
          ok: true,
          message: HEALTHY_RUN_EMPTY_MESSAGE,
          summary: buildRunAllSummary([])
        };
      }

      const summary = await runSourceBatch(targets);
      return {
        ok: summary.failedSources === 0 && !summary.runnerUnreachable,
        message: formatRunBatchNotice(summary),
        summary
      };
    },

    runAllEnabledJobSources: async () => {
      const current = stateRef.current;
      const batchLifecycle = deriveBatchRunnerLifecycle(
        current.jobSources,
        current.jobSourceRuns,
        current.jobCandidates,
        new Date()
      );
      const targets = getRunnableJobSources(current.jobSources);
      if (targets.length === 0) {
        return {
          ok: true,
          message: batchLifecycle.enabledRunEmptyMessage,
          summary: buildRunAllSummary([])
        };
      }

      const summary = await runSourceBatch(targets);
      return {
        ok: summary.failedSources === 0 && !summary.runnerUnreachable,
        message: formatRunBatchNotice(summary),
        summary
      };
    },

    runFitFinder: async () => {
      const current = stateRef.current;
      const packMode = current.jobSourcePackMode ?? "core";
      const targets = getHealthyJobSources(
        current.jobSources,
        current.jobSourceRuns,
        current.jobCandidates,
        new Date(),
        { packMode }
      );
      if (targets.length === 0) {
        return buildFitFinderResult({
          ok: false,
          createdCandidates: [],
          skippedDuplicates: 0,
          noSourcesMessage: "Add a source first, or paste a job post to score it."
        });
      }

      const beforeIds = new Set(stateRef.current.jobCandidates.map((c) => c.id));
      const summary = await runSourceBatch(targets);

      if (summary.runnerUnreachable) {
        return buildFitFinderResult({
          ok: false,
          runnerUnreachable: true,
          createdCandidates: [],
          skippedDuplicates: summary.skippedDuplicates,
          errors: summary.errors,
          runnerMessage: RUNNER_UNREACHABLE_MESSAGE
        });
      }

      const afterCandidates = stateRef.current.jobCandidates;
      const createdCandidates = afterCandidates.filter((c) => !beforeIds.has(c.id));

      return buildFitFinderResult({
        ok: summary.failedSources === 0,
        createdCandidates,
        skippedDuplicates: summary.skippedDuplicates,
        errors: summary.errors
      });
    }
  };
}
