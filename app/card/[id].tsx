import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { CardStateButtons } from "../../src/components/CardStateButtons";
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
import { getFollowUpsDue } from "../../src/core/career";
import { buildCardContextPacket } from "../../src/core/harnessContextGraph";
import {
  formatListField,
  getProjectForCard,
  parseListField
} from "../../src/core/projectRegistry";
import { AREA_LABELS, CARD_STATE_LABELS, ROLE_TYPE_LABELS, WARMTH_LABELS } from "../../src/core/labels";
import { buildNextMoveSummary } from "../../src/core/nextMoveContract";
import { computeCardProgress } from "../../src/core/progress";
import { packResumeDocxBlob, type ResumeProfile } from "../../src/core/resumeDocx";
import {
  RESUME_MODULE_SECTION_LABELS,
  RESUME_MODULE_SECTION_ORDER
} from "../../src/core/resumeModuleBank";
import { buildApplicationResumeReadiness } from "../../src/core/resumeReadiness";
import { computeCardWarmth } from "../../src/core/warmth";
import { useLifeHarness } from "../../src/state/LifeHarnessState";
import type { HarnessAgentSession, HarnessProject, LifeCard } from "../../src/core/types";

const READINESS_LABELS = {
  blocked: "Blocked",
  needs_patch: "Needs patch",
  ready_to_export: "Ready to export"
} as const;

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
  const { id } = useLocalSearchParams<{ id: string }>();
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
    careerSourcePack,
    saveProjectForCard,
    clearProjectForCard,
    createAgentSessionForCard,
    updateAgentSession,
    completeAgentSession,
    deleteAgentSession
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
      careerSourcePack
    };
  }

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

  const cardProof = proofItems.filter((proof) => card.proofItemIds.includes(proof.id));
  const resumeDraftPacket = card.careerApplication?.resumeDraftPacket;
  const moduleById = new Map(resumeModules.map((module) => [module.id, module]));
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
      showNotice(
        "warning",
        `Cannot export resume: ${resumeReadiness.exportReadiness.reason ?? resumeReadiness.nextTinyResumeAction}`
      );
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

    const blob = await packResumeDocxBlob(result.draft);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice("success", "Resume DOCX downloaded.");
  }

  const lifeHarnessData = lifeHarnessDataForCard();
  const cardAgentSessions = getAgentSessionsForCard(lifeHarnessData, card.id).slice(0, 5);
  const now = new Date();
  const nextMove = buildNextMoveSummary(lifeHarnessData, { now });
  const todayMoveForCard = [nextMove.primary, nextMove.backup, ...nextMove.candidates].find(
    (contract) => contract?.cardId === card.id
  );
  const followUpDue = getFollowUpsDue(cards, now).some((item) => item.id === card.id);
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

  return (
    <Screen>
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

      <Section title={card.title}>
        <Text style={styles.bodyText}>
          {AREA_LABELS[card.area]} · {warmth ? WARMTH_LABELS[warmth] : "unknown"} · {card.state}
        </Text>
      </Section>

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
          <Text style={styles.emptyText}>No proof linked yet.</Text>
        ) : (
          cardProof.map((proof) => (
            <Text key={proof.id} style={styles.listItem}>
              ▸ {proof.title}
            </Text>
          ))
        )}
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

      {card.careerApplication && resumeReadiness ? (
        <Section title="Career">
          <Text style={styles.titleText}>
            {card.careerApplication.company} · {card.careerApplication.roleTitle}
          </Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Follow-up</Text>
          <Text style={styles.bodyText}>
            {card.careerApplication.followUpDate
              ? `${card.careerApplication.followUpDate}${followUpDue ? " · due" : ""}`
              : "No follow-up scheduled"}
          </Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Resume readiness</Text>
          <Text style={styles.bodyText}>{READINESS_LABELS[resumeReadiness.status]}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Next resume action</Text>
          <Text style={styles.bodyText}>{resumeReadiness.nextTinyResumeAction}</Text>
          {resumeDraftPacket ? (
            <Pressable
              style={[
                styles.secondaryAction,
                { marginTop: 12 },
                resumeReadiness.exportReadiness.canExportDocx === false && { opacity: 0.7 }
              ]}
              onPress={() => void handleBuildResumeDocx()}
            >
              <Text style={styles.secondaryActionText}>Build Resume DOCX</Text>
            </Pressable>
          ) : null}
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
            source of truth.
          </Text>
          <View style={[styles.cardActionsRow, { marginTop: 12 }]}>
            <Pressable style={styles.secondaryAction} onPress={handleCopyAgentContext}>
              <Text style={styles.secondaryActionText}>Copy agent context</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={handleCopyAgentTaskPacket}>
              <Text style={styles.secondaryActionText}>Copy agent task packet</Text>
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
                notes: projectNotes.trim() || undefined
              });
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
          <Text style={[styles.emptyText, { marginTop: 12 }]}>No agent sessions logged yet.</Text>
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

      {card.careerApplication && resumeReadiness ? (
        <Section title="Resume Readiness / Hardening">
          <Text style={styles.titleText}>{READINESS_LABELS[resumeReadiness.status]}</Text>
          <Text style={styles.bodyText}>{resumeReadiness.nextTinyResumeAction}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>DOCX Export</Text>
          <Text style={styles.bodyText}>
            {resumeReadiness.exportReadiness.canExportDocx
              ? "Can export DOCX for manual review."
              : resumeReadiness.exportReadiness.reason}
          </Text>

          <Text style={[styles.label, { marginTop: 12 }]}>Selected Modules</Text>
          {RESUME_MODULE_SECTION_ORDER.map((section) => {
            const modules = resumeReadiness.selectedModulesBySection[section];
            return (
              <View key={section} style={{ marginTop: 6 }}>
                <Text style={styles.helpText}>{RESUME_MODULE_SECTION_LABELS[section]}</Text>
                {modules.length === 0 ? (
                  <Text style={styles.emptyText}>No selected module.</Text>
                ) : (
                  modules.map((module) => (
                    <Text key={module.id} style={styles.listItem}>
                      - {module.title}
                    </Text>
                  ))
                )}
              </View>
            );
          })}

          <Text style={[styles.label, { marginTop: 12 }]}>Missing / cautions</Text>
          {resumeReadiness.warnings.length === 0 ? (
            <Text style={styles.emptyText}>No missing evidence or cautions.</Text>
          ) : (
            resumeReadiness.warnings.slice(0, 8).map((warning) => (
              <Text key={warning.id} style={styles.listItem}>
                - {warning.message}
              </Text>
            ))
          )}

          <View style={styles.cardActionsRow}>
            <Link href="/resume-bank" asChild>
              <Pressable style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>Resume Bank</Text>
              </Pressable>
            </Link>
            <Link href="/career-pack" asChild>
              <Pressable style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>Career Pack</Text>
              </Pressable>
            </Link>
          </View>
        </Section>
      ) : null}

      {card.careerApplication ? (
        <Section title="Career Application">
          <Text style={styles.label}>Company</Text>
          <Text style={styles.bodyText}>{card.careerApplication.company}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Role</Text>
          <Text style={styles.bodyText}>{card.careerApplication.roleTitle}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Role Type</Text>
          <Text style={styles.bodyText}>{ROLE_TYPE_LABELS[card.careerApplication.roleType]}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Status</Text>
          <Text style={styles.bodyText}>
            {CARD_STATE_LABELS[card.careerApplication.applicationStatus]}
          </Text>
          {card.careerApplication.sourceUrl ? (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Source URL</Text>
              <Text style={styles.bodyText}>{card.careerApplication.sourceUrl}</Text>
            </>
          ) : null}
          <Text style={[styles.label, { marginTop: 12 }]}>Resume Angle</Text>
          <Text style={styles.bodyText}>{card.careerApplication.resumeAngle}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Projects to Emphasize</Text>
          <Text style={styles.bodyText}>{card.careerApplication.projectsToEmphasize}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Bullets / Skills to Emphasize</Text>
          <Text style={styles.bodyText}>{card.careerApplication.bulletsToEmphasize ?? "(not set)"}</Text>
          {resumeDraftPacket ? (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Resume Draft Packet</Text>
              <Text style={styles.bodyText}>{resumeDraftPacket.nextTinyAction}</Text>
              <Pressable
                style={[
                  styles.secondaryAction,
                  resumeReadiness?.exportReadiness.canExportDocx === false && { opacity: 0.7 }
                ]}
                onPress={handleBuildResumeDocx}
              >
                <Text style={styles.secondaryActionText}>Build Resume DOCX</Text>
              </Pressable>
              <Text style={[styles.helpText, { marginTop: 8 }]}>
                v0.1 export uses the sample profile fixture for the header until resume profile
                settings ship.
              </Text>
              <Text style={[styles.label, { marginTop: 12 }]}>Selected Modules</Text>
              {resumeDraftPacket.selectedModuleIds.length === 0 ? (
                <Text style={styles.emptyText}>No modules selected yet.</Text>
              ) : (
                resumeDraftPacket.selectedModuleIds.map((moduleId) => {
                  const module = moduleById.get(moduleId);
                  return (
                    <Text key={moduleId} style={styles.listItem}>
                      - {module?.title ?? moduleId}
                    </Text>
                  );
                })
              )}
              <Text style={[styles.label, { marginTop: 12 }]}>Section Coverage</Text>
              <Text style={styles.bodyText}>
                {resumeDraftPacket.sectionCoverage.length > 0
                  ? resumeDraftPacket.sectionCoverage
                      .map((section) => RESUME_MODULE_SECTION_LABELS[section])
                      .join(", ")
                  : "No sections covered yet."}
              </Text>
              <Text style={[styles.label, { marginTop: 12 }]}>Packet Patches</Text>
              {resumeDraftPacket.missingEvidence.length === 0 ? (
                <Text style={styles.emptyText}>No packet patches flagged.</Text>
              ) : (
                resumeDraftPacket.missingEvidence.slice(0, 5).map((issue) => (
                  <Text key={`${issue.moduleId}-${issue.message}`} style={styles.listItem}>
                    - {issue.moduleTitle}: {issue.message}
                  </Text>
                ))
              )}
            </>
          ) : null}
          {card.careerApplication.followUpDate ? (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Follow-up Date</Text>
              <Text style={styles.bodyText}>{card.careerApplication.followUpDate}</Text>
            </>
          ) : null}
          {card.careerApplication.jobCandidateId ? (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Linked Candidate</Text>
              <Text style={styles.bodyText}>{card.careerApplication.jobCandidateId}</Text>
            </>
          ) : null}
          <Text style={[styles.label, { marginTop: 12 }]}>Job Description</Text>
          <Text style={styles.bodyText} numberOfLines={8}>
            {card.careerApplication.jobDescription}
          </Text>
        </Section>
      ) : null}

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
        </>
      )}
    </Screen>
  );
}
