import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Nav } from "../src/components/Nav";
import { Notice, type NoticeState } from "../src/components/Notice";
import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { styles } from "../src/components/styles";
import { buildCareerPipelineState } from "../src/core/careerPipeline";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const CAREER_TOOL_LINKS = [
  { href: "/career-intake", label: "Intake", description: "Create an application card directly" },
  { href: "/candidate-intake", label: "Paste", description: "Paste a job posting into the queue" },
  { href: "/job-candidates", label: "Queue", description: "Review and approve candidates" },
  { href: "/resume-bank", label: "Bank", description: "Resume modules for applications" },
  { href: "/job-sources", label: "Sources", description: "Run approved job sources" },
  { href: "/source-setup", label: "Setup", description: "Detect and save source adapters" }
] as const;

export default function CareerScreen() {
  const {
    jobCandidates,
    cards,
    jobSources,
    jobSourceRuns,
    runFitFinder,
    isBatchRunning,
    batchRunProgress
  } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [lastFitResult, setLastFitResult] = useState<{ createdCount: number } | null>(null);
  const now = new Date();
  const pipeline = buildCareerPipelineState(jobCandidates, cards, jobSources, jobSourceRuns, now);

  const chips = [
    {
      label: `${pipeline.candidatesWaiting} in queue`,
      accent: pipeline.candidatesWaiting > 0
    },
    {
      label: `${pipeline.activeApplications.length} active apps`,
      accent: pipeline.activeApplications.length > 0
    },
    {
      label: `${pipeline.followUpsDue.length} follow-ups`,
      accent: pipeline.followUpsDue.length > 0
    },
    {
      label: `${pipeline.dueSources} due sources`,
      accent: pipeline.dueSources > 0
    }
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
    ? `Running ${batchRunProgress.sourceName} (${batchRunProgress.current}/${batchRunProgress.total})…`
    : "Finding fit matches…";

  return (
    <Screen>
      <Nav />
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <PageHeader
        title="Career"
        subtitle="Career pipeline — review queue, sources, and applications."
        chips={chips}
      />

      <View style={{ gap: 8, marginBottom: 16 }}>
        <Pressable
          style={[styles.primaryAction, isBatchRunning && { opacity: 0.7 }]}
          onPress={() => void handleFindFitJobs()}
          disabled={isBatchRunning}
        >
          <Text style={styles.primaryActionText}>
            {isBatchRunning ? runningLabel : "Find jobs that fit me"}
          </Text>
        </Pressable>
        <Text style={styles.helpText}>
          Run approved sources, score matches, then apply to one.
        </Text>
        <Text style={styles.helpText}>
          Find fits, then apply to one. Do not tune sources before sending an application.
        </Text>
        {lastFitResult && lastFitResult.createdCount > 0 ? (
          <Link href="/job-candidates" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Open Queue to review matches</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>

      {pipeline.lastRun ? (
        <Text style={styles.helpText}>
          Last source run: {pipeline.lastRun.sourceName} · {pipeline.lastRun.createdCount} created ·{" "}
          {pipeline.lastRun.timestamp.slice(0, 16).replace("T", " ")}
        </Text>
      ) : (
        <Text style={styles.helpText}>No source runs yet — open Sources or Setup to get started.</Text>
      )}

      <View style={styles.checklist}>
        {CAREER_TOOL_LINKS.map((item) => (
          <Link key={item.href} href={item.href} asChild>
            <Pressable style={styles.chatSuggestionCard}>
              <Text style={styles.chatSuggestionCardText}>{item.label}</Text>
              <Text style={styles.helpText}>{item.description}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </Screen>
  );
}
