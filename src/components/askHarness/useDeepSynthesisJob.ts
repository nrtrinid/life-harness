import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChatThreadItem, ContextExportMode } from "./types";
import {
  buildAskDeepSynthesisRequest,
  buildAskThreadFingerprint,
  isAskThreadEligibleForSynthesis
} from "../../core/askHarnessSynthesis";
import {
  runAskDeepSynthesisJob,
  type DeepSynthesisJobState
} from "../../core/askDeepSynthesisJob";
import type { ReasoningDepth } from "../../core/chatHarnessClient";
import type { ChatHarnessMode, HarnessExportInput } from "../../core/harnessContext";
import type { SensitivityLevel } from "../../core/types";

export type UseDeepSynthesisJobArgs = {
  baseUrl: string;
  thread: ChatThreadItem[];
  threadState: Parameters<typeof buildAskThreadFingerprint>[1];
  exportInput: HarnessExportInput;
  contextMode: ContextExportMode;
  sensitivity: SensitivityLevel;
  mode: ChatHarnessMode;
  maxPromptChars: number;
  reasoningDepth?: ReasoningDepth;
};

export function useDeepSynthesisJob(args: UseDeepSynthesisJobArgs) {
  const [jobState, setJobState] = useState<DeepSynthesisJobState>({ status: "idle" });
  const generationRef = useRef(0);
  const threadRef = useRef(args.thread);
  const threadStateRef = useRef(args.threadState);

  threadRef.current = args.thread;
  threadStateRef.current = args.threadState;

  const eligible = useMemo(
    () => isAskThreadEligibleForSynthesis(args.thread, args.threadState, args.sensitivity),
    [args.thread, args.threadState, args.sensitivity]
  );

  const synthesisBusy = jobState.status === "starting" || jobState.status === "polling";

  const dismissSynthesis = useCallback(() => {
    generationRef.current += 1;
    setJobState({ status: "idle" });
  }, []);

  const startSynthesis = useCallback(async () => {
    if (!eligible || synthesisBusy || args.sensitivity === "S3") {
      return;
    }

    generationRef.current += 1;
    const generation = generationRef.current;
    const isCancelled = () => generationRef.current !== generation;
    const requestFingerprint = buildAskThreadFingerprint(
      threadRef.current,
      threadStateRef.current
    );
    const request = buildAskDeepSynthesisRequest({
      thread: threadRef.current,
      threadState: threadStateRef.current,
      exportInput: args.exportInput,
      contextMode: args.contextMode,
      sensitivity: args.sensitivity,
      mode: args.mode,
      maxPromptChars: args.maxPromptChars,
      reasoningDepth: args.reasoningDepth,
      pipelineProfile: "with_critic"
    });

    await runAskDeepSynthesisJob({
      baseUrl: args.baseUrl,
      request,
      requestFingerprint,
      getCurrentFingerprint: () =>
        buildAskThreadFingerprint(threadRef.current, threadStateRef.current),
      isCancelled,
      onStateChange: (next) => {
        if (!isCancelled()) {
          setJobState(next);
        }
      }
    });
  }, [
    args.baseUrl,
    args.contextMode,
    args.exportInput,
    args.maxPromptChars,
    args.mode,
    args.reasoningDepth,
    args.sensitivity,
    eligible,
    synthesisBusy
  ]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
    };
  }, []);

  return {
    jobState,
    eligible,
    synthesisBusy,
    startSynthesis,
    dismissSynthesis,
    retrySynthesis: startSynthesis
  };
}
