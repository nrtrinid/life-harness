import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ActiveLimitBanner } from "../src/components/ActiveLimitBanner";
import { CardTile } from "../src/components/CardTile";
import { MvdChecklist } from "../src/components/MvdChecklist";
import { Nav } from "../src/components/Nav";
import { PageHeader } from "../src/components/PageHeader";
import { Notice, type NoticeState } from "../src/components/Notice";
import { ProofShelf } from "../src/components/ProofShelf";
import { ProgressBar } from "../src/components/ProgressBar";
import { QuickCapture } from "../src/components/QuickCapture";
import { SalvagePicker } from "../src/components/SalvagePicker";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import { generateWhileYouWereAway, getBriefingHighlightItems } from "../src/core/briefing";
import { computePrimaryAction } from "../src/core/primaryAction";
import { getFollowUpsDue } from "../src/core/career";
import { ACTIVE_CARD_LIMIT, getActiveLimitStatus, getMainQuest } from "../src/core/guards";
import { buildSourceScheduleStats } from "../src/core/jobSourceSchedule";
import { computeCardProgress } from "../src/core/progress";
import { useLifeHarness } from "../src/state/LifeHarnessState";

export default function TodayScreen() {
  const { cards, logs, proofItems, dailyState, pounce, jobCandidates, jobSources, jobSourceRuns } =
    useLifeHarness();
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
    jobSourceRuns
  );
  const highlights = getBriefingHighlightItems(briefing, cards, dailyState, logs, now, 5);
  const primaryAction = computePrimaryAction(briefing, dailyState, cards, logs, now);
  const activeLimit = getActiveLimitStatus(cards);
  const followUpsDue = getFollowUpsDue(cards, now);
  const scheduleStats = buildSourceScheduleStats(jobSources, jobSourceRuns, now);
  const pounceLogged = dailyState.pounceStarted;

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
      <Nav />
      <PageHeader title="Today" subtitle="Daily command surface — see what matters and start one move." />

      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <ActiveLimitBanner />

      <Section title="What should I do now?">
        <Text style={styles.titleText}>{primaryAction.title}</Text>
        <Text style={[styles.bodyText, { marginTop: 8 }]}>{primaryAction.reason}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Smallest action</Text>
        <Text style={styles.bodyText}>{primaryAction.smallestAction}</Text>
        {primaryAction.kind === "pounce" && !primaryAction.targetRoute ? (
          <Pressable
            style={pounceLogged ? styles.secondaryAction : styles.primaryAction}
            onPress={handlePounce}
            disabled={pounceLogged}
          >
            <Text style={pounceLogged ? styles.secondaryActionText : styles.primaryActionText}>
              {primaryAction.ctaLabel ?? "Start Pounce"}
            </Text>
          </Pressable>
        ) : primaryAction.targetRoute ? (
          <Link href={primaryAction.targetRoute} asChild>
            <Pressable style={styles.primaryAction}>
              <Text style={styles.primaryActionText}>{primaryAction.ctaLabel ?? "Go"}</Text>
            </Pressable>
          </Link>
        ) : primaryAction.cardId ? (
          <Link href={`/card/${primaryAction.cardId}`} asChild>
            <Pressable style={styles.primaryAction}>
              <Text style={styles.primaryActionText}>{primaryAction.ctaLabel ?? "Open Card"}</Text>
            </Pressable>
          </Link>
        ) : null}
      </Section>

      <Section title="While You Were Away">
        {highlights.length === 0 ? (
          <Text style={styles.emptyText}>No activity to report yet.</Text>
        ) : (
          highlights.map((item, idx) =>
            item.cardId ? (
              <Link key={idx} href={`/card/${item.cardId}`} asChild>
                <Pressable accessibilityRole="link">
                  <Text style={styles.listItem}>▸ {item.text}</Text>
                </Pressable>
              </Link>
            ) : (
              <Text key={idx} style={styles.listItem}>
                ▸ {item.text}
              </Text>
            )
          )
        )}
      </Section>

      <Section title="Primary Objective">
        {mainQuest ? (
          <Link href={`/card/${mainQuest.id}`} asChild>
            <Pressable>
              <Text style={styles.label}>Main Quest</Text>
              <Text style={styles.titleText}>{mainQuest.title}</Text>
              <ProgressBar value={computeCardProgress(mainQuest, logs, dailyState.sessionStartedAt)} />
            </Pressable>
          </Link>
        ) : (
          <Text style={styles.emptyText}>No main quest assigned yet.</Text>
        )}
      </Section>

      <Section title="Career Pounce">
        <Text style={styles.label}>Pounce Mission</Text>
        <Text style={styles.titleText}>{dailyState.pounceMission}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Smallest Start</Text>
        <Text style={styles.bodyText}>{dailyState.smallestStart}</Text>
        <Link href="/career-intake" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Open Career Intake</Text>
          </Pressable>
        </Link>
        <Link href="/candidate-intake" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Paste into Candidate Intake</Text>
          </Pressable>
        </Link>
        <Link href="/job-candidates" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Open Candidates Queue</Text>
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
        <Pressable
          style={pounceLogged ? styles.secondaryAction : styles.primaryAction}
          onPress={handlePounce}
          disabled={pounceLogged}
        >
          <Text style={pounceLogged ? styles.secondaryActionText : styles.primaryActionText}>
            Pounce
          </Text>
        </Pressable>
        {pounceLogged ? (
          <Text style={styles.helpText}>Pounce logged this session.</Text>
        ) : null}
      </Section>

      <Section title="Follow-ups Due">
        {followUpsDue.length === 0 ? (
          <Text style={styles.emptyText}>No follow-ups due right now.</Text>
        ) : (
          followUpsDue.map((card) => (
            <Link key={card.id} href={`/card/${card.id}`} asChild>
              <Pressable accessibilityRole="link">
                <Text style={styles.listItem}>
                  ▸ {card.title} — due {card.careerApplication?.followUpDate}
                </Text>
              </Pressable>
            </Link>
          ))
        )}
      </Section>

      <Section title="Quick Capture">
        <QuickCapture onNotice={showNotice} />
      </Section>

      <Section title="Active Cards Summary">
        {activeCards.length === 0 ? (
          <Text style={styles.emptyText}>No active cards. Capture something to get started.</Text>
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
      </Section>

      <Section title="Recovery Systems">
        <View style={styles.recoveryRow}>
          <View style={styles.recoveryItem}>
            <MvdChecklist onNotice={showNotice} />
          </View>
          <View style={styles.recoveryItem}>
            <SalvagePicker onNotice={showNotice} />
          </View>
        </View>
      </Section>

      <View style={proofPulse ? styles.sectionProofPulse : undefined}>
        <Section title="Proof Shelf Preview">
          <ProofShelf compact limit={3} />
        </Section>
      </View>
    </Screen>
  );
}
