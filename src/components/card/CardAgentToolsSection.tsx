import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { Section } from "../Section";
import { colors, styles } from "../styles";
import {
  buildAgentSessionCreateInputFromTaskPacket,
  buildAgentTaskPacket,
  buildDefaultAgentTaskPacketInput,
  resolveDefaultTaskGoal
} from "../../core/agentTaskPacket";
import {
  getAgentSessionsForCard,
  normalizeAgentKind,
  type HarnessAgentSessionCreateInput
} from "../../core/agentSessionLog";
import { buildCardContextPacket } from "../../core/harnessContextGraph";
import {
  formatListField,
  getProjectForCard,
  parseListField
} from "../../core/projectRegistry";
import { canCopyTextToClipboard, copyTextToClipboard } from "../../core/askHarnessSynthesis";
import { useLifeHarness } from "../../state/LifeHarnessState";
import type { HarnessAgentSession, HarnessProject, LifeCard } from "../../core/types";

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

export type CardAgentToolsLayout = "sections" | "embedded";

interface CardAgentToolsSectionProps {
  card: LifeCard;
  layout?: CardAgentToolsLayout;
  showCopyButtons?: boolean;
  onNotice: (kind: "success" | "warning" | "info", message: string) => void;
}

export function CardAgentToolsSection({
  card,
  layout = "sections",
  showCopyButtons = false,
  onNotice
}: CardAgentToolsSectionProps) {
  const lifeHarness = useLifeHarness();
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
    deleteAgentSession
  } = lifeHarness;

  const lifeHarnessData = {
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

  useEffect(() => {
    const project = getProjectForCard(lifeHarnessData, card.id);
    setRepoPath(project?.repoPath ?? "");
    setBranch(project?.branch ?? "");
    setDocsText(formatListField(project?.docs));
    setLikelyFilesText(formatListField(project?.likelyFiles));
    setVerificationCommandsText(formatListField(project?.verificationCommands));
    setProjectNotes(project?.notes ?? "");
  }, [card.id, projects, agentSessions]);

  const cardAgentSessions = getAgentSessionsForCard(lifeHarnessData, card.id).slice(0, 5);

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
    const project = getProjectForCard(lifeHarnessData, card.id);
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

  async function copyMarkdownToClipboard(
    buildMarkdown: () => { ok: true; markdown: string } | { ok: false; error: string },
    successMessage: string
  ) {
    const result = buildMarkdown();
    if (!result.ok) {
      onNotice("warning", result.error);
      return;
    }

    const copied = await copyTextToClipboard(result.markdown);
    if (!copied) {
      onNotice("warning", "Clipboard unavailable.");
      return;
    }

    onNotice("success", successMessage);
  }

  async function handleCopyTaskPacketAndLogSent() {
    if (isCopyLogging) {
      return;
    }

    setIsCopyLogging(true);
    try {
      const result = buildAgentTaskPacket(
        lifeHarnessData,
        buildDefaultAgentTaskPacketInput(card)
      );
      if (!result.ok) {
        onNotice("warning", result.error);
        return;
      }

      const copied = await copyTextToClipboard(result.markdown);
      if (!copied) {
        onNotice("warning", "Clipboard unavailable.");
        return;
      }

      const sessionResult = createAgentSessionForCard(
        buildAgentSessionCreateInputFromTaskPacket(result.packet, result.markdown)
      );
      if (sessionResult.ok) {
        onNotice("success", "Task packet copied and session logged.");
      } else {
        onNotice("warning", "Task packet copied, but session was not logged.");
      }
    } finally {
      setIsCopyLogging(false);
    }
  }

  const projectMetadata = (
    <>
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
            onNotice(result.ok ? "success" : "warning", result.message ?? "Could not save project.");
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
            onNotice(result.ok ? "success" : "warning", result.message ?? "Could not clear project.");
          }}
        >
          <Text style={styles.secondaryActionText}>Clear project metadata</Text>
        </Pressable>
      </View>
    </>
  );

  const agentSessionsPanel = (
    <>
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
                  onNotice("warning", "Task name and goal are required.");
                  return;
                }
                if (selectedSessionId) {
                  const result = updateAgentSession(selectedSessionId, input);
                  onNotice(result.ok ? "success" : "warning", result.message ?? "Could not update session.");
                  return;
                }
                const result = createAgentSessionForCard(input);
                if (result.ok && result.sessionId) {
                  setSelectedSessionId(result.sessionId);
                }
                onNotice(result.ok ? "success" : "warning", result.message ?? "Could not save session.");
              }}
            >
              <Text style={styles.secondaryActionText}>Save session</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryAction, !selectedSessionId && { opacity: 0.5 }]}
              disabled={!selectedSessionId}
              onPress={() => {
                if (!selectedSessionId) {
                  onNotice("warning", "Save the session before marking done.");
                  return;
                }
                const result = completeAgentSession(
                  selectedSessionId,
                  buildSessionInputFromForm(card.id, currentSessionForm())
                );
                onNotice(result.ok ? "success" : "warning", result.message ?? "Could not complete session.");
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
                  onNotice(result.ok ? "success" : "warning", result.message ?? "Could not delete session.");
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
    </>
  );

  const copyButtons =
    showCopyButtons && canCopyTextToClipboard() ? (
      <View style={[styles.cardActionsRow, { marginBottom: 12 }]}>
        <Pressable
          style={styles.secondaryAction}
          onPress={() => {
            void copyMarkdownToClipboard(
              () => buildCardContextPacket(lifeHarnessData, card.id),
              "Agent context copied."
            );
          }}
        >
          <Text style={styles.secondaryActionText}>Copy agent context</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryAction}
          onPress={() => {
            void copyMarkdownToClipboard(
              () => buildAgentTaskPacket(lifeHarnessData, buildDefaultAgentTaskPacketInput(card)),
              "Agent task packet copied."
            );
          }}
        >
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
    ) : null;

  if (layout === "embedded") {
    return (
      <View style={{ gap: 16 }}>
        {copyButtons}
        <View>
          <Text style={styles.lofiTapeLabel}>Project metadata</Text>
          {projectMetadata}
        </View>
        <View>
          <Text style={styles.lofiTapeLabel}>Agent sessions</Text>
          {agentSessionsPanel}
        </View>
      </View>
    );
  }

  return (
    <>
      {copyButtons}
      <Section title="Project metadata">{projectMetadata}</Section>
      <Section title="Agent sessions">{agentSessionsPanel}</Section>
    </>
  );
}
