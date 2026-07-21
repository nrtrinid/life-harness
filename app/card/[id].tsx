import { Link, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { CareerApplicationCardDetail } from "../../src/components/career/CareerApplicationCardDetail";
import { CardStateButtons } from "../../src/components/CardStateButtons";
import { FeatureRunnerOutputDetails } from "../../src/components/featureSprint/FeatureRunnerOutputDetails";
import { FeatureSprintActionGuide } from "../../src/components/featureSprint/FeatureSprintActionGuide";
import { FeatureSprintFlowGuide } from "../../src/components/featureSprint/FeatureSprintFlowGuide";
import { FeatureSprintMapPanel } from "../../src/components/featureSprint/FeatureSprintMapPanel";
import { FeatureSprintStartFlow } from "../../src/components/featureSprint/FeatureSprintStartFlow";
import { CollapsibleSection } from "../../src/components/CollapsibleSection";
import { Notice, type NoticeState } from "../../src/components/Notice";
import { ProgressBar } from "../../src/components/ProgressBar";
import { Screen } from "../../src/components/Screen";
import { Section } from "../../src/components/Section";
import { colors, styles } from "../../src/components/styles";
import sampleProfile from "../../fixtures/resume/profile.sample.json";
import { canCopyTextToClipboard, copyTextToClipboard } from "../../src/core/askHarnessSynthesis";
import { buildApplicationResumeDocxDraft } from "../../src/core/applicationResumeExport";
import {
  buildAgentSessionCreateInputFromTaskPacket,
  buildAgentTaskPacket,
  buildDefaultAgentTaskPacketInput,
  resolveDefaultTaskGoal
} from "../../src/core/agentTaskPacket";
import {
  getAgentSessionsForCard,
  normalizeAgentKind,
  type HarnessAgentSessionCreateInput
} from "../../src/core/agentSessionLog";
import {
  buildFeatureScopingPacket,
  buildFeatureReviewVerdictFenceDraft,
  buildFeatureStepImplementationPacket,
  buildFeatureStepLocalizationPacket,
  buildFeatureStepPromptAuditPacket,
  buildFeatureStepReviewPacket,
  canRunFeatureSprintImplementation,
  canRunFeatureSprintPhaseAction,
  describeFeatureSprintPhaseLaunchBlock,
  canAdoptNextSliceProposal,
  doesFeatureSprintStepRequireSpecUpdate,
  getActiveFeatureSprintPlanForCard,
  hasApprovedSpecUpdateForStep,
  hasPersistedFeatureSpec,
  hasStepPromptAudit,
  hasStepImplementationProof,
  hasStepPromptLocalization,
  isFeatureSpecApproved,
  resolveAutomationPhaseDisplay,
  resolveStepImplementationPrompt,
  resolveStepImplementationPromptSource
} from "../../src/core/featureSprintOrchestrator";
import {
  buildFeatureSprintRunnerExecutionContext,
  historyAttributionFromExecutionContext,
  seedSprintMapFromLegacySteps
} from "../../src/core/featureSprintMap";
import { parseFeatureSprintWorkerOutputEvidence } from "../../src/core/featureSprintWorkerOutput";
import { buildFeatureSprintActionGuide } from "../../src/core/featureSprintActionGuide";
import {
  buildFeatureSprintDogfoodSummary,
  type FeatureSprintDogfoodCheckStatus
} from "../../src/core/featureSprintDogfood";
import {
  buildRunnerProfile,
  formatRunnerProfileLabel,
  formatRunnerResultUsabilityLabel,
  isImplementationProfile,
  isPromptAuditProfile,
  isReviewProfile,
  isScopingProfile,
  runnerAgentLabel,
  type FeatureSprintRunnerAgent,
  type FeatureSprintRunnerExecutionContext
} from "../../src/core/featureSprintRunner";
import {
  applyFeatureSprintProjectDefaultRunnerAgent,
  bindFeatureSprintRunnerAgentForCard,
  clearFeatureSprintProjectRunnerAgentDefault
} from "../../src/core/featureSprintRunnerAgentSession";
import { getFeatureSprintRunnerRunsForCard } from "../../src/core/featureSprintRunnerHistory";
import { buildFeatureSprintRunnerOutputView } from "../../src/core/featureSprintRunnerOutputView";
import {
  checkFeatureSprintRunnerHealth,
  cleanupFeatureSprintWorktree,
  composeImplementationRunnerOutputSummary,
  guardRunnerAgentAvailability,
  resolveFeatureSprintRunnerToken,
  runFeatureSprintPacket,
  summarizeVerificationResults,
  type FeatureSprintRunnerHealthProbe
} from "../../src/core/featureSprintRunnerClient";
import {
  promptAuditFenceReadinessNotice,
  reviewFenceReadinessNotice,
  scopingFenceReadinessNotice
} from "../../src/core/featureSprintRunnerOutputFence";
import { buildCardContextPacket } from "../../src/core/harnessContextGraph";
import {
  formatListField,
  getProjectForCard,
  parseListField
} from "../../src/core/projectRegistry";
import { AREA_LABELS, WARMTH_LABELS } from "../../src/core/labels";
import { buildNextMoveSummary } from "../../src/core/nextMoveContract";
import { computeCardProgress } from "../../src/core/progress";
import { packResumeDocxBlob, type ResumeProfile } from "../../src/core/resumeDocx";
import { buildApplicationResumeReadiness } from "../../src/core/resumeReadiness";
import { computeCardWarmth } from "../../src/core/warmth";
import { useLifeHarness } from "../../src/state/LifeHarnessState";
import type { ResumeModulePatch } from "../../src/core/actions";
import type {
  HarnessAgentSession,
  HarnessFeatureSpecSource,
  HarnessFeatureSprintExecutionTarget,
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintRunnerRun,
  HarnessFeatureSprintWorkerOutputEvidence,
  HarnessProject,
  LifeCard,
  ResumeModuleSection
} from "../../src/core/types";

const RESUME_MODULE_SECTIONS = new Set<ResumeModuleSection>([
  "education",
  "skills",
  "projects",
  "additional_experience"
]);

function parseFocusSection(value: string | string[] | undefined): ResumeModuleSection | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !RESUME_MODULE_SECTIONS.has(raw as ResumeModuleSection)) {
    return null;
  }
  return raw as ResumeModuleSection;
}

type CardDetailMode = "act" | "backroom";

type SessionFormState = {
  agent: string;
  taskName: string;
  goal: string;
  resultSummary: string;
  filesChangedText: string;
  verificationCommandsText: string;
  verificationResult: string;
  commitHash: string;
  followUpsText: string;
};

function buildSessionFormFromDefaults(card: LifeCard, project?: HarnessProject): SessionFormState {
  return {
    agent: "codex",
    taskName: `Work on ${card.title}`,
    goal: resolveDefaultTaskGoal(card),
    resultSummary: "",
    filesChangedText: "",
    verificationCommandsText: formatListField(project?.verificationCommands),
    verificationResult: "",
    commitHash: "",
    followUpsText: ""
  };
}

function buildSessionFormFromSession(session: HarnessAgentSession): SessionFormState {
  return {
    agent: session.agent,
    taskName: session.taskName,
    goal: session.goal,
    resultSummary: session.resultSummary ?? "",
    filesChangedText: formatListField(session.filesChanged),
    verificationCommandsText: formatListField(session.verificationCommands),
    verificationResult: session.verificationResult ?? "",
    commitHash: session.commitHash ?? "",
    followUpsText: formatListField(session.followUps)
  };
}

const DOGFOOD_STATUS_LABELS = {
  not_ready: "not ready",
  ready: "ready",
  in_progress: "in progress",
  needs_review: "needs review",
  complete: "complete"
} as const;

function formatRunnerStartedAt(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function formatRunnerWorktreeCleanupLine(run: HarnessFeatureSprintRunnerRun): string | undefined {
  if (!run.worktreePath || !isImplementationProfile(run.profile)) {
    return undefined;
  }
  if (run.worktreeCleanedAt || run.worktreeCleanupStatus === "cleaned") {
    return "Worktree cleaned";
  }
  if (run.worktreeCleanupStatus === "blocked") {
    return "Cleanup blocked — inspect output/diff, then force clean if ready";
  }
  if (run.worktreeCleanupStatus === "failed") {
    return "Cleanup failed";
  }
  if (run.worktreeCleanupStatus === "not_found") {
    return "Worktree not found on disk";
  }
  return undefined;
}

function dogfoodCheckMarker(status: FeatureSprintDogfoodCheckStatus): string {
  if (status === "ready" || status === "done") {
    return "OK";
  }
  if (status === "warning") {
    return "!";
  }
  return "X";
}

function dogfoodCheckColor(status: FeatureSprintDogfoodCheckStatus): string {
  if (status === "ready" || status === "done") {
    return colors.accentSuccess;
  }
  if (status === "warning") {
    return colors.accentPrimary;
  }
  return colors.accentDanger;
}

function buildLaunchExecutionContext(
  plan: HarnessFeatureSprintPlan,
  phase?: NonNullable<HarnessFeatureSprintPlan["executionTarget"]>["phase"]
):
  | { ok: true; context: FeatureSprintRunnerExecutionContext }
  | { ok: false; error: string } {
  return buildFeatureSprintRunnerExecutionContext({
    plan,
    phase,
    stepId: plan.currentStepId
  });
}

function runnerFailureNotice(result: {
  error?: string;
  resultUsability?: string;
  failureClass?: string;
  terminationReason?: string;
  timedOut?: boolean;
  cancelled?: boolean;
  diagnosticMessage?: string;
}): string {
  const usability = formatRunnerResultUsabilityLabel({
    status: "failed",
    resultUsability: result.resultUsability as never,
    terminationReason: result.terminationReason as never,
    timedOut: result.timedOut,
    cancelled: result.cancelled,
    failureClass: result.failureClass as never
  });
  const detail =
    result.diagnosticMessage?.trim() ||
    result.error?.trim() ||
    "Runner run failed.";
  return usability ? `${usability}. ${detail}` : detail;
}

function buildSessionInputFromForm(
  cardId: string,
  form: SessionFormState
): HarnessAgentSessionCreateInput {
  return {
    cardId,
    agent: normalizeAgentKind(form.agent),
    taskName: form.taskName.trim(),
    goal: form.goal.trim(),
    resultSummary: form.resultSummary.trim() || undefined,
    filesChanged: parseListField(form.filesChangedText),
    verificationCommands: parseListField(form.verificationCommandsText),
    verificationResult: form.verificationResult.trim() || undefined,
    commitHash: form.commitHash.trim() || undefined,
    followUps: parseListField(form.followUpsText)
  };
}

export default function CardDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    focusSection?: string;
    patchModule?: string;
  }>();
  const { id } = params;
  const initialFocusSection = useRef(parseFocusSection(params.focusSection)).current;
  const initialPatchModuleId = useRef(
    typeof params.patchModule === "string"
      ? params.patchModule
      : Array.isArray(params.patchModule)
        ? params.patchModule[0]
        : null
  ).current;
  const {
    cards,
    logs,
    proofItems,
    dailyState,
    resumeModules,
    jobCandidates,
    jobSources,
    jobSourceRuns,
    chatSummaries,
    memoryItems,
    projects,
    agentSessions,
    featureSprintPlans,
    featureSprintRunnerRuns,
    careerSourcePack,
    saveProjectForCard,
    clearProjectForCard,
    createAgentSessionForCard,
    updateAgentSession,
    completeAgentSession,
    deleteAgentSession,
    updateFeatureSprintStep,
    updateFeatureSprintPlan,
    advanceFeatureSprintStep,
    adoptNextSliceProposalForPlan,
    completeFeatureSprintPlan,
    deleteFeatureSprintPlan,
    importFeatureSprintPlanForCard,
    saveFeatureSpecForCard,
    approveFeatureSpecForPlan,
    importFeatureReviewVerdictForPlan,
    importFeaturePromptLocalizationForPlan,
    importFeaturePromptAuditForPlan,
    importFeatureSpecUpdateForPlan,
    normalizeImplementationProofForPlan,
    createFeatureSprintRunnerRun,
    completeFeatureSprintRunnerRun,
    markMostRecentFeatureSprintRunnerRunImported,
    markReviewRunnerRunImportedForVerdict,
    markFeatureSprintRunnerRunWorktreeCleanup,
    logResumeExportForCard,
    backfillResumeDraftPacket,
    toggleResumeDraftPacketModule,
    setResumeDraftPacketModuleForSection,
    addDefaultResumeModulesToPacket,
    patchResumeModule,
    setCardState,
    setMainQuest
  } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [sessionFormOpen, setSessionFormOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionAgent, setSessionAgent] = useState("codex");
  const [sessionTaskName, setSessionTaskName] = useState("");
  const [sessionGoal, setSessionGoal] = useState("");
  const [sessionResultSummary, setSessionResultSummary] = useState("");
  const [sessionFilesChangedText, setSessionFilesChangedText] = useState("");
  const [sessionVerificationCommandsText, setSessionVerificationCommandsText] = useState("");
  const [sessionVerificationResult, setSessionVerificationResult] = useState("");
  const [sessionCommitHash, setSessionCommitHash] = useState("");
  const [sessionFollowUpsText, setSessionFollowUpsText] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [branch, setBranch] = useState("");
  const [docsText, setDocsText] = useState("");
  const [likelyFilesText, setLikelyFilesText] = useState("");
  const [verificationCommandsText, setVerificationCommandsText] = useState("");
  const [projectNotes, setProjectNotes] = useState("");
  const [isCopyLogging, setIsCopyLogging] = useState(false);
  const [planImportText, setPlanImportText] = useState("");
  const [featureSpecText, setFeatureSpecText] = useState("");
  const [featureSpecSource, setFeatureSpecSource] = useState<HarnessFeatureSpecSource>("chatgpt_web");
  const [reviewImportText, setReviewImportText] = useState("");
  const [localizationImportText, setLocalizationImportText] = useState("");
  const [promptAuditImportText, setPromptAuditImportText] = useState("");
  const [specUpdateImportText, setSpecUpdateImportText] = useState("");
  const [agentOutputText, setAgentOutputText] = useState("");
  const [workerOutputPreview, setWorkerOutputPreview] =
    useState<HarnessFeatureSprintWorkerOutputEvidence | null>(null);
  const [runnerHealth, setRunnerHealth] = useState<"unknown" | "available" | "unavailable">(
    "unknown"
  );
  const [runnerHealthProbe, setRunnerHealthProbe] = useState<
    FeatureSprintRunnerHealthProbe | undefined
  >(undefined);
  const [runnerAgent, setRunnerAgent] = useState<FeatureSprintRunnerAgent>("codex");
  const [projectDefaultRunnerAgent, setProjectDefaultRunnerAgent] =
    useState<FeatureSprintRunnerAgent>("codex");
  /** Session provider selection is sticky per card; do not reset on runner-history refreshes. */
  const runnerAgentBoundToCardIdRef = useRef<string | null>(null);
  const [isCheckingRunner, setIsCheckingRunner] = useState(false);
  const [isRunningScoping, setIsRunningScoping] = useState(false);
  const [isRunningReview, setIsRunningReview] = useState(false);
  const [isRunningPromptAudit, setIsRunningPromptAudit] = useState(false);
  const [isNormalizingProof, setIsNormalizingProof] = useState(false);
  const [isRunningImplementation, setIsRunningImplementation] = useState(false);
  const [selectedRunnerRunId, setSelectedRunnerRunId] = useState<string | null>(null);
  const [forceCleanEligibleRunId, setForceCleanEligibleRunId] = useState<string | null>(null);
  const [cleaningRunId, setCleaningRunId] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<CardDetailMode>("act");
  const card = cards.find((item) => item.id === id);

  useEffect(() => {
    if (!card) {
      return;
    }

    const project = getProjectForCard(
      {
        cards,
        logs,
        proofItems,
        dailyState,
        resumeModules,
        jobCandidates,
        jobSources,
        jobSourceRuns,
        chatSummaries,
        memoryItems,
        projects,
        agentSessions,
        featureSprintPlans,
        featureSprintRunnerRuns,
        careerSourcePack
      },
      card.id
    );

    setRepoPath(project?.repoPath ?? "");
    setBranch(project?.branch ?? "");
    setDocsText(formatListField(project?.docs));
    setLikelyFilesText(formatListField(project?.likelyFiles));
    setVerificationCommandsText(formatListField(project?.verificationCommands));
    setProjectNotes(project?.notes ?? "");
    const defaultAgent = project?.defaultRunnerAgent ?? "codex";
    setProjectDefaultRunnerAgent(defaultAgent);
    // Bind session provider once per card. Do not snap back to project default when
    // runner history / plans refresh after Cursor implement or review runs.
    const nextBinding = bindFeatureSprintRunnerAgentForCard({
      cardId: card.id,
      binding: {
        boundCardId: runnerAgentBoundToCardIdRef.current,
        // Sticky path returns this binding unchanged; rebound path uses project default.
        runnerAgent: "codex"
      },
      projectDefaultRunnerAgent: defaultAgent
    });
    if (nextBinding.boundCardId !== runnerAgentBoundToCardIdRef.current) {
      runnerAgentBoundToCardIdRef.current = nextBinding.boundCardId;
      setRunnerAgent(nextBinding.runnerAgent);
    }
  }, [
    card,
    cards,
    logs,
    proofItems,
    dailyState,
    resumeModules,
    jobCandidates,
    jobSources,
    jobSourceRuns,
    chatSummaries,
    memoryItems,
    projects,
    agentSessions,
    featureSprintPlans,
    featureSprintRunnerRuns,
    careerSourcePack
  ]);

  function currentSessionForm(): SessionFormState {
    return {
      agent: sessionAgent,
      taskName: sessionTaskName,
      goal: sessionGoal,
      resultSummary: sessionResultSummary,
      filesChangedText: sessionFilesChangedText,
      verificationCommandsText: sessionVerificationCommandsText,
      verificationResult: sessionVerificationResult,
      commitHash: sessionCommitHash,
      followUpsText: sessionFollowUpsText
    };
  }

  function applySessionForm(form: SessionFormState) {
    setSessionAgent(form.agent);
    setSessionTaskName(form.taskName);
    setSessionGoal(form.goal);
    setSessionResultSummary(form.resultSummary);
    setSessionFilesChangedText(form.filesChangedText);
    setSessionVerificationCommandsText(form.verificationCommandsText);
    setSessionVerificationResult(form.verificationResult);
    setSessionCommitHash(form.commitHash);
    setSessionFollowUpsText(form.followUpsText);
  }

  function openNewSessionForm() {
    if (!card) {
      return;
    }
    const project = getProjectForCard(lifeHarnessDataForCard(), card.id);
    applySessionForm(buildSessionFormFromDefaults(card, project));
    setSelectedSessionId(null);
    setSessionFormOpen(true);
  }

  function openExistingSessionForm(session: HarnessAgentSession) {
    applySessionForm(buildSessionFormFromSession(session));
    setSelectedSessionId(session.id);
    setSessionFormOpen(true);
  }

  function closeSessionForm() {
    setSessionFormOpen(false);
    setSelectedSessionId(null);
  }

  function lifeHarnessDataForCard() {
    return {
      cards,
      logs,
      proofItems,
      dailyState,
      resumeModules,
      jobCandidates,
      jobSources,
      jobSourceRuns,
      chatSummaries,
      memoryItems,
      projects,
      agentSessions,
      featureSprintPlans,
      featureSprintRunnerRuns,
      careerSourcePack
    };
  }

  const lifeHarnessData = lifeHarnessDataForCard();
  const featureSprintDogfood = useMemo(
    () =>
      buildFeatureSprintDogfoodSummary(lifeHarnessData, card?.id ?? id ?? "", {
        runnerHealth,
        runnerHealthProbe,
        runnerAgent
      }),
    [lifeHarnessData, card?.id, id, runnerHealth, runnerHealthProbe, runnerAgent]
  );
  const warmth = card ? computeCardWarmth(card, logs, new Date()) : undefined;

  if (!card) {
    return (
      <Screen>
        <Section title="Card Not Found">
          <Text style={styles.bodyText}>This card does not exist in the current state.</Text>
          <Link href="/board" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Return to Board</Text>
            </Pressable>
          </Link>
        </Section>
      </Screen>
    );
  }

  const cardId = card.id;
  const cardProof = proofItems.filter((proof) => card.proofItemIds.includes(proof.id));
  const linkedCandidate = card.careerApplication?.jobCandidateId
    ? jobCandidates.find((candidate) => candidate.id === card.careerApplication?.jobCandidateId)
    : undefined;
  const resumeReadiness = card.careerApplication
    ? buildApplicationResumeReadiness({
        card,
        resumeModules,
        jobCandidate: linkedCandidate,
        careerSourcePack: careerSourcePack?.pack
      })
    : undefined;

  function showNotice(kind: NoticeState["kind"], message: string) {
    setNotice({ kind, message });
    setTimeout(() => setNotice(null), 5000);
  }

  async function handleBuildResumeDocx() {
    if (resumeReadiness && !resumeReadiness.exportReadiness.canExportDocx) {
      return;
    }
    if (Platform.OS !== "web" || typeof document === "undefined") {
      showNotice("warning", "Resume DOCX export is web-only for now.");
      return;
    }
    const result = buildApplicationResumeDocxDraft(
      card!,
      resumeModules,
      sampleProfile as ResumeProfile
    );
    if (!result.ok) {
      showNotice("warning", `Cannot export resume: ${result.errors.join(" ")}`);
      return;
    }

    try {
      const blob = await packResumeDocxBlob(result.draft);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      showNotice("warning", "Resume DOCX download failed.");
      return;
    }

    const logged = logResumeExportForCard(cardId, { filename: result.fileName });
    if (!logged.ok) {
      showNotice(
        "warning",
        `Resume DOCX downloaded, but export was not logged: ${logged.message ?? "Unknown error."}`
      );
      return;
    }

    showNotice(
      "success",
      `Resume DOCX downloaded. Export logged for ${card!.title}.`
    );
  }

  function handleCreateDraftPacket() {
    const result = backfillResumeDraftPacket(cardId);
    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not create draft packet.");
  }

  function handleToggleResumeModule(moduleId: string) {
    const result = toggleResumeDraftPacketModule(cardId, moduleId);
    if (!result.ok) {
      showNotice("warning", result.message ?? "Could not update module selection.");
    }
  }

  function handleSetModuleForSection(section: ResumeModuleSection, moduleId: string) {
    const result = setResumeDraftPacketModuleForSection(cardId, section, moduleId);
    if (!result.ok) {
      showNotice("warning", result.message ?? "Could not update module selection.");
    }
  }

  function handleAddDefaultModules() {
    const result = addDefaultResumeModulesToPacket(cardId);
    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not add modules.");
  }

  function handlePatchResumeModule(moduleId: string, patch: ResumeModulePatch) {
    const result = patchResumeModule(moduleId, patch);
    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not patch module.");
  }

  function handleParkApplicationCard() {
    const result = setCardState(cardId, "parked");
    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not park card.");
  }

  useEffect(() => {
    if (params.focusSection || params.patchModule) {
      router.setParams({ focusSection: undefined, patchModule: undefined });
    }
  }, [params.focusSection, params.patchModule]);

  const activeFeatureSprintPlan = getActiveFeatureSprintPlanForCard(lifeHarnessData, card.id);
  const cardProject = getProjectForCard(lifeHarnessData, card.id);
  const currentFeatureStep = activeFeatureSprintPlan?.steps.find(
    (step) => step.id === activeFeatureSprintPlan.currentStepId
  );
  const persistedFeatureSpecBody = activeFeatureSprintPlan?.featureSpec?.body ?? "";
  const featureSpecDirty =
    featureSpecText.trim() !== persistedFeatureSpecBody.trim() ||
    (featureSpecSource !== (activeFeatureSprintPlan?.featureSpec?.source ?? "chatgpt_web") &&
      Boolean(activeFeatureSprintPlan?.featureSpec?.body?.trim()));
  const featureSpecApproved = isFeatureSpecApproved(activeFeatureSprintPlan);
  const persistedFeatureSpec = hasPersistedFeatureSpec(activeFeatureSprintPlan);
  const canRunImplementation = canRunFeatureSprintImplementation(activeFeatureSprintPlan);
  const implementationLaunchBlock = activeFeatureSprintPlan
    ? describeFeatureSprintPhaseLaunchBlock(activeFeatureSprintPlan, "implement")
    : undefined;
  const stepLocalizationSaved = hasStepPromptLocalization(currentFeatureStep);
  const stepPromptAuditSaved = hasStepPromptAudit(currentFeatureStep);
  const stepImplementationProofSaved = hasStepImplementationProof(currentFeatureStep);
  const agentOutputDirty =
    Boolean(agentOutputText.trim()) &&
    agentOutputText.trim() !== (currentFeatureStep?.outputSummary?.trim() ?? "");
  const proofStatusLabel = !currentFeatureStep?.outputSummary?.trim()
    ? "None (save agent output first)"
    : agentOutputDirty
      ? "Stale (re-save output, then re-normalize)"
      : !stepImplementationProofSaved
        ? "None"
        : `Normalized (${currentFeatureStep?.implementationProof?.verificationResult ?? "unknown"})`;
  const displayedWorkerEvidence =
    workerOutputPreview ?? currentFeatureStep?.workerOutputEvidence ?? null;
  const localizationStatusLabel = stepLocalizationSaved
    ? `Saved for current step (${currentFeatureStep?.promptLocalization?.likelyFiles.length ?? 0} files mapped)`
    : "None";
  const promptAuditStatusLabel = !stepPromptAuditSaved
    ? "None"
    : currentFeatureStep?.promptAudit?.verdict === "tighten_first"
      ? "Saved (review needed — tighten first)"
      : "Saved (ready)";
  const implementationPromptSourceLabel = currentFeatureStep
    ? (
        {
          audited: "Using: audited prompt",
          suggested: "Using: suggested prompt",
          goal: "Using: step goal"
        } as const
      )[resolveStepImplementationPromptSource(currentFeatureStep)]
    : "Using: step goal";
  const resolvedImplementationPromptExcerpt = currentFeatureStep
    ? resolveStepImplementationPrompt(currentFeatureStep).slice(0, 120)
    : "";
  const automationPhaseDisplay = activeFeatureSprintPlan
    ? resolveAutomationPhaseDisplay(activeFeatureSprintPlan, currentFeatureStep)
    : undefined;
  const stepRequiresSpecUpdate = doesFeatureSprintStepRequireSpecUpdate(
    activeFeatureSprintPlan,
    currentFeatureStep
  );
  const currentStepSpecUpdateSatisfied = hasApprovedSpecUpdateForStep(
    activeFeatureSprintPlan,
    currentFeatureStep
  );
  const latestSpecUpdateForCurrentStep =
    activeFeatureSprintPlan?.latestSpecUpdate?.stepId &&
    activeFeatureSprintPlan.latestSpecUpdate.stepId === activeFeatureSprintPlan.currentStepId
      ? activeFeatureSprintPlan.latestSpecUpdate
      : undefined;
  const canAdoptNextSlice = canAdoptNextSliceProposal(activeFeatureSprintPlan);
  const nextSliceProposal = activeFeatureSprintPlan?.nextSliceProposal;

  useEffect(() => {
    setFeatureSpecText(activeFeatureSprintPlan?.featureSpec?.body ?? "");
    setFeatureSpecSource(activeFeatureSprintPlan?.featureSpec?.source ?? "chatgpt_web");
  }, [
    activeFeatureSprintPlan?.id,
    activeFeatureSprintPlan?.featureSpec?.body,
    activeFeatureSprintPlan?.featureSpec?.source
  ]);

  useEffect(() => {
    setLocalizationImportText(currentFeatureStep?.promptLocalization?.rawOutput ?? "");
  }, [activeFeatureSprintPlan?.currentStepId, currentFeatureStep?.promptLocalization?.rawOutput]);

  useEffect(() => {
    setPromptAuditImportText(currentFeatureStep?.promptAudit?.rawOutput ?? "");
  }, [activeFeatureSprintPlan?.currentStepId, currentFeatureStep?.promptAudit?.rawOutput]);

  const featureSprintPlanId = activeFeatureSprintPlan?.id;
  const featureSprintCurrentStepId = activeFeatureSprintPlan?.currentStepId;

  useEffect(() => {
    setReviewImportText("");
    setSpecUpdateImportText("");
    setSelectedRunnerRunId(null);
    if (!featureSprintPlanId || !featureSprintCurrentStepId) {
      setAgentOutputText("");
      return;
    }
    const plan = getActiveFeatureSprintPlanForCard(lifeHarnessData, card.id);
    const step = plan?.steps.find((item) => item.id === featureSprintCurrentStepId);
    setAgentOutputText(step?.outputSummary ?? "");
  }, [featureSprintPlanId, featureSprintCurrentStepId, card.id]);

  const cardAgentSessions = getAgentSessionsForCard(lifeHarnessData, card.id).slice(0, 5);
  const recentRunnerRuns = getFeatureSprintRunnerRunsForCard(lifeHarnessData, card.id, 5);
  const latestScopingRun = recentRunnerRuns.find(
    (run) => isScopingProfile(run.profile) && run.status === "succeeded"
  );
  const latestImplementationRunForStep = recentRunnerRuns.find(
    (run) =>
      isImplementationProfile(run.profile) &&
      run.status === "succeeded" &&
      run.planId === activeFeatureSprintPlan?.id &&
      run.stepId === activeFeatureSprintPlan?.currentStepId
  );
  const latestReviewRunForStep = recentRunnerRuns.find(
    (run) =>
      isReviewProfile(run.profile) &&
      run.status === "succeeded" &&
      run.planId === activeFeatureSprintPlan?.id &&
      run.stepId === activeFeatureSprintPlan?.currentStepId
  );
  const latestPromptAuditRunForStep = recentRunnerRuns.find(
    (run) =>
      isPromptAuditProfile(run.profile) &&
      run.status === "succeeded" &&
      run.planId === activeFeatureSprintPlan?.id &&
      run.stepId === activeFeatureSprintPlan?.currentStepId
  );
  const implementationRunViewed =
    latestImplementationRunForStep !== undefined &&
    selectedRunnerRunId === latestImplementationRunForStep.id;
  const featureSprintActionGuideSteps = useMemo(
    () =>
      buildFeatureSprintActionGuide({
        nextActionKind: featureSprintDogfood.nextAction.kind,
        runnerAgent,
        implementationRunViewed,
        stepOutputSaved: Boolean(currentFeatureStep?.outputSummary?.trim()),
        reviewOutputReady: Boolean(
          reviewImportText.trim() || latestReviewRunForStep?.outputText || latestReviewRunForStep?.outputExcerpt
        ),
        reviewVerdictImported: currentFeatureStep?.reviewStatus != null,
        stepReviewAccepted: currentFeatureStep?.reviewStatus === "accepted",
        currentStepSpecUpdateSatisfied,
        scopingOutputReady: Boolean(
          latestScopingRun?.outputText?.trim() || latestScopingRun?.outputExcerpt?.trim()
        ),
        planImportTextReady: Boolean(planImportText.trim()),
        featureSpecDirty,
        stepLocalizationSaved,
        stepPromptAuditSaved,
        stepImplementationProofSaved,
        stepPromptAuditRunnerSucceeded: Boolean(
          latestPromptAuditRunForStep?.outputText?.trim() ||
            latestPromptAuditRunForStep?.outputExcerpt?.trim()
        )
      }),
    [
      featureSprintDogfood.nextAction.kind,
      runnerAgent,
      implementationRunViewed,
      currentFeatureStep?.outputSummary,
      currentFeatureStep?.reviewStatus,
      reviewImportText,
      latestReviewRunForStep,
      latestScopingRun,
      planImportText,
      featureSpecDirty,
      stepLocalizationSaved,
      stepPromptAuditSaved,
      stepImplementationProofSaved,
      currentStepSpecUpdateSatisfied
    ]
  );
  const showAgentOutputReadyHelper =
    Boolean(agentOutputText.trim()) &&
    !currentFeatureStep?.outputSummary?.trim() &&
    latestImplementationRunForStep !== undefined;
  const now = new Date();
  const nextMove = buildNextMoveSummary(lifeHarnessData, { now });
  const todayMoveForCard = [nextMove.primary, nextMove.backup, ...nextMove.candidates].find(
    (contract) => contract?.cardId === card.id
  );
  const recentWinsTeaser = card.recentWins.slice(-3);

  async function copyMarkdownToClipboard(
    buildMarkdown: () => { ok: true; markdown: string } | { ok: false; error: string },
    successMessage: string
  ) {
    const result = buildMarkdown();
    if (!result.ok) {
      showNotice("warning", result.error);
      return;
    }

    const copied = await copyTextToClipboard(result.markdown);
    if (!copied) {
      showNotice("warning", "Clipboard unavailable.");
      return;
    }

    showNotice("success", successMessage);
  }

  function buildScopingPacketForCard() {
    return buildFeatureScopingPacket(lifeHarnessData, cardId, {
      roughSpec: featureSpecText
    });
  }

  function handleCopyAgentContext() {
    void copyMarkdownToClipboard(
      () => buildCardContextPacket(lifeHarnessData, card!.id),
      "Agent context copied."
    );
  }

  function handleCopyAgentTaskPacket() {
    void copyMarkdownToClipboard(
      () => buildAgentTaskPacket(lifeHarnessData, buildDefaultAgentTaskPacketInput(card!)),
      "Agent task packet copied."
    );
  }

  async function handleCopyTaskPacketAndLogSent() {
    if (isCopyLogging) {
      return;
    }

    setIsCopyLogging(true);
    try {
      const result = buildAgentTaskPacket(
        lifeHarnessData,
        buildDefaultAgentTaskPacketInput(card!)
      );
      if (!result.ok) {
        showNotice("warning", result.error);
        return;
      }

      const copied = await copyTextToClipboard(result.markdown);
      if (!copied) {
        showNotice("warning", "Clipboard unavailable.");
        return;
      }

      const sessionResult = createAgentSessionForCard(
        buildAgentSessionCreateInputFromTaskPacket(result.packet, result.markdown)
      );
      if (sessionResult.ok) {
        showNotice("success", "Task packet copied and session logged.");
      } else {
        showNotice("warning", "Task packet copied, but session was not logged.");
      }
    } finally {
      setIsCopyLogging(false);
    }
  }

  function handleSaveFeatureSpec() {
    const result = saveFeatureSpecForCard(cardId, {
      body: featureSpecText,
      source: featureSpecSource
    });
    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not save feature spec.");
  }

  function handleApproveFeatureSpec() {
    if (!activeFeatureSprintPlan) {
      showNotice("warning", "Save a feature spec before approving.");
      return;
    }
    const result = approveFeatureSpecForPlan(activeFeatureSprintPlan.id);
    showNotice(
      result.ok ? "success" : "warning",
      result.message ?? "Could not approve feature spec."
    );
  }

  function handleImportFeaturePlan() {
    const result = importFeatureSprintPlanForCard(cardId, planImportText);
    if (!result.ok) {
      showNotice("warning", result.message ?? "Could not import plan.");
      return;
    }
    markMostRecentFeatureSprintRunnerRunImported({
      cardId,
      profile: "codex_scoping"
    });
    setPlanImportText("");
    showNotice("success", result.message ?? "Feature sprint plan imported.");
  }

  function handleImportLocalization() {
    if (!activeFeatureSprintPlan) {
      showNotice("warning", "No active feature sprint plan.");
      return;
    }
    const result = importFeaturePromptLocalizationForPlan(
      activeFeatureSprintPlan.id,
      localizationImportText,
      activeFeatureSprintPlan.currentStepId
    );
    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not import localization.");
  }

  function handleImportPromptAudit() {
    if (!activeFeatureSprintPlan) {
      showNotice("warning", "No active feature sprint plan.");
      return;
    }
    const result = importFeaturePromptAuditForPlan(
      activeFeatureSprintPlan.id,
      promptAuditImportText,
      activeFeatureSprintPlan.currentStepId
    );
    if (!result.ok) {
      showNotice("warning", result.message ?? "Could not import prompt audit.");
      return;
    }
    markMostRecentFeatureSprintRunnerRunImported({
      cardId,
      profile: "codex_prompt_audit",
      planId: activeFeatureSprintPlan.id,
      stepId: activeFeatureSprintPlan.currentStepId
    });
    showNotice("success", result.message ?? "Prompt audit imported.");
  }

  function handleParseOutputPreview() {
    setWorkerOutputPreview(
      parseFeatureSprintWorkerOutputEvidence(agentOutputText, {
        source: latestImplementationRunForStep ? "runner" : "manual",
        fallbackChangedFiles: latestImplementationRunForStep?.changedFiles
      })
    );
  }

  function handleSaveAgentOutput() {
    if (!activeFeatureSprintPlan?.currentStepId) {
      showNotice("warning", "No current step to save output on.");
      return;
    }
    const fromRunner = Boolean(latestImplementationRunForStep);
    const result = updateFeatureSprintStep(
      activeFeatureSprintPlan.id,
      activeFeatureSprintPlan.currentStepId,
      {
        outputSummary: agentOutputText.trim() || undefined,
        status: "sent",
        ...(fromRunner
          ? {
              workerOutputSource: "runner" as const,
              fallbackChangedFiles: latestImplementationRunForStep?.changedFiles
            }
          : {})
      }
    );
    if (result.ok) {
      setWorkerOutputPreview(null);
    }
    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not save agent output.");
  }

  function handleNormalizeProof() {
    if (!activeFeatureSprintPlan?.currentStepId || isNormalizingProof) {
      return;
    }
    setIsNormalizingProof(true);
    try {
      const result = normalizeImplementationProofForPlan(
        activeFeatureSprintPlan.id,
        activeFeatureSprintPlan.currentStepId
      );
      showNotice(
        result.ok ? "success" : "warning",
        result.message ?? "Could not normalize implementation proof."
      );
    } finally {
      setIsNormalizingProof(false);
    }
  }

  function handleImportReviewVerdict() {
    if (!activeFeatureSprintPlan) {
      showNotice("warning", "No active feature sprint plan.");
      return;
    }
    if (!activeFeatureSprintPlan.currentStepId) {
      showNotice("warning", "No current step to import review verdict on.");
      return;
    }
    const result = importFeatureReviewVerdictForPlan(
      activeFeatureSprintPlan.id,
      reviewImportText,
      activeFeatureSprintPlan.currentStepId
    );
    if (!result.ok) {
      showNotice("warning", result.message ?? "Could not import review verdict.");
      return;
    }
    markReviewRunnerRunImportedForVerdict({
      cardId,
      planId: activeFeatureSprintPlan.id,
      stepId: activeFeatureSprintPlan.currentStepId,
      reviewImportText,
      selectedRunId: selectedRunnerRunId,
      runnerAgent
    });
    setReviewImportText("");
    showNotice("success", result.message ?? "Review verdict imported.");
  }

  function handleImportSpecUpdate() {
    if (!activeFeatureSprintPlan) {
      showNotice("warning", "No active feature sprint plan.");
      return;
    }
    if (!activeFeatureSprintPlan.currentStepId) {
      showNotice("warning", "No current step to attach a spec update.");
      return;
    }
    const result = importFeatureSpecUpdateForPlan(
      activeFeatureSprintPlan.id,
      specUpdateImportText,
      activeFeatureSprintPlan.currentStepId
    );
    if (!result.ok) {
      showNotice("warning", result.message ?? "Could not import spec update.");
      return;
    }
    showNotice("success", result.message ?? "Spec update imported.");
  }

  function handleAdvanceFeatureStep() {
    if (!activeFeatureSprintPlan?.currentStepId) {
      showNotice("warning", "No current step to advance.");
      return;
    }
    const result = advanceFeatureSprintStep(
      activeFeatureSprintPlan.id,
      activeFeatureSprintPlan.currentStepId
    );
    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not advance step.");
  }

  function handleAdoptNextSlice() {
    if (!activeFeatureSprintPlan) {
      showNotice("warning", "No active feature sprint plan.");
      return;
    }
    const result = adoptNextSliceProposalForPlan(activeFeatureSprintPlan.id);
    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not adopt next slice.");
  }

  function handleCompleteFeatureSprint() {
    if (!activeFeatureSprintPlan) {
      showNotice("warning", "No active feature sprint plan.");
      return;
    }
    const result = completeFeatureSprintPlan(activeFeatureSprintPlan.id);
    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not complete feature.");
  }

  function handleDeleteFeatureSprint() {
    if (!activeFeatureSprintPlan) {
      return;
    }
    const result = deleteFeatureSprintPlan(activeFeatureSprintPlan.id);
    setPlanImportText("");
    setReviewImportText("");
    setAgentOutputText("");
    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not delete plan.");
  }

  async function handleCheckRunner() {
    setIsCheckingRunner(true);
    try {
      const health = await checkFeatureSprintRunnerHealth();
      setRunnerHealthProbe(health);
      setRunnerHealth(health.ok ? "available" : "unavailable");
      if (!health.ok) {
        showNotice("warning", health.error ?? "Local runner unavailable.");
      }
    } finally {
      setIsCheckingRunner(false);
    }
  }

  function ensureRunnerAgentAvailable(): boolean {
    const guardMessage = guardRunnerAgentAvailability(runnerAgent, runnerHealthProbe);
    if (guardMessage) {
      showNotice("warning", guardMessage);
      return false;
    }
    return true;
  }

  function ensureCodexRunnerAvailable(): boolean {
    const guardMessage = guardRunnerAgentAvailability("codex", runnerHealthProbe);
    if (guardMessage) {
      showNotice("warning", guardMessage);
      return false;
    }
    return true;
  }

  async function handleRunPromptAudit() {
    if (!activeFeatureSprintPlan?.currentStepId || isRunningPromptAudit) {
      return;
    }

    if (!ensureCodexRunnerAvailable()) {
      return;
    }

    const profile = "codex_prompt_audit" as const;
    const packet = buildFeatureStepPromptAuditPacket(
      lifeHarnessData,
      activeFeatureSprintPlan.id,
      activeFeatureSprintPlan.currentStepId
    );
    if (!packet.ok) {
      showNotice("warning", packet.error);
      return;
    }

    const project = getProjectForCard(lifeHarnessData, cardId);
    const executionContextResult = buildLaunchExecutionContext(activeFeatureSprintPlan);
    if (!executionContextResult.ok) {
      showNotice("warning", executionContextResult.error);
      return;
    }
    const historyCreate = createFeatureSprintRunnerRun({
      profile,
      cardId,
      ...historyAttributionFromExecutionContext(executionContextResult.context),
      planId: activeFeatureSprintPlan.id,
      stepId: activeFeatureSprintPlan.currentStepId,
      repoPath: project?.repoPath
    });
    if (!historyCreate.ok) {
      showNotice("warning", historyCreate.message ?? "Could not start runner history.");
      if (historyCreate.safetyBlocked) {
        return;
      }
    }

    setIsRunningPromptAudit(true);
    try {
      const result = await runFeatureSprintPacket({
        profile,
        promptMarkdown: packet.markdown,
        cardId,
        planId: activeFeatureSprintPlan.id,
        stepId: activeFeatureSprintPlan.currentStepId,
        repoPath: project?.repoPath,
        executionContext: executionContextResult.context
      });

      if (historyCreate.ok && historyCreate.runId) {
        completeFeatureSprintRunnerRun(historyCreate.runId, result);
      }

      if (!result.ok || !result.outputText) {
        showNotice("warning", runnerFailureNotice(result));
        return;
      }

      setPromptAuditImportText(result.outputText);
      if (historyCreate.ok && historyCreate.runId) {
        setSelectedRunnerRunId(historyCreate.runId);
      }
      const preview = result.commandPreview ? ` (${result.commandPreview})` : "";
      const fenceNotice = promptAuditFenceReadinessNotice(result.outputText);
      showNotice(
        fenceNotice ? "warning" : "success",
        `Prompt audit output loaded below. Click Import prompt audit when ready.${preview}${fenceNotice ? ` ${fenceNotice}` : ""}`
      );
    } finally {
      setIsRunningPromptAudit(false);
    }
  }

  async function handleRunScoping() {
    if (isRunningScoping) {
      return;
    }

    if (!ensureRunnerAgentAvailable()) {
      return;
    }

    const profile = buildRunnerProfile(runnerAgent, "scoping");
    const packet = buildScopingPacketForCard();
    if (!packet.ok) {
      showNotice("warning", packet.error);
      return;
    }

    const project = getProjectForCard(lifeHarnessData, cardId);
    const historyCreate = createFeatureSprintRunnerRun({
      profile,
      cardId,
      repoPath: project?.repoPath
    });
    if (!historyCreate.ok) {
      showNotice("warning", historyCreate.message ?? "Could not start runner history.");
      if (historyCreate.safetyBlocked) {
        return;
      }
    }

    setIsRunningScoping(true);
    try {
      const result = await runFeatureSprintPacket({
        profile,
        promptMarkdown: packet.markdown,
        cardId,
        repoPath: project?.repoPath
      });

      if (historyCreate.ok && historyCreate.runId) {
        completeFeatureSprintRunnerRun(historyCreate.runId, result);
      }

      if (!result.ok || !result.outputText) {
        showNotice("warning", runnerFailureNotice(result));
        return;
      }

      setPlanImportText(result.outputText);
      if (historyCreate.ok && historyCreate.runId) {
        setSelectedRunnerRunId(historyCreate.runId);
      }
      const preview = result.commandPreview ? ` (${result.commandPreview})` : "";
      const fenceNotice = scopingFenceReadinessNotice(result.outputText);
      showNotice(
        fenceNotice ? "warning" : "success",
        `Scoping output loaded below. Click Import plan when ready.${preview}${fenceNotice ? ` ${fenceNotice}` : ""}`
      );
    } finally {
      setIsRunningScoping(false);
    }
  }

  function handleLoadLatestScopingOutput() {
    const output = latestScopingRun?.outputText?.trim() || latestScopingRun?.outputExcerpt?.trim();
    if (!output) {
      showNotice("warning", "No scoping output found. Run scoping first.");
      return;
    }
    setPlanImportText(latestScopingRun?.outputText ?? latestScopingRun?.outputExcerpt ?? "");
    if (latestScopingRun) {
      setSelectedRunnerRunId(latestScopingRun.id);
    }
    showNotice("success", "Latest scoping output loaded into Import plan.");
  }

  function handleLoadLatestReviewOutput() {
    const output =
      latestReviewRunForStep?.outputText?.trim() || latestReviewRunForStep?.outputExcerpt?.trim();
    if (!output) {
      showNotice("warning", "No review output found for this step. Run review first.");
      return;
    }
    setReviewImportText(latestReviewRunForStep?.outputText ?? latestReviewRunForStep?.outputExcerpt ?? "");
    if (latestReviewRunForStep) {
      setSelectedRunnerRunId(latestReviewRunForStep.id);
    }
    const fenceNotice = reviewFenceReadinessNotice(
      latestReviewRunForStep?.outputText ?? latestReviewRunForStep?.outputExcerpt
    );
    showNotice(
      fenceNotice ? "warning" : "success",
      fenceNotice
        ? `Latest review output loaded. ${fenceNotice} Try Wrap as verdict block.`
        : "Latest review output loaded into Import review verdict."
    );
  }

  function handleWrapReviewVerdictFence() {
    const wrapped = buildFeatureReviewVerdictFenceDraft(reviewImportText);
    if (!wrapped) {
      showNotice(
        "warning",
        "Could not wrap this text. Load the full review output first, or paste prose starting with accepted/needs_changes/blocked."
      );
      return;
    }
    setReviewImportText(wrapped);
    showNotice("success", "Wrapped output in a feature-review-verdict block. Inspect, then Import review verdict.");
  }

  async function handleRunReview() {
    if (!activeFeatureSprintPlan || isRunningReview) {
      return;
    }

    if (!canRunFeatureSprintPhaseAction(activeFeatureSprintPlan, "review")) {
      showNotice(
        "warning",
        describeFeatureSprintPhaseLaunchBlock(activeFeatureSprintPlan, "review") ??
          "Review launch is blocked by Sprint Map readiness."
      );
      return;
    }

    if (!ensureRunnerAgentAvailable()) {
      return;
    }

    const profile = buildRunnerProfile(runnerAgent, "review");
    const packet = buildFeatureStepReviewPacket(
      lifeHarnessData,
      activeFeatureSprintPlan.id,
      activeFeatureSprintPlan.currentStepId,
      agentOutputText
    );
    if (!packet.ok) {
      showNotice("warning", packet.error);
      return;
    }

    const project = getProjectForCard(lifeHarnessData, cardId);
    const executionContextResult = buildLaunchExecutionContext(activeFeatureSprintPlan, "review");
    if (!executionContextResult.ok) {
      showNotice("warning", executionContextResult.error);
      return;
    }
    const historyCreate = createFeatureSprintRunnerRun({
      profile,
      cardId,
      ...historyAttributionFromExecutionContext(executionContextResult.context),
      planId: activeFeatureSprintPlan.id,
      stepId: activeFeatureSprintPlan.currentStepId,
      repoPath: project?.repoPath
    });
    if (!historyCreate.ok) {
      showNotice("warning", historyCreate.message ?? "Could not start runner history.");
      if (historyCreate.safetyBlocked) {
        return;
      }
    }

    setIsRunningReview(true);
    try {
      const result = await runFeatureSprintPacket({
        profile,
        promptMarkdown: packet.markdown,
        cardId,
        planId: activeFeatureSprintPlan.id,
        stepId: activeFeatureSprintPlan.currentStepId,
        repoPath: project?.repoPath,
        executionContext: executionContextResult.context
      });

      if (historyCreate.ok && historyCreate.runId) {
        completeFeatureSprintRunnerRun(historyCreate.runId, result);
      }

      if (!result.ok || !result.outputText) {
        showNotice("warning", runnerFailureNotice(result));
        return;
      }

      setReviewImportText(result.outputText);
      if (historyCreate.ok && historyCreate.runId) {
        setSelectedRunnerRunId(historyCreate.runId);
      }
      const preview = result.commandPreview ? ` (${result.commandPreview})` : "";
      const fenceNotice = reviewFenceReadinessNotice(result.outputText);
      showNotice(
        fenceNotice ? "warning" : "success",
        `Review output ready. Click Import review verdict.${preview}${fenceNotice ? ` ${fenceNotice}` : ""}`
      );
    } finally {
      setIsRunningReview(false);
    }
  }

  async function handleRunImplementationInWorktree() {
    if (!activeFeatureSprintPlan?.currentStepId || isRunningImplementation) {
      return;
    }

    if (!canRunFeatureSprintImplementation(activeFeatureSprintPlan)) {
      showNotice(
        "warning",
        describeFeatureSprintPhaseLaunchBlock(activeFeatureSprintPlan, "implement") ??
          "Implementation launch is blocked."
      );
      return;
    }

    if (!ensureRunnerAgentAvailable()) {
      return;
    }

    const project = getProjectForCard(lifeHarnessData, cardId);
    if (!project?.repoPath?.trim()) {
      showNotice("warning", "Add project repo path before running implementation.");
      return;
    }

    const packet = buildFeatureStepImplementationPacket(
      lifeHarnessData,
      activeFeatureSprintPlan.id,
      activeFeatureSprintPlan.currentStepId
    );
    if (!packet.ok) {
      showNotice("warning", packet.error);
      return;
    }

    const profile = buildRunnerProfile(runnerAgent, "implementation");
    const executionContextResult = buildLaunchExecutionContext(activeFeatureSprintPlan, "implement");
    if (!executionContextResult.ok) {
      showNotice("warning", executionContextResult.error);
      return;
    }
    const historyCreate = createFeatureSprintRunnerRun({
      profile,
      cardId,
      ...historyAttributionFromExecutionContext(executionContextResult.context),
      planId: activeFeatureSprintPlan.id,
      stepId: activeFeatureSprintPlan.currentStepId,
      repoPath: project.repoPath
    });
    if (!historyCreate.ok) {
      showNotice("warning", historyCreate.message ?? "Could not start runner history.");
      if (historyCreate.safetyBlocked) {
        return;
      }
    }

    setIsRunningImplementation(true);
    try {
      const result = await runFeatureSprintPacket({
        profile,
        promptMarkdown: packet.markdown,
        cardId,
        planId: activeFeatureSprintPlan.id,
        stepId: activeFeatureSprintPlan.currentStepId,
        repoPath: project.repoPath,
        worktree: { enabled: true },
        verificationCommands: project.verificationCommands ?? [],
        runVerification: Boolean(project.verificationCommands?.length),
        executionContext: executionContextResult.context
      });

      if (historyCreate.ok && historyCreate.runId) {
        completeFeatureSprintRunnerRun(historyCreate.runId, result);
      }

      if (!result.ok) {
        showNotice("warning", runnerFailureNotice(result));
        return;
      }

      setAgentOutputText(composeImplementationRunnerOutputSummary(result));
      if (historyCreate.ok && historyCreate.runId) {
        setSelectedRunnerRunId(historyCreate.runId);
      }
      const hasVerifyFailure = result.verificationResults?.some(
        (row) =>
          row.status === "failed" || row.status === "timed_out" || row.status === "cancelled"
      );
      showNotice(
        "success",
        hasVerifyFailure
          ? "Implementation finished. Inspect the expanded run, then Save agent output."
          : "Implementation finished. Inspect the expanded run above, then Save agent output."
      );
    } finally {
      setIsRunningImplementation(false);
    }
  }

  async function handleCleanWorktree(run: HarnessFeatureSprintRunnerRun, force: boolean) {
    if (!run.worktreePath?.trim() || cleaningRunId) {
      return;
    }

    const project = getProjectForCard(lifeHarnessData, cardId);
    const repoPath = run.repoPath?.trim() || project?.repoPath?.trim();
    if (!repoPath) {
      showNotice("warning", "Add project repo path before cleaning worktree.");
      return;
    }

    setCleaningRunId(run.id);
    try {
      const response = await cleanupFeatureSprintWorktree({
        worktreePath: run.worktreePath,
        branchName: run.branchName,
        repoPath,
        force
      });

      const markResult = markFeatureSprintRunnerRunWorktreeCleanup(run.id, response);
      if (!markResult.ok) {
        showNotice("warning", markResult.message ?? "Could not update runner history.");
      }

      if (response.status === "cleaned") {
        setForceCleanEligibleRunId(null);
        showNotice("success", response.message ?? "Worktree cleaned.");
        return;
      }

      if (response.status === "blocked") {
        setForceCleanEligibleRunId(run.id);
        showNotice(
          "warning",
          response.message ??
            "Worktree has uncommitted changes. Inspect output and diff, then force clean if ready."
        );
        return;
      }

      if (response.status === "not_found") {
        showNotice("info", response.message ?? "Worktree path was not found on disk.");
        return;
      }

      showNotice("warning", response.message ?? response.error ?? "Worktree cleanup failed.");
    } finally {
      setCleaningRunId(null);
    }
  }

  useEffect(() => {
    if (detailMode !== "backroom") {
      return;
    }

    let cancelled = false;
    void (async () => {
      const health = await checkFeatureSprintRunnerHealth();
      if (!cancelled) {
        setRunnerHealthProbe(health);
        setRunnerHealth(health.ok ? "available" : "unavailable");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailMode, cardId]);

  return (
    <Screen>
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

      <Section title={card.title}>
        <Text style={styles.bodyText}>
          {AREA_LABELS[card.area]} · {warmth ? WARMTH_LABELS[warmth] : "unknown"} · {card.state}
        </Text>
      </Section>

      {card.careerApplication && resumeReadiness ? (
        <CareerApplicationCardDetail
          card={card}
          resumeReadiness={resumeReadiness}
          resumeModules={resumeModules}
          cardProof={cardProof}
          logs={logs}
          sessionStartedAt={dailyState.sessionStartedAt}
          linkedCandidate={linkedCandidate}
          initialFocusSection={initialFocusSection}
          initialPatchModuleId={initialPatchModuleId}
          onBuildDocx={() => void handleBuildResumeDocx()}
          onCreateDraftPacket={handleCreateDraftPacket}
          onToggleModule={handleToggleResumeModule}
          onSetModuleForSection={handleSetModuleForSection}
          onAddDefaultModules={handleAddDefaultModules}
          onPatchModule={handlePatchResumeModule}
          onParkCard={handleParkApplicationCard}
          onNotice={showNotice}
        />
      ) : (
        <>
      <View style={styles.cardActionsRow}>
        {(["act", "backroom"] as const).map((mode) => {
          const active = detailMode === mode;
          const label = mode === "act" ? "Act" : "Backroom";
          return (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityLabel={`${label} mode`}
              testID={mode === "backroom" ? "card-detail-mode-backroom" : "card-detail-mode-act"}
              style={StyleSheet.flatten([
                active ? styles.primaryAction : styles.secondaryAction,
                { flex: 1, minWidth: 100 }
              ])}
              onPress={() => setDetailMode(mode)}
            >
              <Text style={active ? styles.primaryActionText : styles.secondaryActionText}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {detailMode === "act" ? (
        <>
      <Section title="Move">
        <ProgressBar value={computeCardProgress(card, logs, dailyState.sessionStartedAt)} />
        <Text style={styles.label}>Why It Matters</Text>
        <Text style={styles.bodyText}>{card.whyItMatters}</Text>
        <CardStateButtons cardId={card.id} currentState={card.state} />
        {card.state === "active" ? (
          dailyState.mainQuestId === card.id ? (
            <Text style={[styles.mainQuestBadge, { marginTop: 8 }]}>Main quest</Text>
          ) : (
            <Pressable
              style={[styles.secondaryAction, { marginTop: 8, alignSelf: "flex-start" }]}
              onPress={() => {
                const result = setMainQuest(card.id);
                showNotice(result.ok ? "success" : "warning", result.message ?? "Could not set main quest.");
              }}
            >
              <Text style={styles.secondaryActionText}>Set as main quest</Text>
            </Pressable>
          )
        ) : null}
      </Section>

      {todayMoveForCard ? (
        <Section title="Today's move">
          <Text style={styles.helpText}>This card is part of today's move.</Text>
          <Text style={[styles.bodyText, { marginTop: 8 }]}>{todayMoveForCard.pressureLabel}</Text>
          <Text style={[styles.label, { marginTop: 8 }]}>Do</Text>
          <Text style={styles.bodyText}>{todayMoveForCard.doAction}</Text>
          <Text style={[styles.label, { marginTop: 8 }]}>Proof after</Text>
          <Text style={styles.bodyText}>{todayMoveForCard.proofOnDone}</Text>
        </Section>
      ) : null}

      <View style={styles.cardActionsRow}>
        <Link href="/" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Today</Text>
          </Pressable>
        </Link>
        <Link href="/board" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Board</Text>
          </Pressable>
        </Link>
      </View>

      <Section title="Next Tiny Action">
        <Text style={styles.titleText}>{card.nextTinyAction}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Done For Now</Text>
        <Text style={styles.bodyText}>{card.doneForNow}</Text>
      </Section>

      <Section title="Do vs Improve">
        <View style={styles.splitRow}>
          <View style={styles.splitPanel}>
            <Text style={styles.label}>Do Lane</Text>
            <Text style={styles.bodyText}>{card.doLane}</Text>
          </View>
          <View style={styles.splitPanel}>
            <Text style={styles.label}>Improve Lane</Text>
            <Text style={styles.bodyText}>{card.improveLane}</Text>
          </View>
        </View>
      </Section>

      <Section title="Proof">
        {cardProof.length === 0 ? (
          <Text style={styles.emptyText}>
            No proof linked yet. Use Quick Capture on Today after one small move.
          </Text>
        ) : (
          cardProof.map((proof) => (
            <Text key={proof.id} style={styles.listItem}>
              ▸ {proof.title}
            </Text>
          ))
        )}
        <Link
          href={{ pathname: "/proof-ledger", params: { cardId: card.id } }}
          asChild
        >
          <Pressable style={StyleSheet.flatten([styles.secondaryAction, { marginTop: 12, alignSelf: "flex-start" }])}>
            <Text style={styles.secondaryActionText}>View proof ledger for this card</Text>
          </Pressable>
        </Link>
      </Section>

      {recentWinsTeaser.length > 0 ? (
        <Section title="Recent wins">
          {recentWinsTeaser.map((win) => (
            <Text key={win} style={styles.listItem}>
              ▸ {win}
            </Text>
          ))}
        </Section>
      ) : null}

      {card.resumePacket && !card.careerApplication ? (
        <Section title="Resume re-entry">
          <Text style={styles.label}>Last State</Text>
          <Text style={styles.bodyText}>{card.resumePacket.lastState}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Re-entry Action</Text>
          <Text style={styles.bodyText}>{card.resumePacket.reentryAction}</Text>
        </Section>
      ) : null}
        </>
      ) : (
        <>
      {canCopyTextToClipboard() ? (
        <Section title="Agent handoff">
          <Text style={styles.helpText}>
            Copy context or a task packet for Codex/Cursor. Optional — the card move in Act is the
            source of truth. For queue view, open Agent Workbench.
          </Text>
          <Link href="/agent-workbench" asChild>
            <Pressable style={StyleSheet.flatten([styles.smallButton, { marginTop: 8, alignSelf: "flex-start" }])}>
              <Text style={styles.smallButtonText}>Open Agent Workbench</Text>
            </Pressable>
          </Link>
          <View style={[styles.cardActionsRow, { marginTop: 12 }]}>
            <Pressable style={styles.secondaryAction} onPress={handleCopyAgentContext}>
              <Text style={styles.secondaryActionText}>Copy context</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={handleCopyAgentTaskPacket}>
              <Text style={styles.secondaryActionText}>Copy task packet</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryAction, isCopyLogging && { opacity: 0.5 }]}
              disabled={isCopyLogging}
              onPress={() => {
                void handleCopyTaskPacketAndLogSent();
              }}
            >
              <Text style={styles.secondaryActionText}>Copy + log sent</Text>
            </Pressable>
          </View>
        </Section>
      ) : null}

      <CollapsibleSection
        title="Backroom — sprint & metadata"
        defaultOpen={false}
        testID="card-backroom-sprint-metadata"
      >
      <Section title="Feature Sprint">
        <Text style={styles.helpText}>
          Manual planner → implementer → reviewer loop. ChatGPT/Codex scopes and reviews; Cursor/Codex
          implements bounded slices.
        </Text>

        <FeatureSprintFlowGuide />

        <FeatureSprintStartFlow
          cardTitle={card.title}
          nextTinyAction={card.nextTinyAction}
          roughSpec={featureSpecText}
          onChangeRoughSpec={setFeatureSpecText}
          onClearSpec={() => setFeatureSpecText("")}
          onUseNextActionAsSpec={
            card.nextTinyAction?.trim()
              ? () => setFeatureSpecText(card.nextTinyAction)
              : undefined
          }
          featureSpecSource={featureSpecSource}
          onSelectFeatureSpecSource={setFeatureSpecSource}
          isFeatureSpecDirty={featureSpecDirty}
          isFeatureSpecApproved={featureSpecApproved}
          hasPersistedFeatureSpec={persistedFeatureSpec}
          revisedSpecAwaitingApproval={
            stepRequiresSpecUpdate && !currentStepSpecUpdateSatisfied && Boolean(latestSpecUpdateForCurrentStep)
          }
          onSaveFeatureSpec={handleSaveFeatureSpec}
          onApproveFeatureSpec={handleApproveFeatureSpec}
          runnerAgent={runnerAgent}
          onSelectRunnerAgent={setRunnerAgent}
          runnerHealth={runnerHealth}
          runnerHealthProbe={runnerHealthProbe}
          appTokenConfigured={Boolean(resolveFeatureSprintRunnerToken())}
          isCheckingRunner={isCheckingRunner}
          isRunningScoping={isRunningScoping}
          hasProjectMetadata={Boolean(cardProject)}
          hasRepoPath={Boolean(cardProject?.repoPath?.trim())}
          hasActivePlan={Boolean(activeFeatureSprintPlan)}
          canCopyScopingPacket={canCopyTextToClipboard()}
          onCheckRunner={() => {
            void handleCheckRunner();
          }}
          onCopyScopingPacket={() => {
            void copyMarkdownToClipboard(buildScopingPacketForCard, "Scoping packet copied.");
          }}
          onRunScoping={() => {
            void handleRunScoping();
          }}
          onSetupNotice={(kind, message) => {
            showNotice(kind, message);
          }}
        />

        <View style={[styles.cardTile, { marginTop: 12 }]}>
          <View style={[styles.cardActionsRow, { alignItems: "center", justifyContent: "space-between" }]}>
            <Text style={styles.label}>Builder readiness</Text>
            <Text
              style={[
                styles.helpText,
                {
                  borderColor: colors.borderStrong,
                  borderRadius: 999,
                  borderWidth: 1,
                  color:
                    featureSprintDogfood.overallStatus === "complete"
                      ? colors.accentSuccess
                      : featureSprintDogfood.overallStatus === "not_ready"
                        ? colors.accentPrimary
                        : colors.textPrimary,
                  paddingHorizontal: 8,
                  paddingVertical: 3
                }
              ]}
            >
              {DOGFOOD_STATUS_LABELS[featureSprintDogfood.overallStatus]}
            </Text>
          </View>
          <Text style={[styles.titleText, { marginTop: 4 }]}>
            Next: {featureSprintDogfood.nextAction.label}
          </Text>
          <Text style={styles.bodyText}>{featureSprintDogfood.nextAction.detail}</Text>
          <View style={{ gap: 6, marginTop: 8 }}>
            {featureSprintDogfood.checks.map((check) => (
              <View key={check.id} style={{ gap: 2 }}>
                <Text style={styles.bodyText}>
                  <Text style={{ color: dogfoodCheckColor(check.status), fontWeight: "700" }}>
                    {dogfoodCheckMarker(check.status)}
                  </Text>{" "}
                  {check.label}
                </Text>
                <Text style={styles.helpText}>{check.detail}</Text>
              </View>
            ))}
          </View>
        </View>

        {activeFeatureSprintPlan ? (
          <FeatureSprintMapPanel
            plan={activeFeatureSprintPlan}
            onSelectExecutionTarget={(target: HarnessFeatureSprintExecutionTarget) => {
              const result = updateFeatureSprintPlan(activeFeatureSprintPlan.id, {
                executionTarget: target
              });
              if (!result.ok) {
                showNotice("warning", result.message ?? "Could not set execution target.");
                return;
              }
              showNotice(
                "success",
                `Execution target set: ${target.taskId} · ${target.phase}`
              );
            }}
            onSeedFromSteps={() => {
              const seeded = seedSprintMapFromLegacySteps(activeFeatureSprintPlan);
              if (!seeded.ok) {
                showNotice("warning", seeded.error);
                return;
              }
              const result = updateFeatureSprintPlan(activeFeatureSprintPlan.id, {
                sprintMap: seeded.sprintMap,
                executionTarget: seeded.executionTarget ?? null,
                executionModel: null,
                sprintMapNotices: [seeded.notice]
              });
              if (!result.ok) {
                showNotice("warning", result.message ?? "Could not seed Sprint Map.");
                return;
              }
              showNotice("success", seeded.notice.message);
            }}
            onAdoptSprintMap={() => {
              if (!activeFeatureSprintPlan.executionTarget) {
                showNotice(
                  "warning",
                  "Select a Sprint Map task and phase before adopting map execution."
                );
                return;
              }
              const result = updateFeatureSprintPlan(activeFeatureSprintPlan.id, {
                executionModel: "sprint_map",
                executionTarget: activeFeatureSprintPlan.executionTarget
              });
              if (!result.ok) {
                showNotice("warning", result.message ?? "Could not adopt Sprint Map execution.");
                return;
              }
              showNotice(
                "success",
                "Sprint Map is now authoritative. Legacy step readiness will not bypass map gates."
              );
            }}
            onRevertToLegacy={() => {
              const result = updateFeatureSprintPlan(activeFeatureSprintPlan.id, {
                executionModel: null
              });
              if (!result.ok) {
                showNotice("warning", result.message ?? "Could not revert to legacy steps.");
                return;
              }
              showNotice("success", "Reverted to legacy steps authority. Sprint Map kept as preview.");
            }}
          />
        ) : null}

        <View style={{ marginTop: 12 }}>
          <Text style={styles.label}>Recent runner runs</Text>
          {recentRunnerRuns.length === 0 ? (
            <Text style={[styles.emptyText, { marginTop: 8 }]}>No runner history yet.</Text>
          ) : (
            recentRunnerRuns.map((run) => {
              const runnerOutputView =
                selectedRunnerRunId === run.id
                  ? buildFeatureSprintRunnerOutputView(lifeHarnessData, run.id)
                  : undefined;

              return (
              <View key={run.id} style={{ marginTop: 10 }}>
                <Text style={styles.bodyText}>
                  {formatRunnerProfileLabel(run.profile)} · {run.status} ·{" "}
                  {formatRunnerStartedAt(run.startedAt)}
                  {run.importedAt ? " · Imported" : ""}
                  {formatRunnerResultUsabilityLabel(run)
                    ? ` · ${formatRunnerResultUsabilityLabel(run)}`
                    : ""}
                </Text>
                {run.taskId ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>
                    Map task: {run.taskId}
                    {run.mapPhase ? ` · ${run.mapPhase}` : ""}
                  </Text>
                ) : null}
                {run.diagnosticMessage && run.status === "failed" ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>{run.diagnosticMessage}</Text>
                ) : null}
                {run.worktreePath ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>Worktree: {run.worktreePath}</Text>
                ) : null}
                {formatRunnerWorktreeCleanupLine(run) ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>
                    {formatRunnerWorktreeCleanupLine(run)}
                  </Text>
                ) : null}
                {run.branchName ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>Branch: {run.branchName}</Text>
                ) : null}
                {run.changedFiles && run.changedFiles.length > 0 ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>
                    Changed files: {run.changedFiles.length}
                  </Text>
                ) : null}
                {isImplementationProfile(run.profile) && run.verificationResults ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>
                    Verification: {summarizeVerificationResults(run.verificationResults)}
                  </Text>
                ) : null}
                {isImplementationProfile(run.profile) &&
                run.verificationResults
                  ?.filter(
                    (row) =>
                      row.status === "failed" ||
                      row.status === "rejected" ||
                      row.status === "timed_out" ||
                      row.status === "cancelled"
                  )
                  .slice(0, 1)
                  .map((issue) => {
                    const detail = issue.error ?? issue.stderrExcerpt ?? issue.stdoutExcerpt;
                    const line = detail ? detail.split("\n")[0] : undefined;
                    const prefix =
                      issue.status === "rejected"
                        ? "Rejected"
                        : issue.status === "timed_out"
                          ? "Timed out"
                          : issue.status === "cancelled"
                            ? "Cancelled"
                            : "Failed";
                    return (
                      <Text key={`${run.id}-verify-issue`} style={[styles.helpText, { marginTop: 4 }]}>
                        {line
                          ? `${prefix}: ${issue.command} — ${line}`
                          : `${prefix}: ${issue.command}`}
                      </Text>
                    );
                  })}
                {run.commandPreview ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>{run.commandPreview}</Text>
                ) : null}
                {run.status === "failed" && run.error ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>{run.error}</Text>
                ) : null}
                {run.status === "succeeded" && run.diffStat ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>{run.diffStat}</Text>
                ) : null}
                {run.status === "succeeded" && run.outputExcerpt && !run.diffStat ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>{run.outputExcerpt}</Text>
                ) : null}
                <View style={[styles.cardActionsRow, { marginTop: 8, alignItems: "center" }]}>
                  <Pressable
                    style={styles.secondaryAction}
                    onPress={() => {
                      setSelectedRunnerRunId((current) => (current === run.id ? null : run.id));
                    }}
                  >
                    <Text style={styles.secondaryActionText}>
                      {selectedRunnerRunId === run.id ? "Hide details" : "View details"}
                    </Text>
                  </Pressable>
                  {canCopyTextToClipboard() && (run.outputText || run.outputExcerpt) ? (
                    <Pressable
                      style={styles.secondaryAction}
                      onPress={() => {
                        void copyTextToClipboard(run.outputText ?? run.outputExcerpt ?? "").then(
                          (copied) => {
                            showNotice(
                              copied ? "success" : "warning",
                              copied ? "Runner output copied." : "Clipboard unavailable."
                            );
                          }
                        );
                      }}
                    >
                      <Text style={styles.secondaryActionText}>Copy output</Text>
                    </Pressable>
                  ) : null}
                </View>
                {runnerOutputView ? (
                  <FeatureRunnerOutputDetails
                    view={runnerOutputView}
                    profileLabel={formatRunnerProfileLabel(run.profile)}
                    formattedStartedAt={formatRunnerStartedAt(run.startedAt)}
                    canCopy={canCopyTextToClipboard()}
                    onCopyOutput={() => {
                      void copyTextToClipboard(
                        runnerOutputView.outputText ?? runnerOutputView.outputExcerpt ?? ""
                      ).then((copied) => {
                        showNotice(
                          copied ? "success" : "warning",
                          copied ? "Runner output copied." : "Clipboard unavailable."
                        );
                      });
                    }}
                    onCopyDiff={
                      runnerOutputView.diffText
                        ? () => {
                            void copyTextToClipboard(runnerOutputView.diffText ?? "").then((copied) => {
                              showNotice(
                                copied ? "success" : "warning",
                                copied ? "Diff copied." : "Clipboard unavailable."
                              );
                            });
                          }
                        : undefined
                    }
                    onCopyVerificationSummary={() => {
                      void copyTextToClipboard(runnerOutputView.verificationSummary).then((copied) => {
                        showNotice(
                          copied ? "success" : "warning",
                          copied ? "Verification summary copied." : "Clipboard unavailable."
                        );
                      });
                    }}
                    onCopyWorktreePath={
                      runnerOutputView.worktreePath
                        ? () => {
                            void copyTextToClipboard(runnerOutputView.worktreePath ?? "").then((copied) => {
                              showNotice(
                                copied ? "success" : "warning",
                                copied ? "Worktree path copied." : "Clipboard unavailable."
                              );
                            });
                          }
                        : undefined
                    }
                    onCleanWorktree={
                      runnerOutputView.canCleanWorktree
                        ? () => {
                            void handleCleanWorktree(run, false);
                          }
                        : undefined
                    }
                    onForceCleanWorktree={
                      forceCleanEligibleRunId === run.id
                        ? () => {
                            void handleCleanWorktree(run, true);
                          }
                        : undefined
                    }
                    showForceClean={forceCleanEligibleRunId === run.id}
                    isCleaning={cleaningRunId === run.id}
                  />
                ) : null}
              </View>
            );
            })
          )}
        </View>

        {activeFeatureSprintPlan ? (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Active plan</Text>
            <Text style={styles.titleText}>
              {activeFeatureSprintPlan.title} · {activeFeatureSprintPlan.status}
            </Text>
            {automationPhaseDisplay ? (
              <Text style={[styles.helpText, { marginTop: 4 }]}>
                Automation phase: {automationPhaseDisplay.replaceAll("_", " ")}
              </Text>
            ) : null}
            {activeFeatureSprintPlan.currentStepId ? (
              <Text style={[styles.helpText, { marginTop: 4 }]}>
                Localization: {localizationStatusLabel}
              </Text>
            ) : null}
            {stepLocalizationSaved && currentFeatureStep?.promptLocalization ? (
              <Text style={[styles.helpText, { marginTop: 4 }]}>
                Revised prompt:{" "}
                {currentFeatureStep.promptLocalization.revisedImplementationPrompt.slice(0, 120)}
                {currentFeatureStep.promptLocalization.revisedImplementationPrompt.length > 120
                  ? "…"
                  : ""}
              </Text>
            ) : null}
            {activeFeatureSprintPlan.currentStepId ? (
              <Text style={[styles.helpText, { marginTop: 4 }]}>
                Prompt audit: {promptAuditStatusLabel}
              </Text>
            ) : null}
            {currentFeatureStep ? (
              <>
                <Text style={[styles.helpText, { marginTop: 4 }]}>
                  Proof: {proofStatusLabel}
                </Text>
                {stepImplementationProofSaved && currentFeatureStep.implementationProof ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>
                    {currentFeatureStep.implementationProof.filesChanged.length} file(s) changed ·{" "}
                    {currentFeatureStep.implementationProof.knownRisks.length} risk note(s)
                  </Text>
                ) : null}
                <Text style={[styles.helpText, { marginTop: 4 }]}>
                  {implementationPromptSourceLabel}
                </Text>
                {resolvedImplementationPromptExcerpt ? (
                  <Text style={[styles.helpText, { marginTop: 4 }]}>
                    Final prompt: {resolvedImplementationPromptExcerpt}
                    {resolveStepImplementationPrompt(currentFeatureStep).length > 120 ? "…" : ""}
                  </Text>
                ) : null}
              </>
            ) : null}
            <Text style={[styles.bodyText, { marginTop: 8 }]}>{activeFeatureSprintPlan.goal}</Text>
            {activeFeatureSprintPlan.whyNow ? (
              <>
                <Text style={[styles.label, { marginTop: 12 }]}>Why now</Text>
                <Text style={styles.bodyText}>{activeFeatureSprintPlan.whyNow}</Text>
              </>
            ) : null}
            <Text style={[styles.label, { marginTop: 12 }]}>Acceptance criteria</Text>
            {activeFeatureSprintPlan.acceptanceCriteria.map((item) => (
              <Text key={item} style={styles.listItem}>
                ▸ {item}
              </Text>
            ))}
            {activeFeatureSprintPlan.nonGoals.length > 0 ? (
              <>
                <Text style={[styles.label, { marginTop: 12 }]}>Non-goals</Text>
                {activeFeatureSprintPlan.nonGoals.map((item) => (
                  <Text key={item} style={styles.listItem}>
                    ▸ {item}
                  </Text>
                ))}
              </>
            ) : null}
            <Text style={[styles.label, { marginTop: 12 }]}>Steps</Text>
            {activeFeatureSprintPlan.steps.map((step) => (
              <Text
                key={step.id}
                style={[
                  styles.listItem,
                  step.id === activeFeatureSprintPlan.currentStepId && { color: colors.accentPrimary }
                ]}
              >
                ▸ {step.title} · {step.status}
                {step.reviewStatus ? ` · review ${step.reviewStatus}` : ""}
              </Text>
            ))}
            {currentFeatureStep?.reviewVerdict ? (
              <>
                <Text style={[styles.label, { marginTop: 12 }]}>Latest review</Text>
                <Text style={styles.bodyText}>{currentFeatureStep.reviewVerdict}</Text>
              </>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.emptyText, { marginTop: 12 }]}>No active feature sprint plan yet.</Text>
        )}

        {activeFeatureSprintPlan?.currentStepId ? (
          <>
            <Text style={[styles.label, { marginTop: 12 }]}>Current step — optional prep</Text>
            <View style={[styles.cardActionsRow, { marginTop: 8, flexWrap: "wrap" }]}>
              {activeFeatureSprintPlan && canCopyTextToClipboard() ? (
                <Pressable
                  style={styles.secondaryAction}
                  onPress={() => {
                    void copyMarkdownToClipboard(
                      () =>
                        buildFeatureStepLocalizationPacket(
                          lifeHarnessData,
                          activeFeatureSprintPlan.id,
                          activeFeatureSprintPlan.currentStepId
                        ),
                      "Localization packet copied."
                    );
                  }}
                >
                  <Text style={styles.secondaryActionText}>Copy for Cursor localization</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={[styles.label, { marginTop: 12 }]}>
              Import localization (Cursor output)
            </Text>
            <Text style={styles.helpText}>
              Paste Cursor output with a feature-prompt-localization fenced block. Read-only repo
              inspection — not implementation.
            </Text>
            <TextInput
              style={[styles.captureInput, { minHeight: 100, textAlignVertical: "top", marginTop: 8 }]}
              value={localizationImportText}
              onChangeText={setLocalizationImportText}
              placeholder="Paste output with a feature-prompt-localization fenced block"
              placeholderTextColor={colors.inputPlaceholder}
              multiline
            />
            <Pressable
              style={[styles.secondaryAction, { marginTop: 12 }]}
              onPress={handleImportLocalization}
            >
              <Text style={styles.secondaryActionText}>Import localization</Text>
            </Pressable>

            <View style={[styles.cardActionsRow, { marginTop: 12, flexWrap: "wrap" }]}>
              {activeFeatureSprintPlan && canCopyTextToClipboard() ? (
                <Pressable
                  style={styles.secondaryAction}
                  onPress={() => {
                    void copyMarkdownToClipboard(
                      () =>
                        buildFeatureStepPromptAuditPacket(
                          lifeHarnessData,
                          activeFeatureSprintPlan.id,
                          activeFeatureSprintPlan.currentStepId
                        ),
                      "Prompt audit packet copied."
                    );
                  }}
                >
                  <Text style={styles.secondaryActionText}>Copy for GPT/Codex prompt audit</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.secondaryAction, isRunningPromptAudit && { opacity: 0.5 }]}
                disabled={isRunningPromptAudit}
                onPress={() => {
                  void handleRunPromptAudit();
                }}
              >
                <Text style={styles.secondaryActionText}>
                  {isRunningPromptAudit ? "Running…" : "Run prompt audit with Codex"}
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.label, { marginTop: 12 }]}>
              Import prompt audit (GPT/Codex output)
            </Text>
            <Text style={styles.helpText}>
              Paste GPT/Codex output with a feature-prompt-critique fenced block. Review needed
              verdicts warn only — they do not block implementation. Codex prompt audit is intended to
              be read-only. The runner does not create an implementation worktree, but real Codex
              execution still happens in the repo context; check git status if concerned.
            </Text>
            <TextInput
              style={[styles.captureInput, { minHeight: 100, textAlignVertical: "top", marginTop: 8 }]}
              value={promptAuditImportText}
              onChangeText={setPromptAuditImportText}
              placeholder="Paste output with a feature-prompt-critique fenced block"
              placeholderTextColor={colors.inputPlaceholder}
              multiline
            />
            <Pressable
              style={[styles.secondaryAction, { marginTop: 12 }]}
              onPress={handleImportPromptAudit}
            >
              <Text style={styles.secondaryActionText}>Import prompt audit</Text>
            </Pressable>

            <Text style={[styles.label, { marginTop: 16 }]}>Current step — implement & review</Text>
            <View style={[styles.cardActionsRow, { marginTop: 8, flexWrap: "wrap" }]}>
              {activeFeatureSprintPlan && canCopyTextToClipboard() ? (
                <Pressable
                  style={styles.secondaryAction}
                  onPress={() => {
                    void copyMarkdownToClipboard(
                      () =>
                        buildFeatureStepImplementationPacket(
                          lifeHarnessData,
                          activeFeatureSprintPlan.id
                        ),
                      "Implementation prompt copied."
                    );
                  }}
                >
                  <Text style={styles.secondaryActionText}>
                    Copy for {runnerAgentLabel(runnerAgent)} implementation
                  </Text>
                </Pressable>
              ) : null}
              {!canRunImplementation && implementationLaunchBlock ? (
                <Text
                  style={[styles.helpText, { marginTop: 8 }]}
                  testID="feature-sprint-implementation-block-reason"
                >
                  {implementationLaunchBlock}
                </Text>
              ) : null}
              <Pressable
                testID="feature-sprint-run-implementation"
                style={[
                  styles.secondaryAction,
                  (isRunningImplementation || !canRunImplementation) && { opacity: 0.5 }
                ]}
                disabled={isRunningImplementation || !canRunImplementation}
                onPress={() => {
                  void handleRunImplementationInWorktree();
                }}
              >
                <Text style={styles.secondaryActionText}>
                  {isRunningImplementation
                    ? "Running…"
                    : `Run implementation with ${runnerAgentLabel(runnerAgent)}`}
                </Text>
              </Pressable>
              {activeFeatureSprintPlan && canCopyTextToClipboard() ? (
                <Pressable
                  style={styles.secondaryAction}
                  onPress={() => {
                    void copyMarkdownToClipboard(
                      () =>
                        buildFeatureStepReviewPacket(
                          lifeHarnessData,
                          activeFeatureSprintPlan.id,
                          undefined,
                          agentOutputText
                        ),
                      "Review packet copied."
                    );
                  }}
                >
                  <Text style={styles.secondaryActionText}>Copy for ChatGPT/Codex review</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.secondaryAction, isRunningReview && { opacity: 0.5 }]}
                disabled={isRunningReview}
                onPress={() => {
                  void handleRunReview();
                }}
              >
                <Text style={styles.secondaryActionText}>
                  {isRunningReview ? "Running…" : `Run review with ${runnerAgentLabel(runnerAgent)}`}
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.helpText, { marginTop: 8 }]}>
              Uses the enriched review packet (normalized proof when saved). Output fills Import review
              verdict below — import remains manual.
              {stepImplementationProofSaved ? " Review packet will include normalized proof." : ""}
            </Text>
          </>
        ) : null}

        <FeatureSprintActionGuide
          steps={featureSprintActionGuideSteps}
          title="Current step checklist"
        />

        <Text style={[styles.label, { marginTop: 12 }]}>Import plan (ChatGPT/Codex/Cursor output)</Text>
        {!activeFeatureSprintPlan && latestScopingRun ? (
          <Pressable
            style={[styles.secondaryAction, { marginTop: 8, alignSelf: "flex-start" }]}
            onPress={handleLoadLatestScopingOutput}
          >
            <Text style={styles.secondaryActionText}>Load latest scoping output</Text>
          </Pressable>
        ) : null}
        <TextInput
          testID="feature-sprint-plan-import-input"
          style={[styles.captureInput, { minHeight: 100, textAlignVertical: "top", marginTop: 8 }]}
          value={planImportText}
          onChangeText={setPlanImportText}
          placeholder="Paste output with a feature-sprint-plan fenced block"
          placeholderTextColor={colors.inputPlaceholder}
          multiline
        />
        <Pressable
          testID="feature-sprint-import-plan"
          style={[styles.secondaryAction, { marginTop: 12 }]}
          onPress={handleImportFeaturePlan}
        >
          <Text style={styles.secondaryActionText}>Import plan</Text>
        </Pressable>

        {activeFeatureSprintPlan ? (
          <>
            <Text style={[styles.label, { marginTop: 12 }]}>Agent output</Text>
            <Text style={styles.helpText}>
              Runner filled this box. Inspect the expanded run in Recent runner runs, then Save agent
              output. Normalize for review before running review. Normalization is rules-only — re-run
              after re-saving output if runner metadata changed.
            </Text>
            {showAgentOutputReadyHelper ? (
              <Text style={[styles.helpText, { marginTop: 4, marginBottom: 8, color: colors.accentPrimary }]}>
                Ready to save — follow the checklist above: View details (if collapsed) → Save agent output →
                Normalize for review → Run review → Import review verdict → Advance step.
              </Text>
            ) : null}
            <TextInput
              testID="feature-sprint-agent-output-input"
              style={[styles.captureInput, { minHeight: 100, textAlignVertical: "top" }]}
              value={agentOutputText}
              onChangeText={setAgentOutputText}
              placeholder="Paste implementation agent output"
              placeholderTextColor={colors.inputPlaceholder}
              multiline
            />
            <Pressable
              testID="feature-sprint-save-agent-output"
              style={[styles.secondaryAction, { marginTop: 12 }]}
              onPress={handleSaveAgentOutput}
            >
              <Text style={styles.secondaryActionText}>Save agent output</Text>
            </Pressable>
            <Pressable
              testID="feature-sprint-parse-output-preview"
              style={[styles.secondaryAction, { marginTop: 12 }]}
              onPress={handleParseOutputPreview}
            >
              <Text style={styles.secondaryActionText}>Parse output preview</Text>
            </Pressable>
            {displayedWorkerEvidence ? (
              <View testID="feature-sprint-worker-output-evidence-preview" style={{ marginTop: 12 }}>
                <Text style={styles.label}>Parsed evidence preview</Text>
                <Text style={styles.helpText}>
                  Best-effort parse only — Save agent output persists evidence. Review packets redact
                  secrets and cap excerpts.
                </Text>
                <Text style={styles.helpText}>
                  Changed files: {displayedWorkerEvidence.changedFiles?.length ?? 0}
                  {displayedWorkerEvidence.changedFiles?.length
                    ? ` — ${displayedWorkerEvidence.changedFiles.slice(0, 5).join(", ")}${
                        displayedWorkerEvidence.changedFiles.length > 5 ? "…" : ""
                      }`
                    : ""}
                </Text>
                <Text style={styles.helpText}>
                  Tests detected: {displayedWorkerEvidence.testsRun?.length ?? 0}
                  {displayedWorkerEvidence.testsRun?.length
                    ? ` — ${displayedWorkerEvidence.testsRun.slice(0, 3).join(", ")}${
                        displayedWorkerEvidence.testsRun.length > 3 ? "…" : ""
                      }`
                    : ""}
                </Text>
                {displayedWorkerEvidence.warnings?.length ? (
                  <Text style={styles.helpText}>
                    Warnings: {displayedWorkerEvidence.warnings.join(" | ")}
                  </Text>
                ) : null}
                {displayedWorkerEvidence.knownLimitations?.length ? (
                  <Text style={styles.helpText}>
                    Limitations: {displayedWorkerEvidence.knownLimitations.join(" | ")}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Pressable
              style={[
                styles.secondaryAction,
                { marginTop: 12 },
                (isNormalizingProof || !currentFeatureStep?.outputSummary?.trim()) && { opacity: 0.5 }
              ]}
              disabled={isNormalizingProof || !currentFeatureStep?.outputSummary?.trim()}
              onPress={handleNormalizeProof}
            >
              <Text style={styles.secondaryActionText}>
                {isNormalizingProof ? "Normalizing…" : "Normalize for review"}
              </Text>
            </Pressable>

            <Text style={[styles.label, { marginTop: 12 }]}>Import review verdict</Text>
            <Text style={styles.helpText}>
              Paste reviewer output with a feature-review-verdict fenced block. Codex often returns prose
              only — load the full run output, then Wrap as verdict block before importing.
            </Text>
            {latestReviewRunForStep ? (
              <View style={[styles.cardActionsRow, { marginTop: 8, alignItems: "center" }]}>
                <Pressable style={styles.secondaryAction} onPress={handleLoadLatestReviewOutput}>
                  <Text style={styles.secondaryActionText}>Load latest review output</Text>
                </Pressable>
                {reviewFenceReadinessNotice(reviewImportText) ? (
                  <Pressable style={styles.secondaryAction} onPress={handleWrapReviewVerdictFence}>
                    <Text style={styles.secondaryActionText}>Wrap as verdict block</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <TextInput
              testID="feature-sprint-review-import-input"
              style={[styles.captureInput, { minHeight: 100, textAlignVertical: "top" }]}
              value={reviewImportText}
              onChangeText={setReviewImportText}
              placeholder="Paste reviewer output with feature-review-verdict block"
              placeholderTextColor={colors.inputPlaceholder}
              multiline
            />
            <Pressable
              testID="feature-sprint-import-review-verdict"
              style={[styles.secondaryAction, { marginTop: 12 }]}
              onPress={handleImportReviewVerdict}
            >
              <Text style={styles.secondaryActionText}>Import review verdict</Text>
            </Pressable>

            <Text style={[styles.label, { marginTop: 16 }]}>Import spec update (GPT output)</Text>
            <Text style={styles.helpText}>
              Paste GPT output with a feature-spec-update fenced block. This updates the persisted feature
              spec and sets it back to unapproved — you must review and Approve feature spec again. Import
              is manual and never advances the step automatically.
            </Text>
            {stepRequiresSpecUpdate && !currentStepSpecUpdateSatisfied ? (
              <Text
                testID="feature-sprint-spec-update-gate-warning"
                style={[styles.helpText, { marginTop: 6, color: colors.accentDanger }]}
              >
                This step requires a spec update + re-approval before advancing.
              </Text>
            ) : null}
            {latestSpecUpdateForCurrentStep ? (
              <CollapsibleSection
                title="Latest imported spec update"
                defaultOpen={false}
                testID="feature-sprint-spec-update-summary"
              >
                <Text style={styles.helpText}>
                  Imported at: {latestSpecUpdateForCurrentStep.importedAt
                    .slice(0, 16)
                    .replace("T", " ")}
                </Text>
                <Text style={[styles.label, { marginTop: 8 }]}>Completed slice summary</Text>
                <Text
                  testID="feature-sprint-spec-update-completed-summary"
                  style={styles.bodyText}
                >
                  {latestSpecUpdateForCurrentStep.completedSliceSummary}
                </Text>
                {latestSpecUpdateForCurrentStep.changelog.length > 0 ? (
                  <>
                    <Text style={[styles.label, { marginTop: 12 }]}>Changelog</Text>
                    {latestSpecUpdateForCurrentStep.changelog.map((item) => (
                      <Text key={item} style={styles.listItem}>
                        ▸ {item}
                      </Text>
                    ))}
                  </>
                ) : null}
                {latestSpecUpdateForCurrentStep.remainingWork.length > 0 ? (
                  <>
                    <Text style={[styles.label, { marginTop: 12 }]}>Remaining work</Text>
                    {latestSpecUpdateForCurrentStep.remainingWork.map((item) => (
                      <Text key={item} style={styles.listItem}>
                        ▸ {item}
                      </Text>
                    ))}
                  </>
                ) : null}
                <Text style={[styles.helpText, { marginTop: 12 }]}>
                  Feature complete: {latestSpecUpdateForCurrentStep.featureComplete ? "yes" : "no"}
                </Text>
                {nextSliceProposal ? (
                  <>
                    <Text style={[styles.label, { marginTop: 12 }]}>Next slice proposal</Text>
                    <Text style={styles.bodyText}>{nextSliceProposal.title}</Text>
                    <Text style={[styles.helpText, { marginTop: 4 }]}>{nextSliceProposal.goal}</Text>
                    {nextSliceProposal.acceptanceCriteria.length > 0 ? (
                      <>
                        <Text style={[styles.label, { marginTop: 8 }]}>Acceptance criteria</Text>
                        {nextSliceProposal.acceptanceCriteria.map((item) => (
                          <Text key={item} style={styles.listItem}>
                            ▸ {item}
                          </Text>
                        ))}
                      </>
                    ) : null}
                    {canAdoptNextSlice ? (
                      <Text style={[styles.helpText, { marginTop: 8, color: colors.accentPrimary }]}>
                        Use Adopt next slice below to make this the current slice.
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </CollapsibleSection>
            ) : null}
            <TextInput
              testID="feature-sprint-spec-update-input"
              style={[styles.captureInput, { minHeight: 120, textAlignVertical: "top", marginTop: 8 }]}
              value={specUpdateImportText}
              onChangeText={setSpecUpdateImportText}
              placeholder="Paste output with a feature-spec-update fenced block"
              placeholderTextColor={colors.inputPlaceholder}
              multiline
            />
            <Pressable
              testID="feature-sprint-spec-update-import"
              style={[styles.secondaryAction, { marginTop: 12 }]}
              onPress={handleImportSpecUpdate}
            >
              <Text style={styles.secondaryActionText}>Import spec update</Text>
            </Pressable>

            <View style={[styles.cardActionsRow, { marginTop: 12, flexWrap: "wrap" }]}>
              {canAdoptNextSlice ? (
                <Pressable
                  testID="feature-sprint-adopt-next-slice"
                  style={styles.secondaryAction}
                  onPress={handleAdoptNextSlice}
                >
                  <Text style={styles.secondaryActionText}>Adopt next slice</Text>
                </Pressable>
              ) : null}
              <Pressable
                testID="feature-sprint-advance-step"
                style={styles.secondaryAction}
                onPress={handleAdvanceFeatureStep}
              >
                <Text style={styles.secondaryActionText}>Advance step</Text>
              </Pressable>
              <Pressable style={styles.secondaryAction} onPress={handleCompleteFeatureSprint}>
                <Text style={styles.secondaryActionText}>Mark feature complete</Text>
              </Pressable>
              <Pressable style={styles.secondaryAction} onPress={handleDeleteFeatureSprint}>
                <Text style={styles.secondaryActionText}>Delete plan</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </Section>

      <Section title="Plans">
        <Text style={styles.label}>Trigger Plan</Text>
        <Text style={styles.bodyText}>
          {card.triggerPlan?.cue} → {card.triggerPlan?.action}
        </Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Obstacle Plan</Text>
        <Text style={styles.bodyText}>{card.obstaclePlan?.plan}</Text>
      </Section>

      <Section title="Project metadata">
        <Text style={styles.helpText}>
          Optional repo/files/verify hints for agent context and task packets on this card.
        </Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Repo path</Text>
        <TextInput
          style={styles.captureInput}
          value={repoPath}
          onChangeText={setRepoPath}
          placeholder="C:/Users/me/Projects/life-harness"
          placeholderTextColor={colors.inputPlaceholder}
        />
        <Text style={[styles.label, { marginTop: 12 }]}>Branch</Text>
        <TextInput
          style={styles.captureInput}
          value={branch}
          onChangeText={setBranch}
          placeholder="main"
          placeholderTextColor={colors.inputPlaceholder}
        />
        <Text style={[styles.label, { marginTop: 12 }]}>Docs</Text>
        <TextInput
          style={[styles.captureInput, { minHeight: 80, textAlignVertical: "top" }]}
          value={docsText}
          onChangeText={setDocsText}
          placeholder="docs/01_final_design_doc.md"
          placeholderTextColor={colors.inputPlaceholder}
          multiline
        />
        <Text style={[styles.label, { marginTop: 12 }]}>Likely files</Text>
        <TextInput
          style={[styles.captureInput, { minHeight: 80, textAlignVertical: "top" }]}
          value={likelyFilesText}
          onChangeText={setLikelyFilesText}
          placeholder="src/core/agentTaskPacket.ts"
          placeholderTextColor={colors.inputPlaceholder}
          multiline
        />
        <Text style={[styles.label, { marginTop: 12 }]}>Verification commands</Text>
        <TextInput
          style={[styles.captureInput, { minHeight: 80, textAlignVertical: "top" }]}
          value={verificationCommandsText}
          onChangeText={setVerificationCommandsText}
          placeholder={"npm run typecheck\nnpm test -- agentTaskPacket"}
          placeholderTextColor={colors.inputPlaceholder}
          multiline
        />
        <Text style={[styles.label, { marginTop: 12 }]}>Default runner agent</Text>
        <View style={[styles.cardActionsRow, { marginTop: 8, flexWrap: "wrap" }]}>
          {(["codex", "cursor"] as const).map((agent) => (
            <Pressable
              key={agent}
              style={[
                styles.secondaryAction,
                projectDefaultRunnerAgent === agent && { borderColor: colors.accentPrimary }
              ]}
              onPress={() => setProjectDefaultRunnerAgent(agent)}
            >
              <Text style={styles.secondaryActionText}>{runnerAgentLabel(agent)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.helpText, { marginTop: 6 }]}>
          Saved with project metadata. Start feature uses this as the default runner agent toggle.
        </Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Notes</Text>
        <TextInput
          style={[styles.captureInput, { minHeight: 80, textAlignVertical: "top" }]}
          value={projectNotes}
          onChangeText={setProjectNotes}
          placeholder="Optional notes for agent packets"
          placeholderTextColor={colors.inputPlaceholder}
          multiline
        />
        <View style={styles.cardActionsRow}>
          <Pressable
            style={styles.secondaryAction}
            onPress={() => {
              const result = saveProjectForCard({
                cardId: card.id,
                repoPath: repoPath.trim() || undefined,
                branch: branch.trim() || undefined,
                docs: parseListField(docsText),
                likelyFiles: parseListField(likelyFilesText),
                verificationCommands: parseListField(verificationCommandsText),
                notes: projectNotes.trim() || undefined,
                defaultRunnerAgent: projectDefaultRunnerAgent
              });
              if (result.ok) {
                setRunnerAgent(
                  applyFeatureSprintProjectDefaultRunnerAgent(projectDefaultRunnerAgent)
                );
              }
              showNotice(result.ok ? "success" : "warning", result.message ?? "Could not save project.");
            }}
          >
            <Text style={styles.secondaryActionText}>Save project metadata</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryAction}
            onPress={() => {
              const result = clearProjectForCard(card.id);
              setRepoPath("");
              setBranch("");
              setDocsText("");
              setLikelyFilesText("");
              setVerificationCommandsText("");
              setProjectNotes("");
              setProjectDefaultRunnerAgent(clearFeatureSprintProjectRunnerAgentDefault());
              setRunnerAgent(clearFeatureSprintProjectRunnerAgentDefault());
              showNotice(result.ok ? "success" : "warning", result.message ?? "Could not clear project.");
            }}
          >
            <Text style={styles.secondaryActionText}>Clear project metadata</Text>
          </Pressable>
        </View>
      </Section>

      <Section title="Agent sessions">
        <Text style={styles.helpText}>
          Record what you sent to Codex/Cursor and what came back. Save first, then Mark done.
        </Text>
        <Pressable style={[styles.secondaryAction, { marginTop: 12 }]} onPress={openNewSessionForm}>
          <Text style={styles.secondaryActionText}>Log agent session</Text>
        </Pressable>

        {cardAgentSessions.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Recent sessions</Text>
            {cardAgentSessions.map((session) => (
              <Pressable key={session.id} onPress={() => openExistingSessionForm(session)}>
                <Text style={styles.listItem}>
                  ▸ {session.agent} · {session.status} · {session.taskName}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={[styles.emptyText, { marginTop: 12 }]}>
            Delegate from Agent Workbench or log a session here.
          </Text>
        )}

        {sessionFormOpen ? (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Agent</Text>
            <TextInput
              style={styles.captureInput}
              value={sessionAgent}
              onChangeText={setSessionAgent}
              placeholder="codex"
              placeholderTextColor={colors.inputPlaceholder}
              autoCapitalize="none"
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Task name</Text>
            <TextInput
              style={styles.captureInput}
              value={sessionTaskName}
              onChangeText={setSessionTaskName}
              placeholderTextColor={colors.inputPlaceholder}
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Goal</Text>
            <TextInput
              style={[styles.captureInput, { minHeight: 80, textAlignVertical: "top" }]}
              value={sessionGoal}
              onChangeText={setSessionGoal}
              placeholderTextColor={colors.inputPlaceholder}
              multiline
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Result summary</Text>
            <TextInput
              style={[styles.captureInput, { minHeight: 80, textAlignVertical: "top" }]}
              value={sessionResultSummary}
              onChangeText={setSessionResultSummary}
              placeholderTextColor={colors.inputPlaceholder}
              multiline
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Files changed</Text>
            <TextInput
              style={[styles.captureInput, { minHeight: 80, textAlignVertical: "top" }]}
              value={sessionFilesChangedText}
              onChangeText={setSessionFilesChangedText}
              placeholder="src/core/agentSessionLog.ts"
              placeholderTextColor={colors.inputPlaceholder}
              multiline
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Verification commands</Text>
            <TextInput
              style={[styles.captureInput, { minHeight: 80, textAlignVertical: "top" }]}
              value={sessionVerificationCommandsText}
              onChangeText={setSessionVerificationCommandsText}
              placeholder={"npm test -- agentSessionLog"}
              placeholderTextColor={colors.inputPlaceholder}
              multiline
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Verification result</Text>
            <TextInput
              style={styles.captureInput}
              value={sessionVerificationResult}
              onChangeText={setSessionVerificationResult}
              placeholderTextColor={colors.inputPlaceholder}
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Commit hash</Text>
            <TextInput
              style={styles.captureInput}
              value={sessionCommitHash}
              onChangeText={setSessionCommitHash}
              placeholderTextColor={colors.inputPlaceholder}
              autoCapitalize="none"
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Follow-ups</Text>
            <TextInput
              style={[styles.captureInput, { minHeight: 80, textAlignVertical: "top" }]}
              value={sessionFollowUpsText}
              onChangeText={setSessionFollowUpsText}
              placeholderTextColor={colors.inputPlaceholder}
              multiline
            />
            <View style={styles.cardActionsRow}>
              <Pressable
                style={styles.secondaryAction}
                onPress={() => {
                  const input = buildSessionInputFromForm(card.id, currentSessionForm());
                  if (!input.taskName || !input.goal) {
                    showNotice("warning", "Task name and goal are required.");
                    return;
                  }
                  if (selectedSessionId) {
                    const result = updateAgentSession(selectedSessionId, input);
                    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not update session.");
                    return;
                  }
                  const result = createAgentSessionForCard(input);
                  if (result.ok && result.sessionId) {
                    setSelectedSessionId(result.sessionId);
                  }
                  showNotice(result.ok ? "success" : "warning", result.message ?? "Could not save session.");
                }}
              >
                <Text style={styles.secondaryActionText}>Save session</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.secondaryAction,
                  !selectedSessionId && { opacity: 0.5 }
                ]}
                disabled={!selectedSessionId}
                onPress={() => {
                  if (!selectedSessionId) {
                    showNotice("warning", "Save the session before marking done.");
                    return;
                  }
                  const result = completeAgentSession(
                    selectedSessionId,
                    buildSessionInputFromForm(card.id, currentSessionForm())
                  );
                  showNotice(result.ok ? "success" : "warning", result.message ?? "Could not complete session.");
                }}
              >
                <Text style={styles.secondaryActionText}>Mark done</Text>
              </Pressable>
              {selectedSessionId ? (
                <Pressable
                  style={styles.secondaryAction}
                  onPress={() => {
                    const result = deleteAgentSession(selectedSessionId);
                    closeSessionForm();
                    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not delete session.");
                  }}
                >
                  <Text style={styles.secondaryActionText}>Delete</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.secondaryAction} onPress={closeSessionForm}>
                <Text style={styles.secondaryActionText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Section>
      </CollapsibleSection>

      <CollapsibleSection title="Backroom — resume details" defaultOpen={false}>
      {card.resumePacket && !card.careerApplication ? (
        <Section title="Resume Packet">
          <Text style={styles.label}>Last State</Text>
          <Text style={styles.bodyText}>{card.resumePacket.lastState}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Re-entry Action</Text>
          <Text style={styles.bodyText}>{card.resumePacket.reentryAction}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Open Loops</Text>
          {card.resumePacket.openLoops.length === 0 ? (
            <Text style={styles.emptyText}>No open loops yet.</Text>
          ) : (
            card.resumePacket.openLoops.map((loop) => (
              <Text key={loop} style={styles.listItem}>
                ▸ {loop}
              </Text>
            ))
          )}
        </Section>
      ) : null}

      </CollapsibleSection>

      <CollapsibleSection title="Backroom — history" defaultOpen={false}>
      <Section title="Older wins">
        {card.recentWins.length === 0 ? (
          <Text style={styles.emptyText}>No wins recorded yet.</Text>
        ) : (
          card.recentWins.map((win) => (
            <Text key={win} style={styles.listItem}>
              ▸ {win}
            </Text>
          ))
        )}
      </Section>

      <Section title="Optimization Parking Lot">
        {card.optimizationIdeas.length === 0 ? (
          <Text style={styles.emptyText}>No optimization ideas parked yet.</Text>
        ) : (
          card.optimizationIdeas.map((idea) => (
            <Text key={idea} style={styles.listItem}>
              ▸ {idea}
            </Text>
          ))
        )}
      </Section>
      </CollapsibleSection>
        </>
      )}
        </>
      )}
    </Screen>
  );
}
