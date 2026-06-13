import { Link, type Href } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, Text, TextInput, View } from "react-native";

import { PrimaryMovePanel, SignalStrip, UsefulEmptyState } from "../../AlivePatterns";
import { RunnerStatusBanner } from "../RunnerStatusBanner";
import { Section } from "../../Section";
import { colors, styles } from "../../styles";
import { APPROVED_SOURCE_FETCHING_BANNER } from "../../../core/labels";
import { ROLE_TYPE_LABELS } from "../../../core/labels";
import { FindPreflightStrip } from "../FindPreflightStrip";
import {
  buildFindPreflightSummary,
  buildJobFindingsSummary,
  formatJobRunFinding
} from "../../../core/jobFindings";
import { useRunnerHealth } from "../../../hooks/useRunnerHealth";
import { deriveBatchRunnerLifecycle } from "../../../core/jobRunnerLifecycle";
import type { JobBoardTab } from "../../../core/jobBoardTab";
import type { RunBatchSummary } from "../../../core/jobSourceSchedule";
import type { RoleType } from "../../../core/types";
import { useLifeHarness } from "../../../state/LifeHarnessState";
import type { JobBoardHandoff } from "./JobBoardHandoffBanner";

const ROLE_TYPES = Object.keys(ROLE_TYPE_LABELS) as RoleType[];

interface JobBoardFindTabProps {
  onSelectTab: (tab: JobBoardTab) => void;
  onNotice: (kind: "success" | "warning" | "info", message: string) => void;
  onHandoff?: (handoff: JobBoardHandoff) => void;
  showPasteForm?: boolean;
  pasteOnly?: boolean;
}

export function JobBoardFindTab({
  onSelectTab,
  onNotice,
  onHandoff,
  showPasteForm = true,
  pasteOnly = false
}: JobBoardFindTabProps) {
  const {
    jobCandidates,
    jobSources,
    jobSourceRuns,
    isBatchRunning,
    batchRunProgress,
    runDueJobSources,
    runHealthyJobSources,
    runAllEnabledJobSources,
    submitJobCandidateIntake
  } = useLifeHarness();
  const { ok: runnerOk } = useRunnerHealth();

  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [description, setDescription] = useState("");
  const [roleType, setRoleType] = useState<RoleType>("software");

  const now = new Date();
  const batchLifecycle = deriveBatchRunnerLifecycle(
    jobSources,
    jobSourceRuns,
    jobCandidates,
    now,
    { isBatchRunning }
  );
  const findings = buildJobFindingsSummary(jobCandidates, jobSources, jobSourceRuns, now);
  const preflight = buildFindPreflightSummary(jobSources, jobSourceRuns, jobCandidates, now);
  const batchBlocked = !runnerOk || isBatchRunning;
  const leadAction =
    batchLifecycle.canRunDue
      ? {
          label: batchLifecycle.actionLabel,
          onPress: () => void handleRunDueSources(),
          disabled: batchBlocked
        }
      : batchLifecycle.canRunHealthy
        ? {
            label: batchLifecycle.actionLabel,
            onPress: () => void handleRunHealthySources(),
            disabled: batchBlocked
          }
        : batchLifecycle.canRunAll
          ? {
              label: batchLifecycle.actionLabel,
              onPress: handleRunAllEnabled,
              disabled: batchBlocked
            }
          : undefined;

  function finishBatch(
    result: { ok: boolean; message: string; summary: RunBatchSummary },
    emptyKind: "info" | "success" | "warning" = "info"
  ) {
    onNotice(
      result.summary.totalSources === 0 ? emptyKind : result.ok ? "success" : "warning",
      result.message
    );
    if (result.summary.createdCandidates > 0) {
      onHandoff?.({
        tab: "review",
        count: result.summary.createdCandidates,
        message: `${result.summary.createdCandidates} new match${
          result.summary.createdCandidates === 1 ? "" : "es"
        } ready for review`
      });
    }
  }

  async function handleRunHealthySources() {
    finishBatch(await runHealthyJobSources());
  }

  async function handleRunDueSources() {
    finishBatch(await runDueJobSources());
  }

  async function runAllConfirmed() {
    finishBatch(await runAllEnabledJobSources());
  }

  function handleRunAllEnabled() {
    if (batchLifecycle.runnableCount === 0) {
      onNotice("warning", batchLifecycle.enabledRunEmptyMessage);
      return;
    }

    if (batchLifecycle.runnableCount <= 3) {
      void runAllConfirmed();
      return;
    }

    const message = `Run ${batchLifecycle.runnableCount} enabled sources sequentially?`;
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
      if (window.confirm(message)) {
        void runAllConfirmed();
      }
      return;
    }

    Alert.alert("Run All Enabled Sources?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Run All", onPress: () => void runAllConfirmed() }
    ]);
  }

  function handlePasteSubmit() {
    if (!company.trim() || !roleTitle.trim() || !description.trim()) {
      onNotice("warning", "Company, role title, and description are required.");
      return;
    }

    const result = submitJobCandidateIntake({
      company: company.trim(),
      roleTitle: roleTitle.trim(),
      description: description.trim(),
      roleType,
      origin: "manual"
    });

    if (!result.ok) {
      onNotice("warning", result.message ?? "Could not create candidate.");
      return;
    }

    setCompany("");
    setRoleTitle("");
    setDescription("");
    onNotice("success", result.message ?? "Added to review queue.");
    onHandoff?.({ tab: "review", count: 1, message: "Posting added — review it next" });
    onSelectTab("review");
  }

  const pasteFormSection = showPasteForm ? (
    <Section title="Paste a posting">
      <Text style={styles.helpText}>
        Manual paste skips the runner. The role lands in Review for Start application.
      </Text>
      <Text style={styles.label}>Company</Text>
      <TextInput
        style={styles.captureInput}
        value={company}
        onChangeText={setCompany}
        placeholder="Acme Corp"
        placeholderTextColor={colors.inputPlaceholder}
      />
      <Text style={[styles.label, { marginTop: 8 }]}>Role title</Text>
      <TextInput
        style={styles.captureInput}
        value={roleTitle}
        onChangeText={setRoleTitle}
        placeholder="Software Engineer"
        placeholderTextColor={colors.inputPlaceholder}
      />
      <Text style={[styles.label, { marginTop: 8 }]}>Description</Text>
      <TextInput
        style={[styles.captureInput, { minHeight: 100, textAlignVertical: "top" }]}
        value={description}
        onChangeText={setDescription}
        placeholder="Paste the job description…"
        placeholderTextColor={colors.inputPlaceholder}
        multiline
      />
      <Text style={[styles.label, { marginTop: 8 }]}>Role type</Text>
      <View style={styles.cardActions}>
        {ROLE_TYPES.map((type) => (
          <Pressable
            key={type}
            style={roleType === type ? styles.primaryAction : styles.secondaryAction}
            onPress={() => setRoleType(type)}
          >
            <Text
              style={roleType === type ? styles.primaryActionText : styles.secondaryActionText}
            >
              {ROLE_TYPE_LABELS[type]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.primaryAction} onPress={handlePasteSubmit}>
        <Text style={styles.primaryActionText}>Add to review queue</Text>
      </Pressable>
    </Section>
  ) : null;

  if (pasteOnly) {
    return <View style={{ gap: 12 }}>{pasteFormSection}</View>;
  }

  return (
    <View style={{ gap: 12 }}>
      <PrimaryMovePanel
        label="Find next"
        title={batchLifecycle.primaryPanelTitle}
        reason={batchLifecycle.primaryPanelReason}
        primaryAction={leadAction}
        secondaryActions={[
          ...(findings.counts.waiting > 0
            ? [
                {
                  label: `Review ${findings.counts.waiting}`,
                  onPress: () => onSelectTab("review"),
                  variant: "secondary" as const
                }
              ]
            : []),
          { label: "Manage sources", href: "/job-sources" as Href, variant: "secondary" as const }
        ]}
        footnote="One sourcing move first. Setup can wait."
      >
        <SignalStrip
          label="Source status"
          text={`${batchLifecycle.healthyCount} healthy · ${batchLifecycle.runnableCount} runnable · ${batchLifecycle.dueCount} due`}
          tone={batchLifecycle.dueCount > 0 ? "warning" : "neutral"}
        />
        {batchRunProgress ? (
          <Text style={styles.bodyText}>
            Running {batchRunProgress.sourceName} ({batchRunProgress.current}/{batchRunProgress.total})
          </Text>
        ) : null}
        {batchLifecycle.runnableCount === 0 ? (
          <UsefulEmptyState
            title="No runnable sources yet"
            copy="Paste one posting below, or manage sources when you want a reusable feed."
          />
        ) : null}
      </PrimaryMovePanel>

      <RunnerStatusBanner />
      <FindPreflightStrip preflight={preflight} />

      <Section title="Source details">
        <Text style={styles.bodyText}>{APPROVED_SOURCE_FETCHING_BANNER}</Text>
        {findings.latestRun ? (
          <Text style={styles.helpText}>
            Last run: {findings.latestRun.sourceName} — {formatJobRunFinding(findings.latestRun)}
          </Text>
        ) : (
          <Text style={styles.helpText}>No source runs yet.</Text>
        )}
        <Link href="/job-sources" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Advanced source runs & setup</Text>
          </Pressable>
        </Link>
      </Section>

      {pasteFormSection}
    </View>
  );
}
