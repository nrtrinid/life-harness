import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ActiveLimitBanner } from "../src/components/ActiveLimitBanner";
import { CardTile } from "../src/components/CardTile";
import { CollapsibleSection } from "../src/components/CollapsibleSection";
import { BonusTrackCard } from "../src/components/lofi/BonusTrackCard";
import { CompanionNote } from "../src/components/lofi/CompanionNote";
import { NextMoveContractPanel } from "../src/components/lofi/NextMoveContractPanel";
import { RecoveryPanel } from "../src/components/lofi/RecoveryPanel";
import { RescueRow } from "../src/components/lofi/RescueRow";
import { TinyQuestCard } from "../src/components/lofi/TinyQuestCard";
import { TodayBriefingStrip } from "../src/components/lofi/TodayBriefingStrip";
import { PageHeader } from "../src/components/PageHeader";
import { Notice, type NoticeState } from "../src/components/Notice";
import { ProofShelf } from "../src/components/ProofShelf";
import { ProgressBar } from "../src/components/ProgressBar";
import { QuickCapture } from "../src/components/QuickCapture";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import { computeBonusTrack } from "../src/core/bonusTrack";
import { generateWhileYouWereAway } from "../src/core/briefing";
import { buildCompanionNote } from "../src/core/companionNote";
import { getFollowUpsDue } from "../src/core/career";
import { buildNextMoveSummary } from "../src/core/nextMoveContract";
import { computePrimaryAction } from "../src/core/primaryAction";
import { ACTIVE_CARD_LIMIT, getActiveLimitStatus, getMainQuest } from "../src/core/guards";
import { buildSourceScheduleStats } from "../src/core/jobSourceSchedule";
import { computeCardProgress } from "../src/core/progress";
import { computeRecoveryVisibility } from "../src/core/recovery";
import { useLifeHarness } from "../src/state/LifeHarnessState";

export default function TodayScreen() {
  const {
    cards,
    logs,
    proofItems,
    dailyState,
    pounce,
    jobCandidates,
    jobSources,
    jobSourceRuns,
    careerSourcePack,
    resumeModules,
    projects,
    agentSessions,
    featureSprintPlans,
    featureSprintRunnerRuns,
    chatSummaries,
    memoryItems
  } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [proofPulse, setProofPulse] = useState(false);
  const now = new Date();
  const activeCards = cards.filter((card) => card.state === "active");
  const mainQuest = getMainQuest(cards, dailyState);
  const briefing = generateWhileYouWereAway(
    cards,
    logs,
    proofItems,
    dailyState,
    now,
    jobCandidates,
    jobSources,
    jobSourceRuns,
    careerSourcePack,
    resumeModules
  );
  const companionNote = buildCompanionNote(briefing, cards, dailyState, logs, now);
  const primaryAction = computePrimaryAction(briefing, dailyState, cards, logs, now);
  const bonusTrack = computeBonusTrack(briefing, primaryAction, cards);
  const recoveryVisibility = computeRecoveryVisibility(briefing, dailyState, now);
  const activeLimit = getActiveLimitStatus(cards);
  const followUpsDue = getFollowUpsDue(cards, now);
  const scheduleStats = buildSourceScheduleStats(jobSources, jobSourceRuns, now);
  const pounceLogged = dailyState.pounceStarted;
  const nextMove = buildNextMoveSummary(
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
    { now }
  );

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!proofPulse) {
      return;
    }
    const timer = setTimeout(() => setProofPulse(false), 2000);
    return () => clearTimeout(timer);
  }, [proofPulse]);

  function showNotice(next: NoticeState) {
    setNotice(next);
    if (next.kind === "success" && next.message?.includes("Proof updated")) {
      setProofPulse(true);
    }
  }

  function handlePounce() {
    const result = pounce();
    if (result.ok) {
      showNotice({ kind: "success", message: result.message ?? "+10 XP · Pounce logged" });
    } else {
      showNotice({ kind: "warning", message: result.message ?? "Pounce already logged this session." });
    }
  }

  return (
    <Screen>
      <PageHeader
        title="Today"
        subtitle="Act mode — one move, then proof."
      />

      <View style={styles.todayActStack}>
        {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

        <TodayBriefingStrip
          briefing={briefing}
          cards={cards}
          dailyState={dailyState}
          logs={logs}
          companionNote={companionNote}
          now={now}
        />

        <ActiveLimitBanner />

        {nextMove.primary ? (
          <NextMoveContractPanel summary={nextMove} actMode />
        ) : (
          <TinyQuestCard
            action={primaryAction}
            pounceLogged={pounceLogged}
            onPounce={handlePounce}
          />
        )}

        <Section title="Quick Capture">
          <Text style={styles.helpText}>Universal input — capture, log, or park without leaving the loop.</Text>
          <QuickCapture onNotice={showNotice} actMode />
        </Section>

        <View style={proofPulse ? styles.sectionProofPulse : undefined}>
          <Section title="You moved" accent="proof">
            <ProofShelf compact limit={3} showLedgerLink />
          </Section>
        </View>

        <View style={styles.todayRecoveryFallback}>
          <Text style={styles.todayRecoveryLabel}>Recovery fallback</Text>
          <Text style={styles.helpText}>When work is slipping — stabilize before pushing harder.</Text>
          {recoveryVisibility.shouldPromote ? (
            <RecoveryPanel visibility={recoveryVisibility} onNotice={showNotice} />
          ) : (
            <RescueRow onNotice={showNotice} />
          )}
        </View>

        <CollapsibleSection
          title="Active threads"
          defaultOpen={activeCards.length > 0 && activeCards.length <= 3}
        >
          {mainQuest ? (
            <Link href={`/card/${mainQuest.id}`} asChild>
              <Pressable style={{ marginBottom: 12 }}>
                <Text style={styles.label}>Main quest</Text>
                <Text style={styles.titleText}>{mainQuest.title}</Text>
                <ProgressBar value={computeCardProgress(mainQuest, logs, dailyState.sessionStartedAt)} />
              </Pressable>
            </Link>
          ) : null}

          {followUpsDue.length > 0 ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.label}>Follow-ups due</Text>
              {followUpsDue.map((card) => (
                <Link key={card.id} href={`/card/${card.id}`} asChild>
                  <Pressable accessibilityRole="link">
                    <Text style={styles.listItem}>
                      ▸ {card.title} — due {card.careerApplication?.followUpDate}
                    </Text>
                  </Pressable>
                </Link>
              ))}
            </View>
          ) : null}

          {activeCards.length === 0 ? (
            <View>
              <Text style={styles.emptyText}>No active threads. Capture something to get started.</Text>
              <Link href="/board" asChild>
                <Pressable
                  style={StyleSheet.flatten([styles.smallButton, { marginTop: 8, alignSelf: "flex-start" }])}
                >
                  <Text style={styles.smallButtonText}>Open Board</Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <>
              <Text style={styles.helpText}>
                {activeLimit.count}/{ACTIVE_CARD_LIMIT} active
              </Text>
              {activeCards.map((card) => (
                <CardTile key={card.id} card={card} logs={logs} compact />
              ))}
            </>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="More on Today" defaultOpen={false}>
          {bonusTrack ? <BonusTrackCard track={bonusTrack} /> : null}

          <CompanionNote text={companionNote} />

          {primaryAction.kind === "pounce" ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <Text style={styles.label}>Jobs shortcuts</Text>
              <Link href="/career" asChild>
                <Pressable style={styles.secondaryAction}>
                  <Text style={styles.secondaryActionText}>Open Jobs</Text>
                </Pressable>
              </Link>
              <Link href="/candidate-intake" asChild>
                <Pressable style={styles.secondaryAction}>
                  <Text style={styles.secondaryActionText}>Paste a job</Text>
                </Pressable>
              </Link>
              <Link href="/job-candidates" asChild>
                <Pressable style={styles.secondaryAction}>
                  <Text style={styles.secondaryActionText}>Review queue</Text>
                </Pressable>
              </Link>
              <Link href="/job-sources" asChild>
                <Pressable style={styles.secondaryAction}>
                  <Text style={styles.secondaryActionText}>
                    {scheduleStats.dueSources > 0
                      ? `Run Due Job Sources (${scheduleStats.dueSources})`
                      : "Run an Approved Job Source"}
                  </Text>
                </Pressable>
              </Link>
            </View>
          ) : null}
        </CollapsibleSection>
      </View>
    </Screen>
  );
}
