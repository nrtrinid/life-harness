import { applyRunJobSourceResult } from "../../core/actions";
import type { LifeHarnessData } from "../../core/lifeHarnessData";
import type { SourceRunOutcome } from "../../core/jobSourceSchedule";
import type { JobSource } from "../../core/types";

export interface BatchRunProgress {
  current: number;
  total: number;
  sourceName: string;
}

export function patchSourceRunning(state: LifeHarnessData, sourceId: string): LifeHarnessData {
  return {
    ...state,
    jobSources: state.jobSources.map((source) =>
      source.id === sourceId
        ? { ...source, runStatus: "running" as const, lastRunMessage: "Running..." }
        : source
    )
  };
}

export function outcomeFromRun(
  source: JobSource,
  result: ReturnType<typeof applyRunJobSourceResult>
): SourceRunOutcome {
  const run = result.state.jobSourceRuns[0];
  const createdCandidates = run?.createdCandidateIds.length ?? 0;
  const errors = run?.errors ?? [];
  const weakPass = result.ok && createdCandidates === 0 && errors.length === 0;
  return {
    sourceId: source.id,
    sourceName: source.name,
    ok: result.ok,
    weakPass,
    createdCandidates,
    skippedDuplicates: run?.skippedDuplicates ?? 0,
    errors,
    message: result.message ?? run?.message ?? "Source run recorded."
  };
}
