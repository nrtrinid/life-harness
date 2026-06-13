import type { Dispatch, MutableRefObject } from "react";

import {
  applyAddJobSource,
  applyApproveJobCandidate,
  applyAddDefaultResumeModulesToPacket,
  applyBackfillResumeDraftPacket,
  applyPatchResumeModule,
  applySetResumeDraftPacketModuleForSection,
  applyToggleResumeDraftPacketModule,
  type ResumeModulePatch,
  applyCareerIntake,
  applyClearCareerSourcePack,
  applyDismissJobCandidate,
  applyImportCareerSourcePack,
  applyJobCandidateIntake,
  applyResumeExportedForCard,
  applyRunJobSourceResult,
  applySaveJobCandidate,
  applySaveJobSourceWithOptionalImport,
  applyUpdateJobSource,
  type JobSourceInput,
  type JobSourcePatch
} from "../../core/actions";
import type { CareerIntakeInput } from "../../core/career";
import type { LifeHarnessData } from "../../core/lifeHarnessData";
import type { JobCandidateIntakeInput } from "../../core/jobScout";
import type { JobSourceRunOutput } from "../../core/jobSourceRunner";
import type { JobSource, ResumeModuleSection } from "../../core/types";
import type { LifeHarnessAction } from "./actions";

export function createCareerProviderActions(
  state: LifeHarnessData,
  stateRef: MutableRefObject<LifeHarnessData>,
  dispatch: Dispatch<LifeHarnessAction>
) {
  return {
    submitCareerIntake: (input: CareerIntakeInput) => {
      const result = applyCareerIntake(state, input);
      if (result.ok) {
        dispatch({ type: "career_intake_applied", state: result.state });
        return { ok: true, message: result.message, cardId: result.cardId };
      }
      return { ok: false, message: result.message };
    },

    submitJobCandidateIntake: (input: JobCandidateIntakeInput) => {
      const result = applyJobCandidateIntake(state, input);
      if (result.ok) {
        dispatch({ type: "job_candidate_intake_applied", state: result.state });
        return { ok: true, message: result.message, candidateId: result.candidateId };
      }
      return { ok: false, message: result.message };
    },

    saveJobCandidate: (candidateId: string) => {
      const result = applySaveJobCandidate(state, candidateId);
      if (result.ok) {
        dispatch({ type: "job_candidate_updated", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    dismissJobCandidate: (candidateId: string) => {
      const result = applyDismissJobCandidate(state, candidateId);
      if (result.ok) {
        dispatch({ type: "job_candidate_updated", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    approveJobCandidate: (candidateId: string) => {
      const result = applyApproveJobCandidate(state, candidateId);
      if (result.ok) {
        dispatch({ type: "job_candidate_updated", state: result.state });
        return {
          ok: true,
          message: result.message,
          cardId: result.cardId,
          candidateId: result.candidateId
        };
      }
      return { ok: false, message: result.message };
    },

    backfillResumeDraftPacket: (cardId: string) => {
      const result = applyBackfillResumeDraftPacket(state, cardId);
      if (result.ok) {
        dispatch({ type: "career_intake_applied", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    toggleResumeDraftPacketModule: (cardId: string, moduleId: string) => {
      const result = applyToggleResumeDraftPacketModule(state, cardId, moduleId);
      if (result.ok) {
        dispatch({ type: "career_intake_applied", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    setResumeDraftPacketModuleForSection: (
      cardId: string,
      section: ResumeModuleSection,
      moduleId: string
    ) => {
      const result = applySetResumeDraftPacketModuleForSection(state, cardId, section, moduleId);
      if (result.ok) {
        dispatch({ type: "career_intake_applied", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    addDefaultResumeModulesToPacket: (cardId: string) => {
      const result = applyAddDefaultResumeModulesToPacket(state, cardId);
      if (result.ok) {
        dispatch({ type: "career_intake_applied", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    patchResumeModule: (moduleId: string, patch: ResumeModulePatch) => {
      const result = applyPatchResumeModule(state, moduleId, patch);
      if (result.ok) {
        dispatch({ type: "state_replaced", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    importCareerSourcePack: (json: string) => {
      const result = applyImportCareerSourcePack(state, json);
      if (result.ok) {
        dispatch({ type: "state_replaced", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    clearCareerSourcePack: () => {
      const result = applyClearCareerSourcePack(state);
      if (result.ok) {
        dispatch({ type: "state_replaced", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    addJobSource: (input: JobSourceInput) => {
      const result = applyAddJobSource(state, input);
      if (result.ok) {
        dispatch({ type: "job_source_updated", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    saveJobSourceFromSetup: (
      input: JobSourceInput,
      previewOutput?: JobSourceRunOutput,
      importPreview?: boolean
    ) => {
      const result =
        importPreview && previewOutput
          ? applySaveJobSourceWithOptionalImport(state, input, previewOutput)
          : applyAddJobSource(state, input);
      if (result.ok) {
        dispatch({ type: "job_source_updated", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    updateJobSource: (sourceId: string, patch: JobSourcePatch) => {
      const result = applyUpdateJobSource(state, sourceId, patch);
      if (result.ok) {
        dispatch({ type: "job_source_updated", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    },

    recordJobSourceRun: (source: JobSource, output: JobSourceRunOutput) => {
      const result = applyRunJobSourceResult(state, output);
      dispatch({ type: "job_source_updated", state: result.state });
      return { ok: result.ok, message: result.message };
    },

    logResumeExportForCard: (cardId: string, options?: { filename?: string }) => {
      const result = applyResumeExportedForCard(stateRef.current, cardId, options);
      if (result.ok) {
        dispatch({ type: "state_replaced", state: result.state });
      }
      return { ok: result.ok, message: result.message };
    }
  };
}
