import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { CardStateButtons } from "../../src/components/CardStateButtons";
import { CardAgentToolsSection } from "../../src/components/card/CardAgentToolsSection";
import { CareerApplicationCardDetail } from "../../src/components/career/CareerApplicationCardDetail";
import { Notice, type NoticeState } from "../../src/components/Notice";
import { ProgressBar } from "../../src/components/ProgressBar";
import { Screen } from "../../src/components/Screen";
import { Section } from "../../src/components/Section";
import { styles } from "../../src/components/styles";
import sampleProfile from "../../fixtures/resume/profile.sample.json";
import { canCopyTextToClipboard, copyTextToClipboard } from "../../src/core/askHarnessSynthesis";
import { buildApplicationResumeDocxDraft } from "../../src/core/applicationResumeExport";
import {
  buildAgentSessionCreateInputFromTaskPacket,
  buildAgentTaskPacket,
  buildDefaultAgentTaskPacketInput
} from "../../src/core/agentTaskPacket";
import { buildCardContextPacket } from "../../src/core/harnessContextGraph";
import { AREA_LABELS, WARMTH_LABELS } from "../../src/core/labels";
import { computeCardProgress } from "../../src/core/progress";
import { packResumeDocxBlob, type ResumeProfile } from "../../src/core/resumeDocx";
import { buildApplicationResumeReadiness } from "../../src/core/resumeReadiness";
import { computeCardWarmth } from "../../src/core/warmth";
import { useLifeHarness } from "../../src/state/LifeHarnessState";

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
    createAgentSessionForCard
  } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isCopyLogging, setIsCopyLogging] = useState(false);
  const card = cards.find((item) => item.id === id);
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

  const activeCard = card;
  const cardProof = proofItems.filter((proof) => activeCard.proofItemIds.includes(proof.id));
  const linkedCandidate = activeCard.careerApplication?.jobCandidateId
    ? jobCandidates.find((candidate) => candidate.id === activeCard.careerApplication?.jobCandidateId)
    : undefined;
  const resumeReadiness = activeCard.careerApplication
    ? buildApplicationResumeReadiness({
        card: activeCard,
        resumeModules,
        jobCandidate: linkedCandidate,
        careerSourcePack: careerSourcePack?.pack
      })
    : undefined;
  const isApplicationCard = Boolean(activeCard.careerApplication && resumeReadiness);

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
    careerSourcePack
  };

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
      activeCard,
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
      () => buildCardContextPacket(lifeHarnessData, activeCard.id),
      "Agent context copied."
    );
  }

  function handleCopyAgentTaskPacket() {
    void copyMarkdownToClipboard(
      () => buildAgentTaskPacket(lifeHarnessData, buildDefaultAgentTaskPacketInput(activeCard)),
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
        buildDefaultAgentTaskPacketInput(activeCard)
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

      {isApplicationCard ? (
        <CareerApplicationCardDetail
          card={activeCard}
          resumeReadiness={resumeReadiness!}
          cardProof={cardProof}
          onBuildDocx={() => void handleBuildResumeDocx()}
          onNotice={showNotice}
        />
      ) : (
        <>
          <Section title={activeCard.title}>
            <Text style={styles.bodyText}>
              {AREA_LABELS[activeCard.area]} · {warmth ? WARMTH_LABELS[warmth] : "unknown"} ·{" "}
              {activeCard.state}
            </Text>
            <ProgressBar value={computeCardProgress(activeCard, logs, dailyState.sessionStartedAt)} />
            <Text style={styles.label}>Why It Matters</Text>
            <Text style={styles.bodyText}>{activeCard.whyItMatters}</Text>
            <CardStateButtons cardId={activeCard.id} currentState={activeCard.state} />
            {canCopyTextToClipboard() ? (
              <View style={styles.cardActionsRow}>
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
            ) : null}
          </Section>

          <Section title="Next Tiny Action">
            <Text style={styles.titleText}>{activeCard.nextTinyAction}</Text>
            <Text style={[styles.label, { marginTop: 12 }]}>Done For Now</Text>
            <Text style={styles.bodyText}>{activeCard.doneForNow}</Text>
          </Section>

          <Section title="Do vs Improve">
            <View style={styles.splitRow}>
              <View style={styles.splitPanel}>
                <Text style={styles.label}>Do Lane</Text>
                <Text style={styles.bodyText}>{activeCard.doLane}</Text>
              </View>
              <View style={styles.splitPanel}>
                <Text style={styles.label}>Improve Lane</Text>
                <Text style={styles.bodyText}>{activeCard.improveLane}</Text>
              </View>
            </View>
          </Section>

          <Section title="Plans">
            <Text style={styles.label}>Trigger Plan</Text>
            <Text style={styles.bodyText}>
              {activeCard.triggerPlan?.cue} → {activeCard.triggerPlan?.action}
            </Text>
            <Text style={[styles.label, { marginTop: 12 }]}>Obstacle Plan</Text>
            <Text style={styles.bodyText}>{activeCard.obstaclePlan?.plan}</Text>
          </Section>

          {activeCard.resumePacket ? (
            <Section title="Resume Packet">
              <Text style={styles.label}>Last State</Text>
              <Text style={styles.bodyText}>{activeCard.resumePacket.lastState}</Text>
              <Text style={[styles.label, { marginTop: 12 }]}>Re-entry Action</Text>
              <Text style={styles.bodyText}>{activeCard.resumePacket.reentryAction}</Text>
              <Text style={[styles.label, { marginTop: 12 }]}>Open Loops</Text>
              {activeCard.resumePacket.openLoops.length === 0 ? (
                <Text style={styles.emptyText}>No open loops yet.</Text>
              ) : (
                activeCard.resumePacket.openLoops.map((loop) => (
                  <Text key={loop} style={styles.listItem}>
                    ▸ {loop}
                  </Text>
                ))
              )}
            </Section>
          ) : null}

          <CardAgentToolsSection
            card={activeCard}
            layout="sections"
            onNotice={showNotice}
          />

          <Section title="Recent Wins">
            {activeCard.recentWins.length === 0 ? (
              <Text style={styles.emptyText}>No recent wins recorded yet.</Text>
            ) : (
              activeCard.recentWins.map((win) => (
                <Text key={win} style={styles.listItem}>
                  ▸ {win}
                </Text>
              ))
            )}
          </Section>

          <Section title="Optimization Parking Lot">
            {activeCard.optimizationIdeas.length === 0 ? (
              <Text style={styles.emptyText}>No optimization ideas parked yet.</Text>
            ) : (
              activeCard.optimizationIdeas.map((idea) => (
                <Text key={idea} style={styles.listItem}>
                  ▸ {idea}
                </Text>
              ))
            )}
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
        </>
      )}
    </Screen>
  );
}
