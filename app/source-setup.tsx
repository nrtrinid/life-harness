import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { colors, styles } from "../src/components/styles";
import type { JobSourceInput } from "../src/core/actions";
import { FIT_SCORE_DISCLAIMER, JOB_SOURCE_CADENCE_LABELS, JOB_SOURCE_KIND_LABELS } from "../src/core/labels";
import {
  buildSuggestedSourceFromDetection,
  deriveWorkdayCxsEndpointUrl,
  detectJobSourceFromUrl,
  normalizePastedUrl,
  type SourceDetectionResult
} from "../src/core/jobSourceDiscovery";
import {
  formatFitScore,
  getSuggestedResumeModules
} from "../src/core/jobScout";
import { RUNNER_UNREACHABLE_MESSAGE } from "../src/core/jobScoutRunnerClient";
import {
  isRunnerUnreachableMutationError,
  useRunJobSourceMutation
} from "../src/network";
import { buildTemporaryJobSource, isValidSourceUrl, type JobSourceRunOutput } from "../src/core/jobSourceRunner";
import { ICIMS_ZERO_LISTINGS_MESSAGE, WORKDAY_ZERO_LISTINGS_MESSAGE } from "../src/core/jobSourceAdapters";
import { parseJsonBodyText, validateJobSourceRequestConfig } from "../src/core/jobSourceRequestConfig";
import type { JobSourceCadence, JobSourceKind, JobSourceRequestMethod } from "../src/core/types";
import { SOURCE_CANDIDATE_EXAMPLES, type SourceCandidateExample } from "../src/data/sourceCandidates";
import {
  applyWorkdayEndpointTemplate,
  getWorkdayEndpointTemplate,
  isWorkdayTemplateRunnable,
  WORKDAY_CXS_BODY_TEMPLATE,
  WORKDAY_ENDPOINT_TEMPLATES
} from "../src/data/workdayEndpointTemplates";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const KIND_OPTIONS: JobSourceKind[] = [
  "greenhouse",
  "lever",
  "ashby",
  "governmentjobs",
  "workday",
  "icims",
  "jobposting_jsonld",
  "manual",
  "company_careers"
];

const CADENCE_OPTIONS: JobSourceCadence[] = ["manual", "daily", "weekly"];

const WORKDAY_CXS_BODY_TEMPLATE_TEXT = JSON.stringify(WORKDAY_CXS_BODY_TEMPLATE, null, 2);

const REQUEST_METHOD_OPTIONS: JobSourceRequestMethod[] = ["GET", "POST"];

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
  const [endpointMode, setEndpointMode] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [requestMethod, setRequestMethod] = useState<JobSourceRequestMethod>("POST");
  const [bodyJsonText, setBodyJsonText] = useState(WORKDAY_CXS_BODY_TEMPLATE_TEXT);
  const [paginationEnabled, setPaginationEnabled] = useState(false);
  const [paginationLimit, setPaginationLimit] = useState("20");
  const [paginationMaxPages, setPaginationMaxPages] = useState("3");
  const [runJobSource] = useRunJobSourceMutation();

  const activeUrl = endpointMode ? endpointUrl : form.url;

  const canTest =
    form.name.trim().length > 0 &&
    isValidSourceUrl(activeUrl) &&
    (detection?.isRunnable === true ||
      form.kind === "governmentjobs" ||
      form.kind === "workday" ||
      form.kind === "icims");

  const previewSucceeded =
    previewOutput !== null && previewOutput.result.errors.length === 0;

  const isWorkdayWeakPassPreview =
    form.kind === "workday" &&
    previewOutput !== null &&
    previewOutput.candidates.length === 0 &&
    previewOutput.result.errors.length === 0 &&
    previewOutput.result.message === WORKDAY_ZERO_LISTINGS_MESSAGE;

  const isIcimsWeakPassPreview =
    form.kind === "icims" &&
    previewOutput !== null &&
    previewOutput.candidates.length === 0 &&
    previewOutput.result.errors.length === 0 &&
    previewOutput.result.message === ICIMS_ZERO_LISTINGS_MESSAGE;

  const isWeakPassPreview = isWorkdayWeakPassPreview || isIcimsWeakPassPreview;
  const previewProducedCandidates = (previewOutput?.candidates.length ?? 0) > 0;
  const suggestedWorkdayEndpoint = deriveWorkdayCxsEndpointUrl(
    endpointMode ? endpointUrl : form.url || detection?.runnableUrl || ""
  );

  const showWorkdayHelp = form.kind === "workday" || detection?.detectedKind === "workday";
  const cadenceLocked =
    (endpointMode && showWorkdayHelp) ||
    ((form.kind === "workday" || form.kind === "icims") && !previewProducedCandidates);

  function resetEndpointMode() {
    setEndpointMode(false);
    setEndpointUrl("");
    setRequestMethod("POST");
    setBodyJsonText(WORKDAY_CXS_BODY_TEMPLATE_TEXT);
    setPaginationEnabled(false);
    setPaginationLimit("20");
    setPaginationMaxPages("3");
    setForm((current) => ({ ...current, requestConfig: undefined }));
  }

  function enableEndpointMode(seedUrl?: string) {
    setEndpointMode(true);
    setEndpointUrl(seedUrl ?? form.url);
    setRequestMethod("POST");
    setBodyJsonText(WORKDAY_CXS_BODY_TEMPLATE_TEXT);
    setPaginationEnabled(false);
    setPaginationLimit("20");
    setPaginationMaxPages("3");
    setForm((current) => ({ ...current, cadence: "manual", requestConfig: undefined }));
  }

  function applyWorkdayTemplate(templateId: string) {
    const template = getWorkdayEndpointTemplate(templateId);
    if (!template) {
      return;
    }
    if (!isWorkdayTemplateRunnable(template)) {
      setNotice({ kind: "info", message: template.notes });
      setForm((current) => ({
        ...current,
        name: template.name,
        kind: "workday",
        url: template.pageUrl ?? current.url,
        cadence: "manual",
        notes: template.notes,
        adapterNotes: template.notes
      }));
      return;
    }
    const applied = applyWorkdayEndpointTemplate(template);
    enableEndpointMode(applied.url);
    setForm((current) => ({
      ...current,
      name: applied.name ?? current.name,
      kind: "workday",
      url: applied.url ?? current.url,
      cadence: "manual",
      notes: applied.notes ?? "",
      adapterNotes: applied.adapterNotes ?? ""
    }));
    setEndpointUrl(applied.url ?? "");
    setRequestMethod(applied.requestConfig?.method ?? "POST");
    setBodyJsonText(JSON.stringify(applied.requestConfig?.bodyJson ?? WORKDAY_CXS_BODY_TEMPLATE, null, 2));
    const pagination = applied.requestConfig?.pagination;
    if (pagination?.mode === "workday_offset") {
      setPaginationEnabled(true);
      setPaginationLimit(String(pagination.limit ?? 20));
      setPaginationMaxPages(String(pagination.maxPages ?? 3));
    } else {
      setPaginationEnabled(false);
    }
    setPreviewOutput(null);
    setNotice({ kind: "success", message: `Applied ${template.name} template.` });
  }

  function handleFillBodyTemplate() {
    setBodyJsonText(WORKDAY_CXS_BODY_TEMPLATE_TEXT);
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      void navigator.clipboard.writeText(WORKDAY_CXS_BODY_TEMPLATE_TEXT);
    }
  }

  function buildSourcePayload():
    | { ok: true; input: JobSourceInput; tempSource: ReturnType<typeof buildTemporaryJobSource> }
    | { ok: false; message: string } {
    let requestConfig = form.requestConfig;
    if (endpointMode && showWorkdayHelp) {
      const parsedBody = parseJsonBodyText(bodyJsonText);
      if (!parsedBody.ok) {
        return { ok: false, message: parsedBody.error };
      }
      const limit = Number.parseInt(paginationLimit, 10);
      const maxPages = Number.parseInt(paginationMaxPages, 10);
      requestConfig = {
        method: requestMethod,
        bodyJson: parsedBody.value,
        pagination: paginationEnabled
          ? {
              mode: "workday_offset",
              limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
              maxPages: Number.isFinite(maxPages) && maxPages > 0 ? maxPages : 3
            }
          : undefined
      };
      const configValidation = validateJobSourceRequestConfig(requestConfig);
      if (!configValidation.ok) {
        return { ok: false, message: configValidation.error };
      }
    }

    const input: JobSourceInput = {
      ...form,
      name: form.name.trim(),
      url: (endpointMode ? endpointUrl : form.url).trim(),
      cadence: endpointMode ? "manual" : form.cadence,
      maxResults: form.maxResults ?? 25,
      requestConfig: endpointMode ? requestConfig : undefined
    };

    return {
      ok: true,
      input,
      tempSource: buildTemporaryJobSource(input)
    };
  }

  function applyDetection(result: SourceDetectionResult) {
    resetEndpointMode();
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
    const isEndpointFixture = example.url.includes("sample-workday-cxs-response");
    if (isEndpointFixture) {
      enableEndpointMode(example.url);
    }
    setForm((current) => ({
      ...current,
      name: example.name,
      url: example.url,
      kind: example.kind,
      cadence: isEndpointFixture ? "manual" : current.cadence,
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

    const payload = buildSourcePayload();
    if (!payload.ok) {
      setNotice({ kind: "warning", message: payload.message });
      return;
    }

    setIsTesting(true);
    setPreviewOutput(null);
    setImportPreview(false);

    try {
      const output = await runJobSource({
        source: payload.tempSource,
        existingCandidates: jobCandidates,
        resumeModules
      }).unwrap();
      setPreviewOutput(output);
      setNotice({
        kind: output.result.errors.length === 0 ? "success" : "warning",
        message: output.result.message
      });
    } catch (error) {
      const message = isRunnerUnreachableMutationError(error)
        ? RUNNER_UNREACHABLE_MESSAGE
        : "Source test failed.";
      setNotice({ kind: "warning", message });
    } finally {
      setIsTesting(false);
    }
  }

  function handleCadencePress(cadence: JobSourceCadence) {
    if (cadence !== "manual" && !previewProducedCandidates) {
      setNotice({
        kind: "warning",
        message:
          "Run a candidate-producing test before setting daily or weekly cadence."
      });
      return;
    }
    setForm((current) => ({ ...current, cadence }));
  }

  function handleUseSuggestedEndpoint() {
    if (!suggestedWorkdayEndpoint) {
      return;
    }
    enableEndpointMode(suggestedWorkdayEndpoint);
    setEndpointUrl(suggestedWorkdayEndpoint);
    setNotice({
      kind: "info",
      message: "Suggested CXS endpoint applied — Test Source before saving."
    });
  }

  function handleSaveSource() {
    if (!form.name.trim() || !(endpointMode ? endpointUrl.trim() : form.url.trim())) {
      setNotice({ kind: "warning", message: "Name and URL are required." });
      return;
    }

    const payload = buildSourcePayload();
    if (!payload.ok) {
      setNotice({ kind: "warning", message: payload.message });
      return;
    }

    if (payload.input.cadence !== "manual" && !previewProducedCandidates) {
      setNotice({
        kind: "warning",
        message: "Daily/weekly cadence requires a successful candidate-producing preview."
      });
      return;
    }

    if (importPreview && !previewSucceeded) {
      setNotice({
        kind: "warning",
        message: "Run a successful test before importing preview candidates."
      });
      return;
    }

    const inputToSave = isWeakPassPreview ? { ...payload.input, enabled: false } : payload.input;
    const result = saveJobSourceFromSetup(inputToSave, previewOutput ?? undefined, importPreview);

    setNotice({
      kind: result.ok ? "success" : "warning",
      message:
        result.message ??
        (result.ok
          ? isWeakPassPreview
            ? "Source saved as disabled until endpoint produces candidates."
            : "Source saved."
          : "Could not save source.")
    });

    if (result.ok) {
      setPasteUrl("");
      setDetection(null);
      setForm(emptyForm());
      resetEndpointMode();
      setPreviewOutput(null);
      setImportPreview(false);
    }
  }

  const previewEndpointBacked = endpointMode || Boolean(form.requestConfig);

  const sampleCandidates = previewOutput?.candidates.slice(0, 5) ?? [];

  return (
    <Screen>
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
          {cadenceLocked ? (
            <Text style={styles.helpText}>
              Manual — endpoint-backed. Endpoint-backed Workday sources default to Manual. Only change
              cadence after a successful candidate-producing run.
            </Text>
          ) : (
            <View style={styles.cardActions}>
              {CADENCE_OPTIONS.map((cadence) => (
                <Pressable
                  key={cadence}
                  style={form.cadence === cadence ? styles.primaryAction : styles.secondaryAction}
                  onPress={() => handleCadencePress(cadence)}
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
          )}
          {showWorkdayHelp ? (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.titleText}>Workday Endpoint Needed</Text>
              <Text style={styles.helpText}>
                Workday page URLs often return an HTML shell. To make this source runnable, open
                DevTools Network while loading or searching the Workday jobs page, find the JSON job
                search request, and paste the endpoint URL and JSON body here. Do not paste cookies,
                authorization headers, or private data.
              </Text>
              <View style={[styles.cardActions, { marginTop: 8 }]}>
                <Pressable
                  style={!endpointMode ? styles.primaryAction : styles.secondaryAction}
                  onPress={() => {
                    resetEndpointMode();
                    setForm((current) => ({
                      ...current,
                      url: detection?.runnableUrl ?? current.url
                    }));
                  }}
                >
                  <Text
                    style={
                      !endpointMode ? styles.primaryActionText : styles.secondaryActionText
                    }
                  >
                    Use detected page URL
                  </Text>
                </Pressable>
                <Pressable
                  style={endpointMode ? styles.primaryAction : styles.secondaryAction}
                  onPress={() => enableEndpointMode(detection?.runnableUrl ?? form.url)}
                >
                  <Text
                    style={endpointMode ? styles.primaryActionText : styles.secondaryActionText}
                  >
                    Use endpoint mode
                  </Text>
                </Pressable>
                {suggestedWorkdayEndpoint ? (
                  <Pressable style={styles.secondaryAction} onPress={handleUseSuggestedEndpoint}>
                    <Text style={styles.secondaryActionText}>Use suggested endpoint</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={styles.label}>Workday endpoint templates</Text>
                <View style={styles.cardActions}>
                  <Pressable
                    style={styles.secondaryAction}
                    onPress={() => applyWorkdayTemplate("northrop-workday-cxs")}
                  >
                    <Text style={styles.secondaryActionText}>Use Northrop endpoint template</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryAction}
                    onPress={() => applyWorkdayTemplate("workday-endpoint-fixture")}
                  >
                    <Text style={styles.secondaryActionText}>Use Workday fixture template</Text>
                  </Pressable>
                </View>
                {WORKDAY_ENDPOINT_TEMPLATES.filter((template) => template.endpointNeeded).map(
                  (template) => (
                    <View key={template.id} style={[styles.cardTile, { marginTop: 8 }]}>
                      <Text style={styles.titleText}>{template.name}</Text>
                      <Text style={styles.bodyText}>{template.notes}</Text>
                      <Pressable
                        style={styles.secondaryAction}
                        onPress={() => applyWorkdayTemplate(template.id)}
                      >
                        <Text style={styles.secondaryActionText}>Show guide</Text>
                      </Pressable>
                    </View>
                  )
                )}
              </View>
              {endpointMode ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.label}>Endpoint URL</Text>
                  <TextInput
                    style={styles.captureInput}
                    value={endpointUrl}
                    onChangeText={setEndpointUrl}
                    placeholder="https://.../wday/cxs/.../jobs or /fixtures/..."
                    placeholderTextColor={colors.inputPlaceholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={[styles.label, { marginTop: 12 }]}>Request method</Text>
                  <View style={styles.cardActions}>
                    {REQUEST_METHOD_OPTIONS.map((method) => (
                      <Pressable
                        key={method}
                        style={requestMethod === method ? styles.primaryAction : styles.secondaryAction}
                        onPress={() => setRequestMethod(method)}
                      >
                        <Text
                          style={
                            requestMethod === method
                              ? styles.primaryActionText
                              : styles.secondaryActionText
                          }
                        >
                          {method}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={[styles.label, { marginTop: 12 }]}>JSON request body</Text>
                  <Pressable style={styles.secondaryAction} onPress={handleFillBodyTemplate}>
                    <Text style={styles.secondaryActionText}>Fill body template</Text>
                  </Pressable>
                  <TextInput
                    style={[styles.captureInput, { minHeight: 120 }]}
                    value={bodyJsonText}
                    onChangeText={setBodyJsonText}
                    placeholder='{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}'
                    placeholderTextColor={colors.inputPlaceholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline
                  />
                  <View style={[styles.cardActions, { marginTop: 12, alignItems: "center" }]}>
                    <Text style={styles.bodyText}>Enable bounded pagination</Text>
                    <Switch
                      value={paginationEnabled}
                      onValueChange={setPaginationEnabled}
                      disabled={requestMethod !== "POST"}
                    />
                  </View>
                  {paginationEnabled ? (
                    <View style={{ marginTop: 8 }}>
                      <Text style={styles.label}>Page limit</Text>
                      <TextInput
                        style={styles.captureInput}
                        value={paginationLimit}
                        onChangeText={setPaginationLimit}
                        keyboardType="number-pad"
                        placeholder="20"
                        placeholderTextColor={colors.inputPlaceholder}
                      />
                      <Text style={[styles.label, { marginTop: 8 }]}>Max pages</Text>
                      <TextInput
                        style={styles.captureInput}
                        value={paginationMaxPages}
                        onChangeText={setPaginationMaxPages}
                        keyboardType="number-pad"
                        placeholder="3"
                        placeholderTextColor={colors.inputPlaceholder}
                      />
                      <Text style={styles.helpText}>
                        Sequential offset pagination — bounded by limit, max pages, and effective
                        max results.
                      </Text>
                    </View>
                  ) : null}
                  <Text style={[styles.helpText, { marginTop: 8 }]}>
                    Accept: application/json{"\n"}Content-Type: application/json
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
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
            {previewEndpointBacked ? (
              <Text style={styles.helpText}>Endpoint-backed · {requestMethod}</Text>
            ) : null}
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
            {isWeakPassPreview ? (
              <Text style={styles.bodyText}>
                This Workday URL was recognized, but no job payload was found. It may need a future
                endpoint-discovery adapter before it can return candidates. Save as registry-only or
                keep as a manual source for now.
              </Text>
            ) : null}
            {isIcimsWeakPassPreview && !isWorkdayWeakPassPreview ? (
              <Text style={styles.bodyText}>
                This iCIMS URL was recognized, but no listings were found. The portal may redirect
                outside iframe mode — try the *.icims.com /jobs/search URL with in_iframe=1, or use
                the local fixture to verify the adapter.
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
