import { Link } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, Switch, Text, TextInput, View } from "react-native";

import { Nav } from "../src/components/Nav";
import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import type { JobSourceInput } from "../src/core/actions";
import {
  getJobSourceHealth,
  WORKDAY_WEAK_PASS_HEALTH_HINT
} from "../src/core/jobSourceHealth";
import {
  APPROVED_SOURCE_FETCHING_BANNER,
  JOB_SOURCE_CADENCE_LABELS,
  JOB_SOURCE_KIND_LABELS,
  JOB_SOURCE_RUN_STATUS_LABELS,
  SOURCE_HEALTH_LABELS
} from "../src/core/labels";
import {
  buildSourceScheduleStats,
  getSourceDueBadge,
  SOURCE_DUE_BADGE_LABELS
} from "../src/core/jobSourceSchedule";
import { canRunJobSource } from "../src/core/jobSourceRunner";
import type { JobSourceCadence, JobSourceKind } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const KIND_OPTIONS: JobSourceKind[] = [
  "greenhouse",
  "lever",
  "ashby",
  "governmentjobs",
  "workday",
  "jobposting_jsonld",
  "manual",
  "company_careers"
];

const CADENCE_OPTIONS: JobSourceCadence[] = ["manual", "daily", "weekly"];

export default function JobSourcesScreen() {
  const {
    jobSources,
    jobSourceRuns,
    jobCandidates,
    addJobSource,
    updateJobSource,
    isBatchRunning,
    batchRunProgress,
    runOneJobSource,
    runDueJobSources,
    runAllEnabledJobSources
  } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    url: "",
    kind: "greenhouse" as JobSourceKind,
    enabled: true,
    maxResults: "25",
    cadence: "manual" as JobSourceCadence
  });
  const [newSource, setNewSource] = useState<JobSourceInput>({
    name: "",
    url: "",
    kind: "greenhouse",
    enabled: true,
    maxResults: 25,
    cadence: "manual"
  });

  const now = new Date();
  const scheduleStats = buildSourceScheduleStats(jobSources, jobSourceRuns, now);

  async function handleRunSource(sourceId: string) {
    setRunningId(sourceId);
    const result = await runOneJobSource(sourceId);
    setRunningId(null);
    setNotice({
      kind: result.ok ? "success" : "warning",
      message: result.message ?? "Source run finished."
    });
  }

  async function handleRunDueSources() {
    const result = await runDueJobSources();
    setNotice({
      kind: result.summary.totalSources === 0 ? "info" : result.ok ? "success" : "warning",
      message: result.message
    });
  }

  async function runAllConfirmed() {
    const result = await runAllEnabledJobSources();
    setNotice({
      kind: result.summary.totalSources === 0 ? "info" : result.ok ? "success" : "warning",
      message: result.message
    });
  }

  function handleRunAllEnabled() {
    if (scheduleStats.runnableSources === 0) {
      setNotice({ kind: "warning", message: "No enabled runnable sources." });
      return;
    }

    if (scheduleStats.runnableSources <= 3) {
      void runAllConfirmed();
      return;
    }

    const message = `Run ${scheduleStats.runnableSources} enabled sources sequentially?`;
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

  function startEdit(sourceId: string) {
    const source = jobSources.find((item) => item.id === sourceId);
    if (!source) {
      return;
    }
    setEditingId(sourceId);
    setEditDraft({
      url: source.url,
      kind: source.kind,
      enabled: source.enabled,
      maxResults: String(source.maxResults ?? 25),
      cadence: source.cadence
    });
  }

  function saveEdit(sourceId: string) {
    const maxResults = Number.parseInt(editDraft.maxResults, 10);
    updateJobSource(sourceId, {
      url: editDraft.url.trim(),
      kind: editDraft.kind,
      enabled: editDraft.enabled,
      cadence: editDraft.cadence,
      maxResults: Number.isFinite(maxResults) && maxResults > 0 ? maxResults : 25,
      runStatus: "idle"
    });
    setEditingId(null);
    setNotice({ kind: "success", message: "Source updated." });
  }

  function handleAddSource() {
    if (!newSource.name.trim() || !newSource.url.trim()) {
      setNotice({ kind: "warning", message: "Name and URL are required." });
      return;
    }
    const result = addJobSource(newSource);
    setNotice({ kind: result.ok ? "success" : "warning", message: result.message ?? "Source added." });
    setNewSource({
      name: "",
      url: "",
      kind: "greenhouse",
      enabled: true,
      maxResults: 25,
      cadence: "manual"
    });
  }

  return (
    <Screen>
      <Nav />
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <Section title="Approved Source Fetching">
        <Text style={styles.bodyText}>{APPROVED_SOURCE_FETCHING_BANNER}</Text>
        <Text style={styles.helpText}>
          Run approved sources through the local Job Scout Runner on 127.0.0.1:8122. Start it
          with npm run scout:runner.
        </Text>
        <Link href="/job-candidates" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Open Candidates Queue</Text>
          </Pressable>
        </Link>
        <Link href="/source-setup" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Setup / Test New Source</Text>
          </Pressable>
        </Link>
      </Section>

      <Section title="Due Sources">
        <Text style={styles.listItem}>▸ Runnable sources: {scheduleStats.runnableSources}</Text>
        <Text style={styles.listItem}>▸ Due sources: {scheduleStats.dueSources}</Text>
        {batchRunProgress ? (
          <Text style={styles.bodyText}>
            Running {batchRunProgress.sourceName} ({batchRunProgress.current}/
            {batchRunProgress.total})
          </Text>
        ) : null}
        <Pressable
          style={styles.primaryAction}
          disabled={isBatchRunning || scheduleStats.dueSources === 0}
          onPress={() => void handleRunDueSources()}
        >
          <Text style={styles.primaryActionText}>
            {isBatchRunning ? "Running batch..." : "Run Due Sources"}
          </Text>
        </Pressable>
        <Pressable
          style={styles.secondaryAction}
          disabled={isBatchRunning || scheduleStats.runnableSources === 0}
          onPress={handleRunAllEnabled}
        >
          <Text style={styles.secondaryActionText}>Run All Enabled Sources</Text>
        </Pressable>
        <Text style={styles.helpText}>
          Run Due uses daily/weekly cadence only. Run All includes manual cadence sources too.
          Scheduled background fetching remains locked.
        </Text>
      </Section>

      <Section title="Add Source">
        <TextInput
          style={styles.captureInput}
          placeholder="Source name"
          value={newSource.name}
          onChangeText={(value) => setNewSource((current) => ({ ...current, name: value }))}
        />
        <TextInput
          style={styles.captureInput}
          placeholder="Public JSON or fixture URL"
          value={newSource.url}
          onChangeText={(value) => setNewSource((current) => ({ ...current, url: value }))}
        />
        <View style={styles.cardActions}>
          {KIND_OPTIONS.map((kind) => (
            <Pressable
              key={kind}
              style={newSource.kind === kind ? styles.primaryAction : styles.secondaryAction}
              onPress={() => setNewSource((current) => ({ ...current, kind }))}
            >
              <Text
                style={
                  newSource.kind === kind ? styles.primaryActionText : styles.secondaryActionText
                }
              >
                {JOB_SOURCE_KIND_LABELS[kind]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.primaryAction} onPress={handleAddSource}>
          <Text style={styles.primaryActionText}>Add Source</Text>
        </Pressable>
      </Section>

      <Section title="Approved Job Sources">
        {jobSources.map((source) => {
          const guard = canRunJobSource(source);
          const isRunning =
            runningId === source.id || source.runStatus === "running" || isBatchRunning;
          const dueBadge = getSourceDueBadge(source, now);
          const health = getJobSourceHealth(source, jobSourceRuns, jobCandidates, now);
          return (
            <View key={source.id} style={styles.cardTile}>
              <Text style={styles.titleText}>{source.name}</Text>
              <Text style={styles.helpText}>Health: {SOURCE_HEALTH_LABELS[health]}</Text>
              <Text style={styles.bodyText}>{source.url}</Text>
              <Text style={styles.helpText}>
                {JOB_SOURCE_KIND_LABELS[source.kind]} · {source.enabled ? "Enabled" : "Disabled"}{" "}
                · {JOB_SOURCE_CADENCE_LABELS[source.cadence]} · max {source.maxResults ?? 25}
              </Text>
              {source.requestConfig ? (
                <Text style={styles.helpText}>
                  Endpoint-backed · {source.requestConfig.method}
                  {source.requestConfig.pagination?.mode === "workday_offset"
                    ? ` · pagination ${source.requestConfig.pagination.maxPages ?? 3} pages`
                    : ""}
                </Text>
              ) : null}
              {health === "weak_pass" && source.kind === "workday" ? (
                <Text style={styles.bodyText}>{WORKDAY_WEAK_PASS_HEALTH_HINT}</Text>
              ) : null}
              <Text style={styles.helpText}>Schedule: {SOURCE_DUE_BADGE_LABELS[dueBadge]}</Text>
              <Text style={styles.helpText}>
                Run status: {JOB_SOURCE_RUN_STATUS_LABELS[source.runStatus ?? "idle"]}
              </Text>
              {source.lastRunAt ? (
                <Text style={styles.helpText}>
                  Last run: {source.lastRunAt.slice(0, 16)} · fetched {source.lastFetchedCount ?? 0}
                </Text>
              ) : (
                <Text style={styles.helpText}>Last run: never</Text>
              )}
              {source.lastRunMessage ? (
                <Text style={styles.bodyText}>{source.lastRunMessage}</Text>
              ) : null}
              {source.adapterNotes ? <Text style={styles.helpText}>{source.adapterNotes}</Text> : null}
              {source.notes ? <Text style={styles.helpText}>{source.notes}</Text> : null}

              {editingId === source.id ? (
                <View style={styles.cardActions}>
                  <TextInput
                    style={styles.captureInput}
                    value={editDraft.url}
                    onChangeText={(value) => setEditDraft((current) => ({ ...current, url: value }))}
                  />
                  <TextInput
                    style={styles.captureInput}
                    value={editDraft.maxResults}
                    keyboardType="number-pad"
                    onChangeText={(value) =>
                      setEditDraft((current) => ({ ...current, maxResults: value }))
                    }
                  />
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Switch
                      value={editDraft.enabled}
                      onValueChange={(value) =>
                        setEditDraft((current) => ({ ...current, enabled: value }))
                      }
                    />
                    <Text style={styles.helpText}>Enabled</Text>
                  </View>
                  <Text style={styles.label}>Cadence</Text>
                  <View style={styles.cardActions}>
                    {CADENCE_OPTIONS.map((cadence) => (
                      <Pressable
                        key={cadence}
                        style={
                          editDraft.cadence === cadence
                            ? styles.primaryAction
                            : styles.secondaryAction
                        }
                        onPress={() => setEditDraft((current) => ({ ...current, cadence }))}
                      >
                        <Text
                          style={
                            editDraft.cadence === cadence
                              ? styles.primaryActionText
                              : styles.secondaryActionText
                          }
                        >
                          {JOB_SOURCE_CADENCE_LABELS[cadence]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.cardActions}>
                    {KIND_OPTIONS.map((kind) => (
                      <Pressable
                        key={kind}
                        style={
                          editDraft.kind === kind ? styles.primaryAction : styles.secondaryAction
                        }
                        onPress={() => setEditDraft((current) => ({ ...current, kind }))}
                      >
                        <Text
                          style={
                            editDraft.kind === kind
                              ? styles.primaryActionText
                              : styles.secondaryActionText
                          }
                        >
                          {JOB_SOURCE_KIND_LABELS[kind]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable style={styles.primaryAction} onPress={() => saveEdit(source.id)}>
                    <Text style={styles.primaryActionText}>Save</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.cardActions}>
                  <Pressable
                    style={styles.primaryAction}
                    disabled={!guard.ok || isRunning}
                    onPress={() => void handleRunSource(source.id)}
                  >
                    <Text style={styles.primaryActionText}>
                      {isRunning ? "Running..." : "Run Source"}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.secondaryAction} onPress={() => startEdit(source.id)}>
                    <Text style={styles.secondaryActionText}>Edit</Text>
                  </Pressable>
                </View>
              )}
              {!guard.ok ? <Text style={styles.helpText}>{guard.reason}</Text> : null}
            </View>
          );
        })}
      </Section>
    </Screen>
  );
}
