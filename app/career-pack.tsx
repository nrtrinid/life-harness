import { Link } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Nav } from "../src/components/Nav";
import { PageHeader } from "../src/components/PageHeader";
import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { colors, styles } from "../src/components/styles";
import { buildCareerPackBriefingStats } from "../src/core/careerPackMatching";
import { useLifeHarness } from "../src/state/LifeHarnessState";

export default function CareerPackScreen() {
  const {
    careerSourcePack,
    resumeModules,
    jobCandidates,
    jobSources,
    importCareerSourcePack,
    clearCareerSourcePack
  } = useLifeHarness();
  const [paste, setPaste] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const pack = careerSourcePack?.pack;
  const stats = buildCareerPackBriefingStats(
    jobCandidates,
    pack ?? null,
    resumeModules,
    jobSources
  );

  function handleImport() {
    const trimmed = paste.trim();
    if (!trimmed) {
      setNotice({ kind: "warning", message: "Paste Career Source Pack JSON first." });
      return;
    }
    const result = importCareerSourcePack(trimmed);
    setNotice({
      kind: result.ok ? "success" : "warning",
      message: result.message ?? (result.ok ? "Imported." : "Import failed.")
    });
    if (result.ok) {
      setPaste("");
    }
  }

  function confirmClear() {
    const message =
      "Clear Career Pack removes matching and queue filters. Imported Resume Bank modules remain.";
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
      if (window.confirm(message)) {
        const result = clearCareerSourcePack();
        setNotice({
          kind: result.ok ? "success" : "warning",
          message: result.message ?? "Cleared."
        });
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
          setNotice({
            kind: result.ok ? "success" : "warning",
            message: result.message ?? "Cleared."
          });
        }
      }
    ]);
  }

  return (
    <Screen>
      <Nav />
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <PageHeader
        title="Career Pack"
        subtitle="Paste-import Career Source Pack v1 for deterministic queue matching. No cloud AI."
      />
      <ScrollView contentContainerStyle={styles.captureWrap}>
        <Section title="Import">
          <Text style={styles.helpText}>
            Paste exported Career Source Pack JSON. Secrets are rejected. Contact details may trigger
            warnings. Keep real packs in local resume_pack/ only — never commit them.
          </Text>
          <TextInput
            style={[styles.captureInput, { minHeight: 160, textAlignVertical: "top" }]}
            value={paste}
            onChangeText={setPaste}
            placeholder="Paste Career Source Pack v1 JSON…"
            placeholderTextColor={colors.inputPlaceholder}
            multiline
          />
          <View style={styles.cardActions}>
            <Pressable style={styles.primaryAction} onPress={handleImport}>
              <Text style={styles.primaryActionText}>Import Pack</Text>
            </Pressable>
            {pack ? (
              <Pressable style={styles.secondaryAction} onPress={confirmClear}>
                <Text style={styles.secondaryActionText}>Clear Pack</Text>
              </Pressable>
            ) : null}
          </View>
        </Section>

        {pack ? (
          <Section title="Imported Pack">
            <Text style={styles.bodyText}>
              Generated: {pack.extractionMetadata.generatedAt.slice(0, 16)}
            </Text>
            <Text style={styles.bodyText}>
              Imported: {careerSourcePack?.importedAt.slice(0, 16)}
            </Text>
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
              Use the synthetic fixture at public/fixtures/sample-career-source-pack.v1.json for
              testing, or paste your local resume_pack export for dogfood.
            </Text>
          </Section>
        )}

        <Section title="Links">
          <Link href="/resume-bank" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Resume Bank</Text>
            </Pressable>
          </Link>
          <Link href="/job-candidates" asChild>
            <Pressable style={[styles.secondaryAction, { marginTop: 8 }]}>
              <Text style={styles.secondaryActionText}>Job Candidates Queue</Text>
            </Pressable>
          </Link>
        </Section>
      </ScrollView>
    </Screen>
  );
}
