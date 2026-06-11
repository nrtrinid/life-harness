import { Link } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Notice, type NoticeState } from "../src/components/Notice";
import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import {
  buildAgentSessionCreateInputFromTaskPacket,
  buildAgentTaskPacket,
  buildDefaultAgentTaskPacketInput
} from "../src/core/agentTaskPacket";
import {
  buildAgentWorkbenchSummary,
  type AgentWorkbenchReadyCard,
  type AgentWorkbenchSessionRow
} from "../src/core/agentWorkbench";
import { canCopyTextToClipboard, copyTextToClipboard } from "../src/core/askHarnessSynthesis";
import type { LifeHarnessData } from "../src/core/actions";
import type { HarnessAgentSessionCreateInput } from "../src/core/agentSessionLog";
import type { LifeCard } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

function formatWorkbenchDate(iso: string | undefined): string {
  if (!iso) {
    return "—";
  }

  return iso.slice(0, 16).replace("T", " ");
}

async function copyAgentTaskPacketForCard(options: {
  data: LifeHarnessData;
  card: LifeCard;
  logSent: boolean;
  createAgentSessionForCard: (
    input: HarnessAgentSessionCreateInput
  ) => { ok: boolean; message?: string; sessionId?: string };
  onNotice: (kind: NoticeState["kind"], message: string) => void;
}): Promise<void> {
  const result = buildAgentTaskPacket(options.data, buildDefaultAgentTaskPacketInput(options.card));
  if (!result.ok) {
    options.onNotice("warning", result.error);
    return;
  }

  const copied = await copyTextToClipboard(result.markdown);
  if (!copied) {
    options.onNotice("warning", "Clipboard unavailable.");
    return;
  }

  if (!options.logSent) {
    options.onNotice("success", "Agent task packet copied.");
    return;
  }

  const sessionResult = options.createAgentSessionForCard(
    buildAgentSessionCreateInputFromTaskPacket(result.packet, result.markdown)
  );
  if (sessionResult.ok) {
    options.onNotice("success", "Task packet copied and session logged.");
  } else {
    options.onNotice("warning", "Task packet copied, but session was not logged.");
  }
}

function SessionRow({
  row,
  showCompletedDate = false
}: {
  row: AgentWorkbenchSessionRow;
  showCompletedDate?: boolean;
}) {
  const dateLabel = showCompletedDate ? "Completed" : "Updated";
  const dateValue = showCompletedDate ? row.completedAt ?? row.updatedAt : row.updatedAt;

  return (
    <View style={[styles.cardTile, { marginTop: 12 }]}>
      <Text style={styles.titleText}>{row.taskName}</Text>
      <Text style={styles.bodyText}>
        {row.cardTitle} · {row.agent} · {row.status}
      </Text>
      {row.projectName || row.repoPath ? (
        <Text style={styles.helpText}>
          {[row.projectName, row.repoPath].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
      <Text style={styles.helpText}>
        {dateLabel}: {formatWorkbenchDate(dateValue)}
      </Text>
      {row.resultSummary ? <Text style={styles.bodyText}>Result: {row.resultSummary}</Text> : null}
      {row.verificationResult ? (
        <Text style={styles.bodyText}>Verification: {row.verificationResult}</Text>
      ) : null}
      {row.commitHash ? <Text style={styles.bodyText}>Commit: {row.commitHash}</Text> : null}
      <View style={[styles.cardActionsRow, { marginTop: 8 }]}>
        <Link href={`/card/${row.cardId}`} asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Open card</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

function ReadyCardRow({
  row,
  canCopy,
  isCopyLogging,
  onCopyTaskPacket,
  onCopyAndLogSent
}: {
  row: AgentWorkbenchReadyCard;
  canCopy: boolean;
  isCopyLogging: boolean;
  onCopyTaskPacket: () => void;
  onCopyAndLogSent: () => void;
}) {
  return (
    <View style={[styles.cardTile, { marginTop: 12 }]}>
      <Text style={styles.titleText}>{row.title}</Text>
      <Text style={styles.bodyText}>
        {row.state} · {row.area}
        {row.hasVerificationCommands ? " · verify commands" : ""}
      </Text>
      {row.projectName || row.repoPath ? (
        <Text style={styles.helpText}>
          {[row.projectName, row.repoPath].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
      <Text style={styles.bodyText}>Next: {row.nextTinyAction}</Text>
      <View style={[styles.cardActionsRow, { marginTop: 8 }]}>
        <Link href={`/card/${row.cardId}`} asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Open card</Text>
          </Pressable>
        </Link>
        {canCopy ? (
          <>
            <Pressable style={styles.smallButton} onPress={onCopyTaskPacket}>
              <Text style={styles.smallButtonText}>Copy task packet</Text>
            </Pressable>
            <Pressable
              style={[styles.smallButton, isCopyLogging && { opacity: 0.5 }]}
              disabled={isCopyLogging}
              onPress={onCopyAndLogSent}
            >
              <Text style={styles.smallButtonText}>Copy + log sent</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

export default function AgentWorkbenchScreen() {
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
    createAgentSessionForCard
  } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isCopyLogging, setIsCopyLogging] = useState(false);
  const [copyLoggingCardId, setCopyLoggingCardId] = useState<string | null>(null);

  const lifeHarnessData = useMemo(
    () =>
      ({
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
      }) satisfies LifeHarnessData,
    [
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
    ]
  );

  const summary = useMemo(() => buildAgentWorkbenchSummary(lifeHarnessData), [lifeHarnessData]);
  const canCopy = canCopyTextToClipboard();

  function showNotice(kind: NoticeState["kind"], message: string) {
    setNotice({ kind, message });
    setTimeout(() => setNotice(null), 5000);
  }

  async function handleCopyForCard(cardId: string, logSent: boolean) {
    if (logSent && isCopyLogging) {
      return;
    }

    const card = cards.find((item) => item.id === cardId);
    if (!card) {
      showNotice("warning", "Card not found.");
      return;
    }

    if (logSent) {
      setIsCopyLogging(true);
      setCopyLoggingCardId(cardId);
    }

    try {
      await copyAgentTaskPacketForCard({
        data: lifeHarnessData,
        card,
        logSent,
        createAgentSessionForCard,
        onNotice: showNotice
      });
    } finally {
      if (logSent) {
        setIsCopyLogging(false);
        setCopyLoggingCardId(null);
      }
    }
  }

  return (
    <Screen>
      <PageHeader
        title="Agent Workbench"
        subtitle="Needs review first. Open a card's Backroom to log results."
      />

      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

      {summary.needsReview[0] ? (
        <View style={styles.lofiCardHero}>
          <Text style={styles.lofiTapeLabel}>Needs review</Text>
          <Text style={styles.titleText}>{summary.needsReview[0].taskName}</Text>
          <Text style={styles.bodyText}>
            {summary.needsReview[0].cardTitle} · {summary.needsReview[0].agent}
          </Text>
          <Link href={`/card/${summary.needsReview[0].cardId}`} asChild>
            <Pressable style={StyleSheet.flatten([styles.primaryAction, { alignSelf: "flex-start" }])}>
              <Text style={styles.primaryActionText}>Open card</Text>
            </Pressable>
          </Link>
        </View>
      ) : null}

      <Section title="Needs review">
        {summary.needsReview.length === 0 ? (
          <Text style={styles.emptyText}>
            Nothing waiting — delegate a card from Jobs or Card Backroom.
          </Text>
        ) : (
          summary.needsReview.map((row) => <SessionRow key={row.sessionId} row={row} />)
        )}
      </Section>

      <Section title="In motion">
        {summary.inMotion.length === 0 ? (
          <Text style={styles.emptyText}>No sessions in motion.</Text>
        ) : (
          summary.inMotion.map((row) => <SessionRow key={row.sessionId} row={row} />)
        )}
      </Section>

      <Section title="Recently completed">
        {summary.recentlyCompleted.length === 0 ? (
          <Text style={styles.emptyText}>No completed agent sessions yet.</Text>
        ) : (
          summary.recentlyCompleted.map((row) => (
            <SessionRow key={row.sessionId} row={row} showCompletedDate />
          ))
        )}
      </Section>

      <Section title="Ready to delegate">
        {summary.readyToDelegate.length === 0 ? (
          <Text style={styles.emptyText}>
            Add project metadata on a card, then Copy + log sent. Cards with sessions in motion are
            excluded.
          </Text>
        ) : (
          summary.readyToDelegate.map((row) => (
            <ReadyCardRow
              key={row.cardId}
              row={row}
              canCopy={canCopy}
              isCopyLogging={isCopyLogging && copyLoggingCardId === row.cardId}
              onCopyTaskPacket={() => {
                void handleCopyForCard(row.cardId, false);
              }}
              onCopyAndLogSent={() => {
                void handleCopyForCard(row.cardId, true);
              }}
            />
          ))
        )}
      </Section>
    </Screen>
  );
}
