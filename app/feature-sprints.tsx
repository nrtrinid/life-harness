import { Link } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Notice, type NoticeState } from "../src/components/Notice";
import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import type { LifeHarnessData } from "../src/core/actions";
import { canCopyTextToClipboard, copyTextToClipboard } from "../src/core/askHarnessSynthesis";
import {
  buildFeatureScopingPacket,
  buildFeatureStepImplementationPacket,
  buildFeatureStepReviewPacket,
  type FeaturePacketBuildResult
} from "../src/core/featureSprintOrchestrator";
import {
  buildFeatureSprintWorkbenchSummary,
  type FeatureSprintWorkbenchPlanRow,
  type FeatureSprintWorkbenchReadyCard
} from "../src/core/featureSprintWorkbench";
import { useLifeHarness } from "../src/state/LifeHarnessState";

function formatWorkbenchDate(iso: string | undefined): string {
  if (!iso) {
    return "—";
  }

  return iso.slice(0, 16).replace("T", " ");
}

async function copyPacket(
  build: () => FeaturePacketBuildResult,
  onNotice: (kind: NoticeState["kind"], message: string) => void,
  successMessage: string
): Promise<void> {
  const result = build();
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

function PlanRow({
  row,
  showCompletedDate = false,
  canCopy,
  onCopyImplementation,
  onCopyReview
}: {
  row: FeatureSprintWorkbenchPlanRow;
  showCompletedDate?: boolean;
  canCopy?: boolean;
  onCopyImplementation?: () => void;
  onCopyReview?: () => void;
}) {
  const dateLabel = showCompletedDate ? "Completed" : "Updated";
  const dateValue = showCompletedDate ? row.completedAt ?? row.updatedAt : row.updatedAt;

  return (
    <View style={[styles.cardTile, { marginTop: 12 }]}>
      <Text style={styles.titleText}>{row.title}</Text>
      <Text style={styles.bodyText}>
        {row.cardTitle} · {row.status}
        {row.currentStepTitle ? ` · ${row.currentStepTitle}` : ""}
        {row.currentStepStatus ? ` (${row.currentStepStatus})` : ""}
      </Text>
      {row.reviewStatus ? (
        <Text style={styles.bodyText}>Review: {row.reviewStatus}</Text>
      ) : null}
      <Text style={styles.helpText}>
        Progress: {row.completedStepCount}/{row.stepCount} steps
      </Text>
      {row.projectName || row.repoPath ? (
        <Text style={styles.helpText}>
          {[row.projectName, row.repoPath].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
      <Text style={styles.helpText}>
        {dateLabel}: {formatWorkbenchDate(dateValue)}
      </Text>
      <View style={[styles.cardActionsRow, { marginTop: 8 }]}>
        <Link href={`/card/${row.cardId}`} asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Open card</Text>
          </Pressable>
        </Link>
        {canCopy && onCopyImplementation ? (
          <Pressable style={styles.secondaryAction} onPress={onCopyImplementation}>
            <Text style={styles.secondaryActionText}>Copy implementation prompt</Text>
          </Pressable>
        ) : null}
        {canCopy && onCopyReview ? (
          <Pressable style={styles.secondaryAction} onPress={onCopyReview}>
            <Text style={styles.secondaryActionText}>Copy review packet</Text>
          </Pressable>
        ) : null}
        {showCompletedDate && row.evidenceProofItemId ? (
          <Link href={`/proof-ledger?cardId=${row.cardId}`} asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>View ledger</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    </View>
  );
}

function ReadyCardRow({
  row,
  canCopy,
  onCopyScopingPacket
}: {
  row: FeatureSprintWorkbenchReadyCard;
  canCopy: boolean;
  onCopyScopingPacket: () => void;
}) {
  return (
    <View style={[styles.cardTile, { marginTop: 12 }]}>
      <Text style={styles.titleText}>{row.title}</Text>
      <Text style={styles.bodyText}>
        {row.state} · {row.area}
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
          <Pressable style={styles.secondaryAction} onPress={onCopyScopingPacket}>
            <Text style={styles.secondaryActionText}>Copy scoping packet</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function FeatureSprintsScreen() {
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
    careerSourcePack
  } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);

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

  const summary = useMemo(
    () => buildFeatureSprintWorkbenchSummary(lifeHarnessData),
    [lifeHarnessData]
  );
  const canCopy = canCopyTextToClipboard();

  function showNotice(kind: NoticeState["kind"], message: string) {
    setNotice({ kind, message });
    setTimeout(() => setNotice(null), 5000);
  }

  return (
    <Screen>
      <PageHeader
        title="Feature Sprints"
        subtitle="What feature-building work is in motion, and what needs your attention next?"
      />

      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

      <Section title="Needs planning">
        {summary.needsPlanning.length === 0 ? (
          <Text style={styles.emptyText}>
            Add project metadata to a build card, then scope a feature.
          </Text>
        ) : (
          summary.needsPlanning.map((row) => (
            <ReadyCardRow
              key={row.cardId}
              row={row}
              canCopy={canCopy}
              onCopyScopingPacket={() => {
                void copyPacket(
                  () => buildFeatureScopingPacket(lifeHarnessData, row.cardId),
                  showNotice,
                  "Scoping packet copied."
                );
              }}
            />
          ))
        )}
      </Section>

      <Section title="Ready to implement">
        {summary.readyToImplement.length === 0 ? (
          <Text style={styles.emptyText}>No feature steps are ready for implementation.</Text>
        ) : (
          summary.readyToImplement.map((row) => (
            <PlanRow
              key={row.planId}
              row={row}
              canCopy={canCopy}
              onCopyImplementation={() => {
                void copyPacket(
                  () => buildFeatureStepImplementationPacket(lifeHarnessData, row.planId),
                  showNotice,
                  "Implementation prompt copied."
                );
              }}
            />
          ))
        )}
      </Section>

      <Section title="Awaiting agent output">
        {summary.awaitingAgentOutput.length === 0 ? (
          <Text style={styles.emptyText}>No implementation prompts are waiting on agent output.</Text>
        ) : (
          summary.awaitingAgentOutput.map((row) => <PlanRow key={row.planId} row={row} />)
        )}
      </Section>

      <Section title="Needs review">
        {summary.needsReview.length === 0 ? (
          <Text style={styles.emptyText}>No feature outputs need review.</Text>
        ) : (
          summary.needsReview.map((row) => (
            <PlanRow
              key={row.planId}
              row={row}
              canCopy={canCopy}
              onCopyReview={() => {
                void copyPacket(
                  () => buildFeatureStepReviewPacket(lifeHarnessData, row.planId),
                  showNotice,
                  "Review packet copied."
                );
              }}
            />
          ))
        )}
      </Section>

      <Section title="Ready to advance">
        {summary.readyToAdvance.length === 0 ? (
          <Text style={styles.emptyText}>No accepted steps are waiting to advance.</Text>
        ) : (
          summary.readyToAdvance.map((row) => <PlanRow key={row.planId} row={row} />)
        )}
      </Section>

      <Section title="Recently completed">
        {summary.recentlyCompleted.length === 0 ? (
          <Text style={styles.emptyText}>No completed feature sprints yet.</Text>
        ) : (
          summary.recentlyCompleted.map((row) => (
            <PlanRow key={row.planId} row={row} showCompletedDate />
          ))
        )}
      </Section>
    </Screen>
  );
}
