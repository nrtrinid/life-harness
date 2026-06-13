import { Link } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, Text, TextInput, View } from "react-native";

import { PageHeader } from "../src/components/PageHeader";
import { CollapsibleSection } from "../src/components/CollapsibleSection";
import { Notice, type NoticeState } from "../src/components/Notice";
import { ProofShelf } from "../src/components/ProofShelf";
import { ProgressBar } from "../src/components/ProgressBar";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { colors, styles } from "../src/components/styles";
import { buildCareerStats } from "../src/core/career";
import { buildCareerPackBriefingStats } from "../src/core/careerPackMatching";
import { buildJobScoutStats } from "../src/core/jobScout";
import { buildSourceHealthStats } from "../src/core/jobSourceHealth";
import { buildSourceScheduleStats } from "../src/core/jobSourceSchedule";
import {
  buildCardWarmthList,
  buildColdDormantProjects,
  buildMomentumWarmth,
  buildProgressSummary,
  checkUseBeforeImproveLocks
} from "../src/core/progress";
import { useLifeHarness } from "../src/state/LifeHarnessState";

function formatLockLine(lock: ReturnType<typeof checkUseBeforeImproveLocks>[number]): string {
  if ("notSupported" in lock && lock.notSupported) {
    return "Not supported";
  }
  if ("enabled" in lock && lock.enabled) {
    return "Enabled";
  }
  if (lock.id === "scheduled-fetching") {
    return `Locked until ${lock.required} successful manual source runs (${lock.current}/${lock.required})`;
  }
  if (lock.id === "ai-matching") {
    return `${lock.current}/${lock.required} manual career actions`;
  }
  if (lock.id === "resume-automation") {
    return `${lock.current}/${lock.required} manual applications`;
  }
  return `${lock.current}/${lock.required}`;
}

export default function ProgressScreen() {
  const {
    cards,
    logs,
    dailyState,
    jobCandidates,
    jobSources,
    jobSourceRuns,
    resumeModules,
    careerSourcePack,
    persistenceAvailable,
    exportSnapshot,
    importSnapshot,
    resetToSeed,
    resetToClean
  } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [importDraft, setImportDraft] = useState("");
  const now = new Date();

  function showNotice(kind: NoticeState["kind"], message: string) {
    setNotice({ kind, message });
    setTimeout(() => setNotice(null), 4000);
  }

  function handleExport() {
    const result = exportSnapshot();
    showNotice(result.ok ? "success" : "error", result.message ?? "Export failed.");
  }

  function handleImport() {
    const trimmed = importDraft.trim();
    if (!trimmed) {
      showNotice("warning", "Paste a JSON snapshot first.");
      return;
    }
    const result = importSnapshot(trimmed);
    if (result.ok) {
      setImportDraft("");
    }
    showNotice(result.ok ? "success" : "error", result.message ?? "Import failed.");
  }

  function confirmResetToClean() {
    const message =
      "This clears local persistence and starts an empty board. Your current board state will be replaced.";
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
      if (window.confirm(message)) {
        const result = resetToClean();
        showNotice(result.ok ? "success" : "error", result.message ?? "Reset failed.");
      }
      return;
    }
    Alert.alert("Reset to clean board?", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          const result = resetToClean();
          showNotice(result.ok ? "success" : "error", result.message ?? "Reset failed.");
        }
      }
    ]);
  }

  function confirmResetToDemo() {
    const message =
      "This clears local persistence and restores demo seed data. Your current board state will be replaced.";
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
      if (window.confirm(message)) {
        const result = resetToSeed();
        showNotice(result.ok ? "success" : "error", result.message ?? "Reset failed.");
      }
      return;
    }
    Alert.alert("Reset to demo?", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          const result = resetToSeed();
          showNotice(result.ok ? "success" : "error", result.message ?? "Reset failed.");
        }
      }
    ]);
  }
  const summary = buildProgressSummary(cards, logs, dailyState.sessionStartedAt);
  const warmth = buildMomentumWarmth(cards, logs, now);
  const cardWarmth = buildCardWarmthList(cards, logs, now);
  const coldDormant = buildColdDormantProjects(cards, logs, now);
  const careerStats = buildCareerStats(cards, logs, now);
  const scoutStats = buildJobScoutStats(
    jobCandidates,
    resumeModules,
    jobSources,
    jobSourceRuns
  );
  const locks = checkUseBeforeImproveLocks(cards, logs, jobCandidates, jobSourceRuns);
  const scheduleStats = buildSourceScheduleStats(jobSources, jobSourceRuns, now);
  const healthStats = buildSourceHealthStats(jobSources, jobSourceRuns, jobCandidates, now);
  const packStats = buildCareerPackBriefingStats(
    jobCandidates,
    careerSourcePack?.pack ?? null,
    resumeModules,
    jobSources
  );

  return (
    <Screen>
      <PageHeader
        title="Playback"
        subtitle="Proof, momentum, and recovery signals."
      />

      <Section title="Proof Shelf" accent="proof">
        <ProofShelf showLedgerLink />
      </Section>

      <Section title="Recovery proof">
        <Text style={styles.helpText}>Salvage and MVD wins.</Text>
        <ProofShelf rescueOnly limit={5} />
      </Section>

      <Section title="Weekly XP" accent="xp">
        <Text style={styles.bigNumber}>{summary.weeklyXp}</Text>
        <Text style={styles.helpText}>Total XP across local logs this week.</Text>
      </Section>

      <Section title="Card Warmth" accent="warmth">
        {cardWarmth.length === 0 ? (
          <Text style={styles.emptyText}>No active or parked cards to show warmth for.</Text>
        ) : (
          cardWarmth.map((item) => (
            <Link key={item.id} href={`/card/${item.id}`} asChild>
              <Pressable accessibilityRole="link">
                <Text style={styles.listItem}>
                  ▸ {item.title}: {item.warmthLabel}
                </Text>
              </Pressable>
            </Link>
          ))
        )}
      </Section>

      <Section title="Cold / Dormant Projects">
        {coldDormant.length === 0 ? (
          <Text style={styles.emptyText}>No cold or dormant active/parked projects right now.</Text>
        ) : (
          coldDormant.map((item) => (
            <View key={item.id} style={styles.progressItem}>
              <Link href={`/card/${item.id}`} asChild>
                <Pressable accessibilityRole="link">
                  <Text style={styles.titleText}>
                    {item.title} ({item.warmthLabel})
                  </Text>
                </Pressable>
              </Link>
              <Text style={styles.bodyText}>{item.nextTinyAction}</Text>
            </View>
          ))
        )}
      </Section>

      <CollapsibleSection title="Backroom details" defaultOpen={false}>
      <Section title="Approved Source Fetching">
        <Text style={styles.listItem}>▸ Sources configured: {scoutStats.jobSourcesConfigured}</Text>
        <Text style={styles.listItem}>▸ Enabled sources: {scoutStats.enabledSources}</Text>
        <Text style={styles.listItem}>▸ Runnable sources: {scheduleStats.runnableSources}</Text>
        <Text style={styles.listItem}>▸ Due sources: {scheduleStats.dueSources}</Text>
        <Text style={styles.listItem}>▸ Sources run successfully: {scheduleStats.successfulRuns}</Text>
        <Text style={styles.listItem}>▸ Failed source runs: {scheduleStats.failedRuns}</Text>
        <Text style={styles.listItem}>▸ Candidates fetched: {scoutStats.candidatesFetched}</Text>
        <Text style={styles.listItem}>
          ▸ Candidates approved from source fetch: {scoutStats.candidatesApprovedFromFetch}
        </Text>
        <Text style={styles.listItem}>▸ Skipped duplicates: {scoutStats.skippedDuplicatesTotal}</Text>
        <Text style={styles.listItem}>
          ▸ Last source run: {scoutStats.lastSourceRunAt?.slice(0, 16) ?? "never"}
        </Text>
        <Link href="/job-sources" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Run an approved source</Text>
          </Pressable>
        </Link>
      </Section>

      <Section title="Source Health">
        <Text style={styles.listItem}>▸ Healthy sources: {healthStats.healthy}</Text>
        <Text style={styles.listItem}>▸ Weak-pass sources: {healthStats.weakPass}</Text>
        <Text style={styles.listItem}>▸ Error sources: {healthStats.error}</Text>
        <Text style={styles.listItem}>▸ Stale sources: {healthStats.stale}</Text>
        <Text style={styles.listItem}>▸ Never-run sources: {healthStats.neverRun}</Text>
        <Text style={styles.listItem}>
          ▸ Candidate-producing Workday sources: {healthStats.candidateProducingWorkdaySources}
        </Text>
        <Link href="/job-sources" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Open Job Sources</Text>
          </Pressable>
        </Link>
      </Section>

      <Section title="Career Source Pack">
        <Text style={styles.listItem}>
          ▸ Status: {packStats.imported ? "Imported" : "Not imported"}
        </Text>
        {careerSourcePack ? (
          <>
            <Text style={styles.listItem}>
              ▸ Modules: {careerSourcePack.pack.resumeModules.length} · Recipes:{" "}
              {careerSourcePack.pack.roleRecipes.length}
            </Text>
            <Text style={styles.listItem}>
              ▸ Queue evidence gaps: {packStats.evidenceGapCount}
            </Text>
            <Text style={styles.listItem}>
              ▸ Claim rules: {careerSourcePack.pack.claimsSafety.globalClaimsToAvoid.length}
            </Text>
          </>
        ) : (
          <Text style={styles.helpText}>
            Import a Career Source Pack to rank the candidate queue by role recipes and modules.
          </Text>
        )}
        <Link href="/career-pack" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Open Career Pack</Text>
          </Pressable>
        </Link>
      </Section>

      <Section title="Job Scout Foundation">
        <Text style={styles.listItem}>▸ Resume modules active: {scoutStats.activeResumeModules}</Text>
        <Text style={styles.listItem}>▸ Candidates saved: {scoutStats.candidatesSaved}</Text>
        <Text style={styles.listItem}>
          ▸ Candidates approved to cards: {scoutStats.candidatesApproved}
        </Text>
        <Text style={styles.listItem}>▸ Candidates dismissed: {scoutStats.candidatesDismissed}</Text>
        <Text style={styles.listItem}>▸ Average fit score: {scoutStats.averageFitScore}</Text>
      </Section>

      <Section title="Career Command">
        <Text style={styles.listItem}>▸ Applications started: {careerStats.applicationsStarted}</Text>
        <Text style={styles.listItem}>▸ Applications submitted: {careerStats.applicationsSubmitted}</Text>
        <Text style={styles.listItem}>▸ Follow-ups due: {careerStats.followUpsDue}</Text>
        <Text style={styles.listItem}>▸ Career pounces completed: {careerStats.careerPounces}</Text>
      </Section>

      <Section title="XP Summary">
        <Text style={styles.listItem}>▸ Pounce sessions: {summary.pounceSessions}</Text>
        <Text style={styles.listItem}>▸ Salvage wins: {summary.salvageWins}</Text>
      </Section>

      <Section title="Momentum Warmth">
        {warmth.map((item) => (
          <Text key={item.warmth} style={styles.listItem}>
            ▸ {item.label}: {item.count}
          </Text>
        ))}
      </Section>

      <Section title="Use-Before-Improve Locks">
        {locks.length === 0 ? (
          <Text style={styles.emptyText}>No active locks yet.</Text>
        ) : (
          locks.map((lock) => (
            <Text key={lock.id} style={styles.listItem}>
              ▸ {lock.label}: {formatLockLine(lock)}
            </Text>
          ))
        )}
      </Section>

      <Section title="Quest Progress">
        {summary.questProgress.length === 0 ? (
          <Text style={styles.emptyText}>No active or parked quests to track.</Text>
        ) : (
          summary.questProgress.map((item) => (
            <View key={item.id} style={styles.progressItem}>
              <Link href={`/card/${item.id}`} asChild>
                <Pressable accessibilityRole="link">
                  <Text style={styles.titleText}>{item.title}</Text>
                </Pressable>
              </Link>
              <ProgressBar value={item.progress} />
            </View>
          ))
        )}
      </Section>

      <Section title="Local Data">
        {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
        <Text style={styles.listItem}>
          ▸ Local persistence: {persistenceAvailable ? "available" : "unavailable on this platform"}
        </Text>
        <Text style={styles.helpText}>
          v0.5 persistence is web-local only. Native persistence requires a future adapter.
        </Text>
        <Pressable
          style={[styles.secondaryAction, !persistenceAvailable && { opacity: 0.6 }]}
          onPress={handleExport}
        >
          <Text style={styles.secondaryActionText}>Export JSON</Text>
        </Pressable>
        <Text style={[styles.label, { marginTop: 12 }]}>Import JSON</Text>
        <TextInput
          style={[styles.captureInput, { minHeight: 100, textAlignVertical: "top" }]}
          value={importDraft}
          onChangeText={setImportDraft}
          placeholder="Paste exported snapshot JSON..."
          placeholderTextColor={colors.inputPlaceholder}
          multiline
          autoCapitalize="none"
        />
        <Pressable style={styles.secondaryAction} onPress={handleImport}>
          <Text style={styles.secondaryActionText}>Import</Text>
        </Pressable>
        <Pressable style={styles.secondaryAction} onPress={confirmResetToClean}>
          <Text style={styles.secondaryActionText}>Reset to clean board</Text>
        </Pressable>
        <Pressable style={styles.secondaryAction} onPress={confirmResetToDemo}>
          <Text style={styles.secondaryActionText}>Reset to demo seed</Text>
        </Pressable>
      </Section>
      </CollapsibleSection>
    </Screen>
  );
}
