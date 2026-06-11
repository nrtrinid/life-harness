import { Link, type Href } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CareerNextContractCard } from "../src/components/career/CareerNextContractCard";
import { CareerQueuePreview } from "../src/components/career/CareerQueuePreview";
import { CareerStatusChip } from "../src/components/career/CareerStatusChip";
import { CareerToolCard } from "../src/components/career/CareerToolCard";
import { Notice, type NoticeState } from "../src/components/Notice";
import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { colors, lofiColors, styles } from "../src/components/styles";
import { buildCareerHubSummary } from "../src/core/careerHub";
import { useLifeHarness } from "../src/state/LifeHarnessState";

function HubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.lofiTapeLabel}>{title}</Text>
      {children}
    </View>
  );
}

function SplitCell({ children }: { children: ReactNode }) {
  return <View style={{ flexBasis: 260, flexGrow: 1, flexShrink: 1 }}>{children}</View>;
}

export default function CareerScreen() {
  const {
    jobCandidates,
    cards,
    jobSources,
    jobSourceRuns,
    resumeModules,
    careerSourcePack,
    proofItems,
    runFitFinder,
    isBatchRunning,
    batchRunProgress
  } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [lastFitResult, setLastFitResult] = useState<{ createdCount: number } | null>(null);

  const summary = buildCareerHubSummary({
    jobCandidates,
    cards,
    jobSources,
    jobSourceRuns,
    resumeModules,
    hasCareerPack: Boolean(careerSourcePack),
    now: new Date()
  });
  const careerProofItems = proofItems.filter((item) => item.area === "social_career");

  const chips = [
    { label: `${summary.queueCount} in queue`, accent: summary.queueCount > 0 },
    {
      label: `${summary.activeApplicationCount + summary.waitingApplicationCount} applications`,
      accent: summary.activeApplicationCount + summary.waitingApplicationCount > 0
    },
    { label: `${summary.followUpCount} follow-ups`, accent: summary.followUpCount > 0 },
    { label: `${summary.dueSourceCount} due sources`, accent: summary.dueSourceCount > 0 },
    { label: summary.hasCareerPack ? "pack imported" : "no pack" }
  ];

  async function handleFindFitJobs() {
    const result = await runFitFinder();
    setLastFitResult({ createdCount: result.createdCandidateIds.length });
    setNotice({
      kind: result.ok ? "success" : result.runnerUnreachable ? "warning" : "info",
      message: result.message
    });
  }

  const runningLabel = batchRunProgress
    ? `Running ${batchRunProgress.sourceName} (${batchRunProgress.current}/${batchRunProgress.total})...`
    : "Finding fit matches...";

  return (
    <Screen>
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <PageHeader
        title="Career"
        subtitle="Contracts, resume artifacts, and application momentum."
        chips={chips}
      />

      <CareerNextContractCard action={summary.nextAction} />

      <HubSection title="Application queue">
        <View style={styles.lofiCard}>
          <View style={styles.pageHeaderChips}>
            <CareerStatusChip label={`${summary.queueCount} candidates`} accent={summary.queueCount > 0} />
            <CareerStatusChip
              label={`${summary.activeApplicationCount} active`}
              accent={summary.activeApplicationCount > 0}
            />
            <CareerStatusChip
              label={`${summary.waitingApplicationCount} waiting`}
              accent={summary.waitingApplicationCount > 0}
            />
          </View>
          <Text style={styles.bodyText}>
            Review candidates, choose the resume angle, then create the application card.
          </Text>
          <CareerQueuePreview
            emptyText="No candidates waiting. Paste one job to start the next contract."
            items={summary.queuePreview}
          />
          {summary.applicationPreview.length > 0 ? (
            <>
              <Text style={[styles.lofiTapeLabel, { marginTop: 4 }]}>Application cards</Text>
              <CareerQueuePreview
                emptyText="No application cards in motion."
                items={summary.applicationPreview}
              />
            </>
          ) : null}
          <Link href="/job-candidates" asChild>
            <Pressable style={StyleSheet.flatten([styles.secondaryAction, { alignSelf: "flex-start" }])}>
              <Text style={styles.secondaryActionText}>Open application queue</Text>
            </Pressable>
          </Link>
        </View>
      </HubSection>

      <HubSection title="Start the next contract">
        <View style={styles.splitRow}>
          <SplitCell>
            <CareerToolCard
              eyebrow="Paste a job"
              title="Add one posting"
              description="Paste a job description into the candidate queue. Approval creates the application card later."
              href="/candidate-intake"
              ctaLabel="Paste a job"
              meta="Primary intake path"
            />
          </SplitCell>
          <SplitCell>
            <CareerToolCard
              eyebrow="Direct card"
              title="Create application card"
              description="Use this only when the application is already real enough to become a board card."
              href="/career-intake"
              ctaLabel="Create card directly"
              meta="Secondary path"
              quiet
            />
          </SplitCell>
        </View>
      </HubSection>

      <HubSection title="Resume artifacts and source material">
        <View style={styles.splitRow}>
          <SplitCell>
            <CareerToolCard
              eyebrow="Resume artifacts"
              title="Resume Bank"
              description="Structured modules and bullets for choosing the application angle."
              href="/resume-bank"
              ctaLabel="Open Resume Bank"
              meta={`${summary.activeResumeModuleCount}/${summary.resumeModuleCount} active modules`}
            />
          </SplitCell>
          <SplitCell>
            <CareerToolCard
              eyebrow="Source material"
              title="Career Source Pack"
              description={
                summary.hasCareerPack
                  ? "Imported pack is available for deterministic queue matching."
                  : "Import public career source material when you have a pack ready."
              }
              href="/career-pack"
              ctaLabel={summary.hasCareerPack ? "Open Career Pack" : "Import Career Pack"}
              meta={summary.hasCareerPack ? "Pack imported" : "No pack imported"}
            />
          </SplitCell>
        </View>
      </HubSection>

      <HubSection title="Sources">
        <View style={[styles.lofiCardQuiet, { borderLeftColor: lofiColors.actionAmber, borderLeftWidth: 3 }]}>
          <View style={styles.pageHeaderChips}>
            <CareerStatusChip
              label={`${summary.enabledSourceCount} enabled`}
              accent={summary.enabledSourceCount > 0}
            />
            <CareerStatusChip label={`${summary.dueSourceCount} due`} accent={summary.dueSourceCount > 0} />
          </View>
          <Text style={styles.titleText}>Approved job sources</Text>
          <Text style={styles.bodyText}>
            Run approved sources when you want fresh candidates. Source setup stays secondary to applying.
          </Text>
          {summary.lastRun ? (
            <Text style={styles.helpText}>
              Last run: {summary.lastRun.sourceName} - {summary.lastRun.createdCount} created -{" "}
              {summary.lastRun.timestamp.slice(0, 16).replace("T", " ")}
            </Text>
          ) : (
            <Text style={styles.helpText}>No source runs yet.</Text>
          )}
          <View style={styles.cardActionsRow}>
            <Link href="/job-sources" asChild>
              <Pressable style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>Open Sources</Text>
              </Pressable>
            </Link>
            <Pressable
              style={[styles.primaryAction, isBatchRunning && { opacity: 0.7 }]}
              onPress={() => void handleFindFitJobs()}
              disabled={isBatchRunning}
            >
              <Text style={styles.primaryActionText}>
                {isBatchRunning ? runningLabel : "Find fit matches"}
              </Text>
            </Pressable>
            <Link href={"/source-setup" as Href} asChild>
              <Pressable style={styles.smallButton}>
                <Text style={styles.smallButtonText}>Advanced setup</Text>
              </Pressable>
            </Link>
          </View>
          <Text style={styles.helpText}>
            Find fits, then apply to one. Do not tune sources before sending an application.
          </Text>
          {lastFitResult && lastFitResult.createdCount > 0 ? (
            <Link href="/job-candidates" asChild>
              <Pressable style={StyleSheet.flatten([styles.secondaryAction, { alignSelf: "flex-start" }])}>
                <Text style={styles.secondaryActionText}>Review new matches</Text>
              </Pressable>
            </Link>
          ) : null}
        </View>
      </HubSection>

      <HubSection title="Career proof / follow-ups">
        <View style={[styles.lofiCardQuiet, { borderLeftColor: colors.accentSuccess, borderLeftWidth: 3 }]}>
          <View style={styles.pageHeaderChips}>
            <CareerStatusChip label={`${summary.followUpCount} follow-ups`} accent={summary.followUpCount > 0} />
            <CareerStatusChip label={`${careerProofItems.length} proof items`} accent={careerProofItems.length > 0} />
          </View>
          <Text style={styles.bodyText}>
            Follow-ups and proof keep career work tied to outside-world motion.
          </Text>
          <CareerQueuePreview
            emptyText="No follow-ups due. Proof preview is limited to existing Social / Career proof items."
            items={summary.followUpPreview}
          />
          {careerProofItems[0] ? (
            <Text style={styles.helpText}>Latest proof: {careerProofItems[0].title}</Text>
          ) : (
            <Text style={styles.helpText}>
              Backlog: add a dedicated Career Proof selector when proof needs more than the existing area tag.
            </Text>
          )}
        </View>
      </HubSection>
    </Screen>
  );
}
