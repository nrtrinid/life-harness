import { Link, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { CareerApplicationCardDetail } from "../../src/components/career/CareerApplicationCardDetail";
import { CardStateButtons } from "../../src/components/CardStateButtons";
import { FeatureRunnerOutputDetails } from "../../src/components/featureSprint/FeatureRunnerOutputDetails";
import { FeatureSprintActionGuide } from "../../src/components/featureSprint/FeatureSprintActionGuide";
import { FeatureSprintFlowGuide } from "../../src/components/featureSprint/FeatureSprintFlowGuide";
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
  buildFeatureStepImplementationPacket,
  buildFeatureStepReviewPacket,
  getActiveFeatureSprintPlanForCard
} from "../../src/core/featureSprintOrchestrator";
import { buildFeatureSprintActionGuide } from "../../src/core/featureSprintActionGuide";
import {
  buildFeatureSprintDogfoodSummary,
  type FeatureSprintDogfoodCheckStatus
} from "../../src/core/featureSprintDogfood";
import {
  buildRunnerProfile,
  formatRunnerProfileLabel,
  isImplementationProfile,
  isReviewProfile,
  isScopingProfile,
  runnerAgentLabel,
  type FeatureSprintRunnerAgent
} from "../../src/core/featureSprintRunner";
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
  HarnessFeatureSprintRunnerRun,
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
    advanceFeatureSprintStep,
    completeFeatureSprintPlan,
    deleteFeatureSprintPlan,
    importFeatureSprintPlanForCard,
    importFeatureReviewVerdictForPlan,
    createFeatureSprintRunnerRun,
    completeFeatureSprintRunnerRun,
    markMostRecentFeatureSprintRunnerRunImported,
    markFeatureSprintRunnerRunWorktreeCleanup,
    logResumeExportForCard,
    backfillResumeDraftPacket,
    toggleResumeDraftPacketModule,
    setResumeDraftPacketModuleForSection,
    addDefaultResumeModulesToPacket,
    patchResumeModule,
    setCardState
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
  const [reviewImportText, setReviewImportText] = useState("");
  const [agentOutputText, setAgentOutputText] = useState("");
  const [runnerHealth, setRunnerHealth] = useState<"unknown" | "available" | "unavailable">(
    "unknown"
  );
  const [runnerHealthProbe, setRunnerHealthProbe] = useState<
    FeatureSprintRunnerHealthProbe | undefined
  >(undefined);
  const [runnerAgent, setRunnerAgent] = useState<FeatureSprintRunnerAgent>("codex");
  const [projectDefaultRunnerAgent, setProjectDefaultRunnerAgent] =
    useState<FeatureSprintRunnerAgent>("codex");
  const [isCheckingRunner, setIsCheckingRunner] = useState(false);
  const [isRunningScoping, setIsRunningScoping] = useState(false);
  const [isRunningReview, setIsRunningReview] = useState(false);
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
    setRunnerAgent(defaultAgent);
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
        reviewVerdictImported: currentFeatureStep?.reviewStatus === "accepted",
        scopingOutputReady: Boolean(
          latestScopingRun?.outputText?.trim() || latestScopingRun?.outputExcerpt?.trim()
        ),
        planImportTextReady: Boolean(planImportText.trim())
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
      planImportText
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

  function handleSaveAgentOutput() {
    if (!activeFeatureSprintPlan?.currentStepId) {
      showNotice("warning", "No current step to save output on.");
      return;
    }
    const result = updateFeatureSprintStep(
      activeFeatureSprintPlan.id,
      activeFeatureSprintPlan.currentStepId,
      {
        outputSummary: agentOutputText.trim() || undefined,
        status: "sent"
      }
    );
    showNotice(result.ok ? "success" : "warning", result.message ?? "Could not save agent output.");
  }

  function handleImportReviewVerdict() {
    if (!activeFeatureSprintPlan) {
      showNotice("warning", "No active feature sprint plan.");
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
    markMostRecentFeatureSprintRunnerRunImported({
      cardId,
      profile: "codex_review",
      planId: activeFeatureSprintPlan.id,
      stepId: activeFeatureSprintPlan.currentStepId
    });
    setReviewImportText("");
    showNotice("success", result.message ?? "Review verdict imported.");
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
        showNotice("warning", result.error ?? `${runnerAgentLabel(runnerAgent)} scoping run failed.`);
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

  async function handleRunReview() {
    if (!activeFeatureSprintPlan || isRunningReview) {
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
    const historyCreate = createFeatureSprintRunnerRun({
      profile,
      cardId,
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
        repoPath: project?.repoPath
      });

      if (historyCreate.ok && historyCreate.runId) {
        completeFeatureSprintRunnerRun(historyCreate.runId, result);
      }

      if (!result.ok || !result.outputText) {
        showNotice("warning", result.error ?? `${runnerAgentLabel(runnerAgent)} review run failed.`);
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
    const historyCreate = createFeatureSprintRunnerRun({
      profile,
      cardId,
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
        runVerification: Boolean(project.verificationCommands?.length)
      });

      if (historyCreate.ok && historyCreate.runId) {
        completeFeatureSprintRunnerRun(historyCreate.runId, result);
      }

      if (!result.ok) {
        showNotice("warning", result.error ?? "Implementation run failed.");
        return;
      }

      setAgentOutputText(composeImplementationRunnerOutputSummary(result));
      if (historyCreate.ok && historyCreate.runId) {
        setSelectedRunnerRunId(historyCreate.runId);
      }
      const hasVerifyFailure = result.verificationResults?.some((row) => row.status === "failed");
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

      <CollapsibleSection title="Backroom — sprint & metadata" defaultOpen={false}>
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
                </Text>
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
                  ?.filter((row) => row.status === "failed")
                  .slice(0, 1)
                  .map((failed) => {
                    const detail = failed.error ?? failed.stderrExcerpt ?? failed.stdoutExcerpt;
                    const line = detail ? detail.split("\n")[0] : undefined;
                    return (
                      <Text key={`${run.id}-verify-fail`} style={[styles.helpText, { marginTop: 4 }]}>
                        {line ? `Failed: ${failed.command} — ${line}` : `Failed: ${failed.command}`}
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

        {activeFeatureSprintPlan || canCopyTextToClipboard() ? (
          <View style={[styles.cardActionsRow, { marginTop: 12, flexWrap: "wrap" }]}>
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
                <Text style={styles.secondaryActionText}>Copy implementation prompt</Text>
              </Pressable>
            ) : null}
            {activeFeatureSprintPlan?.currentStepId ? (
              <Pressable
                style={[styles.secondaryAction, isRunningImplementation && { opacity: 0.5 }]}
                disabled={isRunningImplementation}
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
            ) : null}
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
                <Text style={styles.secondaryActionText}>Copy review packet</Text>
              </Pressable>
            ) : null}
            {activeFeatureSprintPlan ? (
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
            ) : null}
          </View>
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
          style={[styles.captureInput, { minHeight: 100, textAlignVertical: "top", marginTop: 8 }]}
          value={planImportText}
          onChangeText={setPlanImportText}
          placeholder="Paste output with a feature-sprint-plan fenced block"
          placeholderTextColor={colors.inputPlaceholder}
          multiline
        />
        <Pressable style={[styles.secondaryAction, { marginTop: 12 }]} onPress={handleImportFeaturePlan}>
          <Text style={styles.secondaryActionText}>Import plan</Text>
        </Pressable>

        {activeFeatureSprintPlan ? (
          <>
            <Text style={[styles.label, { marginTop: 12 }]}>Agent output</Text>
            <Text style={styles.helpText}>
              Runner filled this box. Inspect the expanded run in Recent runner runs, then click Save agent
              output. Continue with review → import verdict → advance step.
            </Text>
            {showAgentOutputReadyHelper ? (
              <Text style={[styles.helpText, { marginTop: 4, marginBottom: 8, color: colors.accentPrimary }]}>
                Ready to save — follow the checklist above: View details (if collapsed) → Save agent output →
                Run review → Import review verdict → Advance step.
              </Text>
            ) : null}
            <TextInput
              style={[styles.captureInput, { minHeight: 100, textAlignVertical: "top" }]}
              value={agentOutputText}
              onChangeText={setAgentOutputText}
              placeholder="Paste implementation agent output"
              placeholderTextColor={colors.inputPlaceholder}
              multiline
            />
            <Pressable
              style={[styles.secondaryAction, { marginTop: 12 }]}
              onPress={handleSaveAgentOutput}
            >
              <Text style={styles.secondaryActionText}>Save agent output</Text>
            </Pressable>

            <Text style={[styles.label, { marginTop: 12 }]}>Import review verdict</Text>
            <TextInput
              style={[styles.captureInput, { minHeight: 100, textAlignVertical: "top" }]}
              value={reviewImportText}
              onChangeText={setReviewImportText}
              placeholder="Paste reviewer output with feature-review-verdict block"
              placeholderTextColor={colors.inputPlaceholder}
              multiline
            />
            <Pressable
              style={[styles.secondaryAction, { marginTop: 12 }]}
              onPress={handleImportReviewVerdict}
            >
              <Text style={styles.secondaryActionText}>Import review verdict</Text>
            </Pressable>

            <View style={[styles.cardActionsRow, { marginTop: 12 }]}>
              <Pressable style={styles.secondaryAction} onPress={handleAdvanceFeatureStep}>
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
                setRunnerAgent(projectDefaultRunnerAgent);
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
              setProjectDefaultRunnerAgent("codex");
              setRunnerAgent("codex");
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
