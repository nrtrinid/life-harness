import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import { Nav } from "../src/components/Nav";
import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { colors, styles } from "../src/components/styles";
import type { JobSourceInput } from "../src/core/actions";
import { FIT_SCORE_DISCLAIMER, JOB_SOURCE_CADENCE_LABELS, JOB_SOURCE_KIND_LABELS } from "../src/core/labels";
import {
  buildSuggestedSourceFromDetection,
  detectJobSourceFromUrl,
  normalizePastedUrl,
  type SourceDetectionResult
} from "../src/core/jobSourceDiscovery";
import {
  formatFitScore,
  getSuggestedResumeModules
} from "../src/core/jobScout";
import {
  RUNNER_UNREACHABLE_MESSAGE,
  RunnerUnreachableError,
  runSourceViaRunner
} from "../src/core/jobScoutRunnerClient";
import { buildTemporaryJobSource, isValidSourceUrl, type JobSourceRunOutput } from "../src/core/jobSourceRunner";
import { WORKDAY_ZERO_LISTINGS_MESSAGE } from "../src/core/jobSourceAdapters";
import type { JobSourceCadence, JobSourceKind } from "../src/core/types";
import { SOURCE_CANDIDATE_EXAMPLES, type SourceCandidateExample } from "../src/data/sourceCandidates";
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

const CONFIDENCE_LABELS = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence"
} as const;

function emptyForm(): JobSourceInput {
  return {
    name: "",
    url: "",
    kind: "greenhouse",
    enabled: true,
    maxResults: 25,
    cadence: "manual",
    notes: "",
    adapterNotes: ""
  };
}

export default function SourceSetupScreen() {
  const { jobCandidates, resumeModules, saveJobSourceFromSetup } = useLifeHarness();
  const [pasteUrl, setPasteUrl] = useState("");
  const [detection, setDetection] = useState<SourceDetectionResult | null>(null);
  const [form, setForm] = useState<JobSourceInput>(emptyForm());
  const [previewOutput, setPreviewOutput] = useState<JobSourceRunOutput | null>(null);
  const [importPreview, setImportPreview] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const canTest =
    form.name.trim().length > 0 &&
    isValidSourceUrl(form.url) &&
    (detection?.isRunnable === true || form.kind === "governmentjobs" || form.kind === "workday");

  const previewSucceeded =
    previewOutput !== null && previewOutput.result.errors.length === 0;

  const isWorkdayWeakPassPreview =
    form.kind === "workday" &&
    previewOutput !== null &&
    previewOutput.candidates.length === 0 &&
    previewOutput.result.errors.length === 0 &&
    previewOutput.result.message === WORKDAY_ZERO_LISTINGS_MESSAGE;

  const showWorkdayHelp = form.kind === "workday" || detection?.detectedKind === "workday";

  function applyDetection(result: SourceDetectionResult) {
    setDetection(result);
    const suggested = buildSuggestedSourceFromDetection(result);
    setForm((current) => ({
      ...current,
      name: suggested.name ?? current.name,
      url: suggested.url ?? result.runnableUrl ?? result.inputUrl,
      kind: suggested.kind ?? result.detectedKind,
      enabled: suggested.enabled ?? true,
      cadence: suggested.cadence ?? "manual",
      maxResults: suggested.maxResults ?? 25,
      adapterNotes: suggested.adapterNotes ?? "",
      notes: suggested.notes ?? ""
    }));
    setPreviewOutput(null);
    setImportPreview(false);
  }

  function handleDetect() {
    const normalized = normalizePastedUrl(pasteUrl);
    if (!normalized) {
      setNotice({ kind: "warning", message: "Paste a URL first." });
      return;
    }
    applyDetection(detectJobSourceFromUrl(normalized));
    setNotice(null);
  }

  function handleUseExample(example: SourceCandidateExample) {
    setPasteUrl(example.url);
    applyDetection(detectJobSourceFromUrl(example.url));
    setForm((current) => ({
      ...current,
      name: example.name,
      url: example.url,
      kind: example.kind,
      adapterNotes: example.notes
    }));
    setNotice(null);
  }

  async function handleTestSource() {
    if (!canTest) {
      setNotice({
        kind: "warning",
        message: detection?.isRunnable
          ? "Name and a valid runnable URL are required."
          : "This source kind is registry-only — save as a target without testing."
      });
      return;
    }

    setIsTesting(true);
    setPreviewOutput(null);
    setImportPreview(false);

    try {
      const tempSource = buildTemporaryJobSource(form);
      const output = await runSourceViaRunner({
        source: tempSource,
        existingCandidates: jobCandidates,
        resumeModules
      });
      setPreviewOutput(output);
      setNotice({
        kind: output.result.errors.length === 0 ? "success" : "warning",
        message: output.result.message
      });
    } catch (error) {
      const message =
        error instanceof RunnerUnreachableError ? RUNNER_UNREACHABLE_MESSAGE : "Source test failed.";
      setNotice({ kind: "warning", message });
    } finally {
      setIsTesting(false);
    }
  }

  function handleSaveSource() {
    if (!form.name.trim() || !form.url.trim()) {
      setNotice({ kind: "warning", message: "Name and URL are required." });
      return;
    }

    if (importPreview && !previewSucceeded) {
      setNotice({
        kind: "warning",
        message: "Run a successful test before importing preview candidates."
      });
      return;
    }

    const result = saveJobSourceFromSetup(
      {
        ...form,
        name: form.name.trim(),
        url: form.url.trim(),
        maxResults: form.maxResults ?? 25
      },
      previewOutput ?? undefined,
      importPreview
    );

    setNotice({
      kind: result.ok ? "success" : "warning",
      message: result.message ?? (result.ok ? "Source saved." : "Could not save source.")
    });

    if (result.ok) {
      setPasteUrl("");
      setDetection(null);
      setForm(emptyForm());
      setPreviewOutput(null);
      setImportPreview(false);
    }
  }

  const sampleCandidates = previewOutput?.candidates.slice(0, 5) ?? [];

  return (
    <Screen>
      <Nav />
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <Text style={styles.screenIntro}>
        Paste a careers or job-board URL, detect the adapter shape, test through the local runner,
        then save. Test is preview-only — candidates enter the queue only if you opt in on save.
        For fixture dogfood: use the GovernmentJobs or Workday Fixture example, or paste
        /fixtures/sample-governmentjobs-listing.html or /fixtures/sample-workday-search.json,
        set the matching kind, then Test Source.
      </Text>
      <ScrollView contentContainerStyle={styles.captureWrap}>
        <Section title="Paste URL">
          <TextInput
            style={styles.captureInput}
            value={pasteUrl}
            onChangeText={setPasteUrl}
            placeholder="https://boards.greenhouse.io/company or api URL"
            placeholderTextColor={colors.inputPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.primaryAction} onPress={handleDetect}>
            <Text style={styles.primaryActionText}>Detect</Text>
          </Pressable>
          {detection ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.bodyText}>
                Kind: {JOB_SOURCE_KIND_LABELS[detection.detectedKind]} ·{" "}
                {CONFIDENCE_LABELS[detection.confidence]} ·{" "}
                {detection.isRunnable ? "Runnable" : "Registry-only"}
              </Text>
              {detection.runnableUrl ? (
                <Text style={styles.helpText}>Runnable URL: {detection.runnableUrl}</Text>
              ) : null}
              {detection.notes.map((note) => (
                <Text key={note} style={styles.helpText}>
                  {note}
                </Text>
              ))}
              {detection.warnings.map((warning) => (
                <Text key={warning} style={styles.bodyText}>
                  {warning}
                </Text>
              ))}
            </View>
          ) : null}
        </Section>

        <Section title="Suggested Source">
          <Text style={styles.label}>Source name</Text>
          <TextInput
            style={styles.captureInput}
            value={form.name}
            onChangeText={(value) => setForm((current) => ({ ...current, name: value }))}
            placeholder="Company or board name"
            placeholderTextColor={colors.inputPlaceholder}
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Runnable URL</Text>
          <TextInput
            style={styles.captureInput}
            value={form.url}
            onChangeText={(value) => setForm((current) => ({ ...current, url: value }))}
            placeholder="https://..."
            placeholderTextColor={colors.inputPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Kind</Text>
          <View style={styles.cardActions}>
            {KIND_OPTIONS.map((kind) => (
              <Pressable
                key={kind}
                style={form.kind === kind ? styles.primaryAction : styles.secondaryAction}
                onPress={() => setForm((current) => ({ ...current, kind }))}
              >
                <Text
                  style={
                    form.kind === kind ? styles.primaryActionText : styles.secondaryActionText
                  }
                >
                  {JOB_SOURCE_KIND_LABELS[kind]}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.cardActions, { marginTop: 12, alignItems: "center" }]}>
            <Text style={styles.bodyText}>Enabled</Text>
            <Switch
              value={form.enabled ?? true}
              onValueChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
            />
          </View>
          <Text style={[styles.label, { marginTop: 12 }]}>Cadence</Text>
          <View style={styles.cardActions}>
            {CADENCE_OPTIONS.map((cadence) => (
              <Pressable
                key={cadence}
                style={form.cadence === cadence ? styles.primaryAction : styles.secondaryAction}
                onPress={() => setForm((current) => ({ ...current, cadence }))}
              >
                <Text
                  style={
                    form.cadence === cadence ? styles.primaryActionText : styles.secondaryActionText
                  }
                >
                  {JOB_SOURCE_CADENCE_LABELS[cadence]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.label, { marginTop: 12 }]}>Max results</Text>
          <TextInput
            style={styles.captureInput}
            value={String(form.maxResults ?? 25)}
            onChangeText={(value) => {
              const parsed = Number.parseInt(value, 10);
              setForm((current) => ({
                ...current,
                maxResults: Number.isFinite(parsed) && parsed > 0 ? parsed : 25
              }));
            }}
            keyboardType="number-pad"
            placeholder="25"
            placeholderTextColor={colors.inputPlaceholder}
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Adapter notes</Text>
          {showWorkdayHelp ? (
            <Text style={styles.helpText}>
              Workday pages often load jobs from a JSON endpoint behind the page. v0.9 supports Workday
              payload parsing, but some live URLs may need endpoint discovery before they return
              candidates. Default cadence: manual — change to daily/weekly only after a successful
              candidate-producing run.
            </Text>
          ) : null}
          <TextInput
            style={[styles.captureInput, { minHeight: 64 }]}
            value={form.adapterNotes ?? ""}
            onChangeText={(value) => setForm((current) => ({ ...current, adapterNotes: value }))}
            placeholder="Detection notes"
            placeholderTextColor={colors.inputPlaceholder}
            multiline
          />
        </Section>

        <Section title="Example sources to try">
          <Text style={styles.helpText}>
            Example source candidates. Test before saving — URLs may change over time.
          </Text>
          {SOURCE_CANDIDATE_EXAMPLES.map((example) => (
            <View key={`${example.kind}-${example.name}`} style={styles.cardTile}>
              <Text style={styles.titleText}>{example.name}</Text>
              <Text style={styles.helpText}>
                {JOB_SOURCE_KIND_LABELS[example.kind]} · {example.url}
              </Text>
              <Text style={styles.bodyText}>{example.notes}</Text>
              <Pressable
                style={styles.secondaryAction}
                onPress={() => handleUseExample(example)}
              >
                <Text style={styles.secondaryActionText}>Use this example</Text>
              </Pressable>
            </View>
          ))}
        </Section>

        <Section title="Test Source">
          <Text style={styles.helpText}>
            Dry-run through the local Job Scout Runner. No candidates are saved until you choose
            import on save. Fixture dogfood: paste /fixtures/sample-governmentjobs-listing.html or
            /fixtures/sample-workday-search.json, set the matching kind, then Test Source (or use a
            fixture example above).
          </Text>
          <Pressable
            style={styles.primaryAction}
            disabled={!canTest || isTesting}
            onPress={() => void handleTestSource()}
          >
            <Text style={styles.primaryActionText}>
              {isTesting ? "Testing..." : "Test Source"}
            </Text>
          </Pressable>
          {!detection?.isRunnable ? (
            <Text style={styles.helpText}>
              Registry-only sources can be saved as targets but cannot be tested or run yet.
            </Text>
          ) : null}
        </Section>

        {previewOutput ? (
          <Section title="Preview Results">
            <Text style={styles.bodyText}>
              Candidates: {previewOutput.candidates.length} · Skipped duplicates:{" "}
              {previewOutput.result.skippedDuplicates}
            </Text>
            {previewOutput.result.errors.length > 0 ? (
              previewOutput.result.errors.map((error) => (
                <Text key={error} style={styles.bodyText}>
                  Error: {error}
                </Text>
              ))
            ) : null}
            {isWorkdayWeakPassPreview ? (
              <Text style={styles.bodyText}>
                This Workday URL was recognized, but no job payload was found. It may need a future
                endpoint-discovery adapter before it can return candidates. Save as registry-only or
                keep as a manual source for now.
              </Text>
            ) : null}
            {sampleCandidates.map((candidate) => {
              const suggested = getSuggestedResumeModules(candidate, resumeModules);
              return (
                <View key={candidate.id} style={styles.cardTile}>
                  <Text style={styles.titleText}>
                    {candidate.company} — {candidate.roleTitle}
                  </Text>
                  <Text style={styles.bodyText}>{formatFitScore(candidate.fitScore)}</Text>
                  <Text style={styles.helpText}>{FIT_SCORE_DISCLAIMER}</Text>
                  {candidate.sourceUrl ? (
                    <Text style={styles.helpText}>{candidate.sourceUrl}</Text>
                  ) : null}
                  {suggested.length > 0 ? (
                    <Text style={styles.helpText}>
                      Suggested modules: {suggested.map((item) => item.title).join(", ")}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </Section>
        ) : null}

        <Section title="Save Source">
          {previewSucceeded ? (
            <View style={[styles.cardActions, { alignItems: "center", marginBottom: 12 }]}>
              <Switch value={importPreview} onValueChange={setImportPreview} />
              <Text style={styles.bodyText}>Also import preview candidates</Text>
            </View>
          ) : null}
          <Pressable style={styles.primaryAction} onPress={handleSaveSource}>
            <Text style={styles.primaryActionText}>Save Source</Text>
          </Pressable>
          <Link href="/job-sources" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Back to Sources</Text>
            </Pressable>
          </Link>
        </Section>
      </ScrollView>
    </Screen>
  );
}
