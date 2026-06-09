import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";

import { Nav } from "../src/components/Nav";
import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import type { JobSourceInput } from "../src/core/actions";
import {
  APPROVED_SOURCE_FETCHING_BANNER,
  JOB_SOURCE_CADENCE_LABELS,
  JOB_SOURCE_KIND_LABELS,
  JOB_SOURCE_RUN_STATUS_LABELS
} from "../src/core/labels";
import {
  buildFetchErrorRunOutput,
  canRunJobSource
} from "../src/core/jobSourceRunner";
import {
  RUNNER_UNREACHABLE_MESSAGE,
  RunnerUnreachableError,
  runSourceViaRunner
} from "../src/core/jobScoutRunnerClient";
import type { JobSourceKind } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const KIND_OPTIONS: JobSourceKind[] = [
  "greenhouse",
  "lever",
  "ashby",
  "jobposting_jsonld",
  "manual",
  "company_careers"
];

export default function JobSourcesScreen() {
  const {
    jobCandidates,
    jobSources,
    resumeModules,
    addJobSource,
    updateJobSource,
    recordJobSourceRun
  } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ url: "", kind: "greenhouse" as JobSourceKind, enabled: true, maxResults: "25" });
  const [newSource, setNewSource] = useState<JobSourceInput>({
    name: "",
    url: "",
    kind: "greenhouse",
    enabled: true,
    maxResults: 25
  });

  async function handleRunSource(sourceId: string) {
    const source = jobSources.find((item) => item.id === sourceId);
    if (!source) {
      return;
    }

    const guard = canRunJobSource(source);
    if (!guard.ok) {
      setNotice({ kind: "warning", message: guard.reason ?? "Cannot run source." });
      return;
    }

    setRunningId(sourceId);
    updateJobSource(sourceId, { runStatus: "running", lastRunMessage: "Running..." });

    try {
      const output = await runSourceViaRunner({
        source,
        existingCandidates: jobCandidates,
        resumeModules
      });
      const result = recordJobSourceRun(source, output);
      setNotice({
        kind: result.ok ? "success" : "warning",
        message: result.message ?? output.result.message
      });
    } catch (error) {
      const message =
        error instanceof RunnerUnreachableError
          ? RUNNER_UNREACHABLE_MESSAGE
          : "Local Job Scout Runner request failed.";
      const output = buildFetchErrorRunOutput(source, message);
      recordJobSourceRun(source, output);
      setNotice({ kind: "warning", message });
    } finally {
      setRunningId(null);
    }
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
      maxResults: String(source.maxResults ?? 25)
    });
  }

  function saveEdit(sourceId: string) {
    const maxResults = Number.parseInt(editDraft.maxResults, 10);
    updateJobSource(sourceId, {
      url: editDraft.url.trim(),
      kind: editDraft.kind,
      enabled: editDraft.enabled,
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
    setNewSource({ name: "", url: "", kind: "greenhouse", enabled: true, maxResults: 25 });
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
          const isRunning = runningId === source.id || source.runStatus === "running";
          return (
            <View key={source.id} style={styles.cardTile}>
              <Text style={styles.titleText}>{source.name}</Text>
              <Text style={styles.bodyText}>{source.url}</Text>
              <Text style={styles.helpText}>
                {JOB_SOURCE_KIND_LABELS[source.kind]} · {source.enabled ? "Enabled" : "Disabled"}{" "}
                · {JOB_SOURCE_CADENCE_LABELS[source.cadence]} · max{" "}
                {source.maxResults ?? 25}
              </Text>
              <Text style={styles.helpText}>
                Run status: {JOB_SOURCE_RUN_STATUS_LABELS[source.runStatus ?? "idle"]}
              </Text>
              {source.lastRunAt ? (
                <Text style={styles.helpText}>
                  Last run: {source.lastRunAt.slice(0, 16)} · fetched{" "}
                  {source.lastFetchedCount ?? 0}
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
                    onPress={() => handleRunSource(source.id)}
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
