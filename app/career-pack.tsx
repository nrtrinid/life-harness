import { Link } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { PageHeader } from "../src/components/PageHeader";
import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { colors, styles } from "../src/components/styles";
import {
  formatCareerPackRefreshSummary,
  hasCareerPackRefreshChanges,
  summarizeCareerPackRefresh
} from "../src/core/careerPackRefresh";
import { buildCareerPackBriefingStats } from "../src/core/careerPackMatching";
import { parseCareerSourcePackJson } from "../src/core/careerSourcePack";
import { useCareerPackFilePicker } from "../src/hooks/useCareerPackFilePicker";
import { useLifeHarness } from "../src/state/LifeHarnessState";

interface PackPreviewState {
  json: string;
  fileName: string;
  summaryLines: string[];
  isNewerThanStored: boolean;
  incomingGeneratedAt: string;
  parseWarnings: string[];
  hasChanges: boolean;
}

export default function CareerPackScreen() {
  const {
    careerSourcePack,
    resumeModules,
    jobCandidates,
    jobSources,
    importCareerSourcePack,
    clearCareerSourcePack
  } = useLifeHarness();
  const { pickCareerPackFile, loadCareerPackTestFixture } = useCareerPackFilePicker();
  const [paste, setPaste] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [preview, setPreview] = useState<PackPreviewState | null>(null);
  const [showAdvancedPaste, setShowAdvancedPaste] = useState(false);

  const pack = careerSourcePack?.pack;
  const stats = buildCareerPackBriefingStats(
    jobCandidates,
    pack ?? null,
    resumeModules,
    jobSources
  );

  function showNotice(kind: NoticeState["kind"], message: string) {
    setNotice({ kind, message });
  }

  function buildPreviewFromJson(json: string, fileName: string): PackPreviewState | null {
    const parsed = parseCareerSourcePackJson(json);
    if (!parsed.ok) {
      showNotice("error", parsed.error);
      return null;
    }

    const summary = summarizeCareerPackRefresh(careerSourcePack, parsed.pack, parsed.warnings);
    return {
      json,
      fileName,
      summaryLines: formatCareerPackRefreshSummary(summary),
      isNewerThanStored: summary.isNewerThanStored,
      incomingGeneratedAt: summary.incomingGeneratedAt,
      parseWarnings: summary.parseWarnings,
      hasChanges: hasCareerPackRefreshChanges(summary) || !careerSourcePack
    };
  }

  async function handlePickFile() {
    const picked = await pickCareerPackFile();
    if (!picked) {
      return;
    }
    const nextPreview = buildPreviewFromJson(picked.json, picked.fileName);
    if (nextPreview) {
      setPreview(nextPreview);
      setNotice(null);
    }
  }

  async function handleLoadTestFixture() {
    const fixture = await loadCareerPackTestFixture();
    if (!fixture) {
      showNotice("error", "Failed to load test fixture.");
      return;
    }
    const nextPreview = buildPreviewFromJson(fixture.json, fixture.fileName);
    if (nextPreview) {
      setPreview(nextPreview);
      setNotice(null);
    }
  }

  function handleApplyPreview() {
    if (!preview) {
      return;
    }
    const result = importCareerSourcePack(preview.json);
    showNotice(
      result.ok ? "success" : "warning",
      result.ok
        ? `${result.message ?? "Imported."} (from ${preview.fileName})`
        : result.message ?? "Import failed."
    );
    if (result.ok) {
      setPreview(null);
      setPaste("");
    }
  }

  function handleCancelPreview() {
    setPreview(null);
  }

  function handleImportPaste() {
    const trimmed = paste.trim();
    if (!trimmed) {
      showNotice("warning", "Paste Career Source Pack JSON first.");
      return;
    }
    const result = importCareerSourcePack(trimmed);
    showNotice(result.ok ? "success" : "warning", result.message ?? (result.ok ? "Imported." : "Import failed."));
    if (result.ok) {
      setPaste("");
      setPreview(null);
    }
  }

  function confirmClear() {
    const message =
      "This clears Career Pack matching and queue filters. Imported Resume Bank modules remain.";
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
      if (window.confirm(message)) {
        const result = clearCareerSourcePack();
        showNotice(result.ok ? "success" : "warning", result.message ?? "Cleared.");
        setPreview(null);
      }
      return;
    }
    Alert.alert("Clear Career Pack?", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          const result = clearCareerSourcePack();
          showNotice(result.ok ? "success" : "warning", result.message ?? "Cleared.");
          setPreview(null);
        }
      }
    ]);
  }

  const builtAt = pack?.extractionMetadata.generatedAt;
  const importedAt = careerSourcePack?.importedAt;
  const builtNewerThanImported =
    builtAt && importedAt ? builtAt > importedAt : false;

  return (
    <Screen>
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <PageHeader
        title="Career Pack"
        subtitle="Refresh from a local pack file or paste-import Career Source Pack v1. No cloud AI."
      />
      <ScrollView contentContainerStyle={styles.captureWrap}>
        <Section title="Refresh from file">
          <Text style={styles.helpText}>
            Build locally, then pick the JSON file. Secrets are rejected. Contact details may trigger
            warnings. Keep real source in private/career-source/ and generated packs in resume_pack/
            — both gitignored; never commit them.
          </Text>
          {Platform.OS === "web" ? (
            <>
              <Text style={styles.helpText}>
                Local private source: npm run career:pack:build:local
              </Text>
              <Text style={styles.helpText}>
                Validate local pack: npm run career:pack:validate:local
              </Text>
              <Text style={styles.helpText}>
                External repo: npm run career:pack:build -- --source ../career-source --out
                resume_pack/life_harness_career_pack.v1.json
              </Text>
            </>
          ) : null}
          <View style={styles.cardActions}>
            <Pressable style={styles.primaryAction} onPress={() => void handlePickFile()}>
              <Text style={styles.primaryActionText}>Pick pack file</Text>
            </Pressable>
            {Platform.OS === "web" ? (
              <Pressable style={styles.secondaryAction} onPress={() => void handleLoadTestFixture()}>
                <Text style={styles.secondaryActionText}>Load test fixture</Text>
              </Pressable>
            ) : null}
          </View>
        </Section>

        {preview ? (
          <Section title="Preview refresh">
            <Text style={styles.bodyText}>File: {preview.fileName}</Text>
            <Text style={styles.bodyText}>
              Built: {preview.incomingGeneratedAt.slice(0, 16)}
            </Text>
            {preview.isNewerThanStored ? (
              <Text style={styles.listItem}>▸ Newer than currently imported pack</Text>
            ) : (
              <Text style={styles.helpText}>Same or older build timestamp as imported pack.</Text>
            )}
            {preview.summaryLines.map((line) => (
              <Text key={line} style={styles.listItem}>
                ▸ {line}
              </Text>
            ))}
            <Text style={styles.helpText}>
              Resume Bank modules with matching ids will be updated.
            </Text>
            {preview.parseWarnings.length > 0 ? (
              <>
                <Text style={styles.label}>Import warnings</Text>
                {preview.parseWarnings.slice(0, 4).map((warning) => (
                  <Text key={warning} style={styles.helpText}>
                    △ {warning}
                  </Text>
                ))}
              </>
            ) : null}
            <View style={styles.cardActions}>
              <Pressable style={styles.primaryAction} onPress={handleApplyPreview}>
                <Text style={styles.primaryActionText}>
                  {preview.hasChanges ? "Apply refresh" : "Apply import"}
                </Text>
              </Pressable>
              <Pressable style={styles.secondaryAction} onPress={handleCancelPreview}>
                <Text style={styles.secondaryActionText}>Cancel preview</Text>
              </Pressable>
            </View>
          </Section>
        ) : null}

        <Section title="Or paste JSON">
          <Pressable
            style={styles.secondaryAction}
            onPress={() => setShowAdvancedPaste((value) => !value)}
          >
            <Text style={styles.secondaryActionText}>
              {showAdvancedPaste ? "Hide paste import" : "Show paste import"}
            </Text>
          </Pressable>
          {showAdvancedPaste ? (
            <>
              <TextInput
                style={[styles.captureInput, { minHeight: 160, textAlignVertical: "top", marginTop: 8 }]}
                value={paste}
                onChangeText={setPaste}
                placeholder="Paste Career Source Pack v1 JSON…"
                placeholderTextColor={colors.inputPlaceholder}
                multiline
              />
              <View style={styles.cardActions}>
                <Pressable style={styles.primaryAction} onPress={handleImportPaste}>
                  <Text style={styles.primaryActionText}>Import Pack</Text>
                </Pressable>
              </View>
            </>
          ) : null}
          {pack ? (
            <Pressable style={[styles.secondaryAction, { marginTop: 8 }]} onPress={confirmClear}>
              <Text style={styles.secondaryActionText}>Clear Pack</Text>
            </Pressable>
          ) : null}
        </Section>

        {pack ? (
          <Section title="Imported Pack">
            <Text style={styles.bodyText}>Built: {builtAt?.slice(0, 16)}</Text>
            <Text style={styles.bodyText}>Imported: {importedAt?.slice(0, 16)}</Text>
            {builtNewerThanImported ? (
              <Text style={styles.helpText}>
                Local build may be newer than last import — pick file to refresh.
              </Text>
            ) : null}
            <Text style={styles.listItem}>
              ▸ {pack.resumeModules.length} resume modules · {pack.roleRecipes.length} role recipes ·{" "}
              {pack.interviewStories.length} interview stories
            </Text>
            <Text style={styles.listItem}>
              ▸ Evidence gaps in queue: {stats.evidenceGapCount}
            </Text>
            <Text style={styles.listItem}>
              ▸ Claim rules: {pack.claimsSafety.globalClaimsToAvoid.length} global ·{" "}
              {pack.claimsSafety.unsupportedClaims.length} unsupported
            </Text>
            <Text style={styles.label}>Headline</Text>
            <Text style={styles.bodyText}>{pack.careerPositioning.headline}</Text>
            <Text style={styles.label}>Default project order</Text>
            <Text style={styles.bodyText}>
              {pack.careerPositioning.bestDefaultProjectOrder.join(" → ")}
            </Text>
            <Text style={styles.label}>Role recipes</Text>
            {pack.roleRecipes.map((recipe) => (
              <Text key={recipe.id} style={styles.listItem}>
                ▸ {recipe.title} ({recipe.id})
              </Text>
            ))}
            {pack.extractionMetadata.warnings.length > 0 ? (
              <>
                <Text style={styles.label}>Pack warnings</Text>
                {pack.extractionMetadata.warnings.slice(0, 4).map((warning) => (
                  <Text key={warning} style={styles.helpText}>
                    △ {warning}
                  </Text>
                ))}
              </>
            ) : null}
          </Section>
        ) : (
          <Section title="Status">
            <Text style={styles.emptyText}>No Career Pack imported yet.</Text>
            <Text style={styles.helpText}>
              Pick a built pack file, load the web test fixture, or paste JSON. Synthetic fixture:
              public/fixtures/sample-career-source-pack.v1.json
            </Text>
          </Section>
        )}

        <Section title="Links">
          <Link href="/resume-bank" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Resume Bank</Text>
            </Pressable>
          </Link>
          <Link href="/career?tab=review" asChild>
            <Pressable style={StyleSheet.flatten([styles.secondaryAction, { marginTop: 8 }])}>
              <Text style={styles.secondaryActionText}>Review queue</Text>
            </Pressable>
          </Link>
        </Section>
      </ScrollView>
    </Screen>
  );
}
