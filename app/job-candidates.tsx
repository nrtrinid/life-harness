import { Link, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Platform, Pressable, Text, TextInput, View } from "react-native";

import { PageHeader } from "../src/components/PageHeader";
import { Notice, type NoticeState } from "../src/components/Notice";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { colors, styles } from "../src/components/styles";
import {
  filterAndSortCandidatesWithCareerPack,
  type CareerPackCandidateFilters,
  type CareerPackSortMode
} from "../src/core/careerPackCandidateFilters";
import {
  matchCandidatesWithCareerPack,
  type CareerCandidateMatch,
  type CareerFitTier
} from "../src/core/careerPackMatching";
import {
  FIT_SCORE_DISCLAIMER,
  JOB_CANDIDATE_ORIGIN_LABELS,
  JOB_CANDIDATE_STATUS_LABELS
} from "../src/core/labels";
import { buildJobFindingsSummary } from "../src/core/jobFindings";
import { formatFitScore } from "../src/core/jobScout";
import {
  buildCandidateResumePacket,
  RESUME_MODULE_SECTION_LABELS
} from "../src/core/resumeModuleBank";
import type { JobCandidate, JobCandidateStatus } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

const STATUS_ORDER: JobCandidateStatus[] = ["new", "saved", "dismissed", "card_created"];
const FIT_TIERS: Array<CareerFitTier | "all"> = ["all", "strong", "mixed", "weak"];
const SORT_MODES: CareerPackSortMode[] = ["best_fit", "newest", "queue_order"];

function sortByFitScore(candidates: JobCandidate[]): JobCandidate[] {
  return [...candidates].sort((a, b) => b.fitScore - a.fitScore);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

function openSourceUrl(url: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  void Linking.openURL(url);
}

function tierLabel(tier: CareerFitTier): string {
  if (tier === "strong") {
    return "Strong pack fit";
  }
  if (tier === "weak") {
    return "Weak pack fit";
  }
  return "Mixed pack fit";
}

export default function JobCandidatesScreen() {
  const router = useRouter();
  const {
    jobCandidates,
    jobSources,
    jobSourceRuns,
    resumeModules,
    careerSourcePack,
    saveJobCandidate,
    dismissJobCandidate,
    approveJobCandidate
  } = useLifeHarness();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fitTier, setFitTier] = useState<CareerFitTier | "all">("all");
  const [roleRecipeId, setRoleRecipeId] = useState<string | "all">("all");
  const [moduleId, setModuleId] = useState<string | "all">("all");
  const [hideWeak, setHideWeak] = useState(false);
  const [hideCautions, setHideCautions] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState<CareerPackSortMode>("best_fit");

  const pack = careerSourcePack?.pack ?? null;
  const findings = buildJobFindingsSummary(jobCandidates, jobSources, jobSourceRuns, new Date());
  const bestResumePacket = findings.bestCandidate
    ? buildCandidateResumePacket(findings.bestCandidate, resumeModules)
    : null;

  const matchesById = useMemo(() => {
    if (!pack) {
      return new Map<string, CareerCandidateMatch>();
    }
    return matchCandidatesWithCareerPack(
      jobCandidates,
      pack,
      resumeModules,
      jobSources
    );
  }, [jobCandidates, pack, resumeModules, jobSources]);

  const filters: CareerPackCandidateFilters = {
    fitTier,
    roleRecipeId,
    moduleId,
    hideWeak,
    hideCautions,
    searchText
  };

  function handleAction(
    action: "save" | "dismiss" | "approve",
    candidateId: string
  ) {
    const result =
      action === "save"
        ? saveJobCandidate(candidateId)
        : action === "dismiss"
          ? dismissJobCandidate(candidateId)
          : approveJobCandidate(candidateId);

    setNotice({
      kind: result.ok ? "success" : "warning",
      message: result.message ?? "Action completed."
    });

    if (action === "approve" && result.ok && "cardId" in result && result.cardId) {
      router.push(`/card/${result.cardId}`);
    }
  }

  function cycleFitTier() {
    const index = FIT_TIERS.indexOf(fitTier);
    setFitTier(FIT_TIERS[(index + 1) % FIT_TIERS.length]);
  }

  function cycleRoleRecipe() {
    if (!pack) {
      return;
    }
    const options: Array<string | "all"> = ["all", ...pack.roleRecipes.map((r) => r.id)];
    const index = options.indexOf(roleRecipeId);
    setRoleRecipeId(options[(index + 1) % options.length]);
  }

  function cycleModule() {
    if (!pack) {
      return;
    }
    const options: Array<string | "all"> = ["all", ...pack.resumeModules.map((m) => m.id)];
    const index = options.indexOf(moduleId);
    setModuleId(options[(index + 1) % options.length]);
  }

  function cycleSortMode() {
    const index = SORT_MODES.indexOf(sortMode);
    setSortMode(SORT_MODES[(index + 1) % SORT_MODES.length]);
  }

  return (
    <Screen>
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}
      <PageHeader
        title="Queue"
        subtitle="Job candidates stay in the queue until you approve them into an application card."
      />
      <Text style={styles.helpText}>{FIT_SCORE_DISCLAIMER}</Text>

      <Section title="Findings">
        <Text style={styles.bodyText}>
          Waiting: {findings.counts.waiting} - New fetched: {findings.counts.newFetched} -
          Saved/manual: {findings.counts.savedManual} - Dismissed: {findings.counts.dismissed} -
          Application cards: {findings.counts.cardCreated}
        </Text>
        {findings.bestCandidate ? (
          <View style={styles.cardTile}>
            <Text style={styles.label}>Review next</Text>
            <Text style={styles.titleText}>
              {findings.bestCandidate.company} - {findings.bestCandidate.roleTitle}
            </Text>
            <Text style={styles.bodyText}>
              {formatFitScore(findings.bestCandidate.fitScore, findings.bestCandidate.fitLabel)}
              {findings.nextMove.kind === "review_candidate" && findings.nextMove.sourceName
                ? ` - ${findings.nextMove.sourceName}`
                : ""}
            </Text>
            {findings.bestCandidate.fitReasons[0] ? (
              <Text style={styles.listItem}>
                {truncate(findings.bestCandidate.fitReasons[0], 120)}
              </Text>
            ) : null}
            {findings.bestCandidate.gaps[0] ? (
              <Text style={styles.helpText}>
                Gap: {truncate(findings.bestCandidate.gaps[0], 120)}
              </Text>
            ) : null}
            <Text style={styles.helpText}>{findings.bestCandidate.nextTinyAction}</Text>
            {bestResumePacket ? (
              <View style={{ marginTop: 8, gap: 4 }}>
                <Text style={styles.label}>Resume packet</Text>
                <Text style={styles.bodyText}>
                  {bestResumePacket.modules.length > 0
                    ? bestResumePacket.modules.map((module) => module.title).join(", ")
                    : "No suggested modules yet."}
                </Text>
                {bestResumePacket.sectionCoverage.length > 0 ? (
                  <Text style={styles.helpText}>
                    Sections:{" "}
                    {bestResumePacket.sectionCoverage
                      .map((section) => RESUME_MODULE_SECTION_LABELS[section])
                      .join(", ")}
                  </Text>
                ) : null}
                {bestResumePacket.missingEvidence.slice(0, 3).map((issue) => (
                  <Text key={`${issue.moduleId}-${issue.message}`} style={styles.helpText}>
                    Patch: {issue.moduleTitle} - {issue.message}
                  </Text>
                ))}
                <Text style={styles.helpText}>{bestResumePacket.nextTinyAction}</Text>
              </View>
            ) : null}
            <View style={styles.cardActions}>
              <Pressable
                style={styles.primaryAction}
                onPress={() => handleAction("approve", findings.bestCandidate!.id)}
              >
                <Text style={styles.primaryActionText}>Create Application Card</Text>
              </Pressable>
              {findings.bestCandidate.status !== "saved" ? (
                <Pressable
                  style={styles.secondaryAction}
                  onPress={() => handleAction("save", findings.bestCandidate!.id)}
                >
                  <Text style={styles.secondaryActionText}>Save</Text>
                </Pressable>
              ) : null}
              {findings.bestCandidate.sourceUrl ? (
                <Pressable
                  style={styles.secondaryAction}
                  onPress={() => openSourceUrl(findings.bestCandidate!.sourceUrl!)}
                >
                  <Text style={styles.secondaryActionText}>Open source</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={styles.helpText}>{findings.nextMove.body}</Text>
        )}
      </Section>

      {pack ? (
        <Section title="Career Pack Filters">
          <Text style={styles.helpText}>
            Pack fit ranks the queue. Legacy fit score still shows on each card.
          </Text>
          <TextInput
            style={styles.captureInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search company, title, description…"
            placeholderTextColor={colors.inputPlaceholder}
          />
          <View style={styles.cardActions}>
            <Pressable style={styles.secondaryAction} onPress={cycleFitTier}>
              <Text style={styles.secondaryActionText}>Fit: {fitTier}</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={cycleRoleRecipe}>
              <Text style={styles.secondaryActionText}>Role: {roleRecipeId}</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={cycleModule}>
              <Text style={styles.secondaryActionText}>Module: {moduleId}</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={cycleSortMode}>
              <Text style={styles.secondaryActionText}>Sort: {sortMode}</Text>
            </Pressable>
          </View>
          <View style={styles.cardActions}>
            <Pressable
              style={styles.secondaryAction}
              onPress={() => setHideWeak((value) => !value)}
            >
              <Text style={styles.secondaryActionText}>
                {hideWeak ? "Showing weak" : "Hide weak"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.secondaryAction}
              onPress={() => setHideCautions((value) => !value)}
            >
              <Text style={styles.secondaryActionText}>
                {hideCautions ? "Showing cautions" : "Hide cautions"}
              </Text>
            </Pressable>
          </View>
        </Section>
      ) : (
        <Section title="Career Pack">
          <Text style={styles.helpText}>
            Import Career Source Pack to rank fetched candidates by role recipe, modules, and
            clearance signals.
          </Text>
          <Link href="/career-pack" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Import Career Pack</Text>
            </Pressable>
          </Link>
        </Section>
      )}

      {STATUS_ORDER.map((status) => {
        const grouped = jobCandidates.filter((candidate) => candidate.status === status);
        const sorted =
          status === "new" || status === "saved"
            ? pack
              ? filterAndSortCandidatesWithCareerPack(grouped, matchesById, filters, sortMode)
              : sortByFitScore(grouped)
            : grouped;

        return (
          <Section
            key={status}
            title={`${JOB_CANDIDATE_STATUS_LABELS[status]} (${grouped.length})`}
          >
            {grouped.length === 0 ? (
              <Text style={styles.emptyText}>Nothing here.</Text>
            ) : (
              sorted.map((candidate) => {
                const source = jobSources.find((item) => item.id === candidate.sourceId);
                const locationSuffix = candidate.location ? ` · ${candidate.location}` : "";
                const topReasons = candidate.fitReasons.slice(0, 2);
                const topGap = candidate.gaps[0];
                const skillsLine =
                  candidate.matchedSkills && candidate.matchedSkills.length > 0
                    ? candidate.matchedSkills.slice(0, 6).join(", ")
                    : null;
                const packMatch = matchesById.get(candidate.id);
                const expanded = expandedId === candidate.id;

                return (
                  <View key={candidate.id} style={styles.cardTile}>
                    <Text style={styles.titleText}>
                      {candidate.company} — {candidate.roleTitle}
                      {locationSuffix}
                    </Text>
                    <Text style={styles.bodyText}>
                      {formatFitScore(candidate.fitScore, candidate.fitLabel)}
                    </Text>
                    {packMatch ? (
                      <Text style={styles.bodyText}>
                        {tierLabel(packMatch.fitTier)}
                        {packMatch.roleRecipeTitle ? ` · ${packMatch.roleRecipeTitle}` : ""}
                      </Text>
                    ) : null}
                    {packMatch && packMatch.matchedModuleIds.length > 0 ? (
                      <Text style={styles.helpText}>
                        Modules:{" "}
                        {packMatch.suggestedModuleOrder.slice(0, 3).join(", ") ||
                          packMatch.matchedModuleIds.join(", ")}
                      </Text>
                    ) : null}
                    {packMatch ? (
                      <Text style={styles.helpText}>
                        Cautions: {packMatch.cautionSignals.length} · Evidence gaps:{" "}
                        {packMatch.evidenceGaps.length}
                      </Text>
                    ) : null}
                    {topReasons.map((reason) => (
                      <Text key={reason} style={styles.listItem}>
                        ▸ {truncate(reason, 120)}
                      </Text>
                    ))}
                    {topGap ? (
                      <Text style={[styles.listItem, { opacity: 0.85 }]}>
                        △ {truncate(topGap, 120)}
                      </Text>
                    ) : null}
                    {skillsLine ? (
                      <Text style={styles.helpText}>Skills: {truncate(skillsLine, 100)}</Text>
                    ) : null}
                    {candidate.recommendedResumeAngle ? (
                      <Text style={styles.helpText}>
                        Angle: {truncate(candidate.recommendedResumeAngle, 120)}
                      </Text>
                    ) : null}
                    <Text style={styles.helpText}>
                      {JOB_CANDIDATE_STATUS_LABELS[candidate.status]} ·{" "}
                      {JOB_CANDIDATE_ORIGIN_LABELS[candidate.origin]}
                      {source ? ` · ${source.name}` : ""}
                    </Text>
                    {packMatch ? (
                      <Pressable onPress={() => setExpandedId(expanded ? null : candidate.id)}>
                        <Text style={styles.secondaryActionText}>
                          {expanded ? "Hide pack detail" : "Show pack detail"}
                        </Text>
                      </Pressable>
                    ) : null}
                    {expanded && packMatch ? (
                      <View style={{ marginTop: 8, gap: 4 }}>
                        {packMatch.suggestedSummaryAngle ? (
                          <Text style={styles.helpText}>
                            Angle: {packMatch.suggestedSummaryAngle}
                          </Text>
                        ) : null}
                        {packMatch.positiveSignals.slice(0, 4).map((signal) => (
                          <Text key={`${signal.label}-pos`} style={styles.listItem}>
                            + {signal.label}
                            {signal.detail ? ` — ${truncate(signal.detail, 80)}` : ""}
                          </Text>
                        ))}
                        {packMatch.cautionSignals.slice(0, 4).map((signal) => (
                          <Text key={`${signal.label}-caution`} style={styles.listItem}>
                            ! {signal.label}
                            {signal.detail ? ` — ${truncate(signal.detail, 80)}` : ""}
                          </Text>
                        ))}
                        {packMatch.claimsWarnings.slice(0, 3).map((warning) => (
                          <Text key={warning} style={styles.helpText}>
                            △ Claim: {truncate(warning, 100)}
                          </Text>
                        ))}
                        {packMatch.evidenceGaps.slice(0, 3).map((gap) => (
                          <Text key={`${gap.moduleId}-${gap.metric}`} style={styles.helpText}>
                            ○ Evidence: {gap.metric} ({gap.status})
                          </Text>
                        ))}
                        {packMatch.relatedStoryTitles.map((title) => (
                          <Text key={title} style={styles.helpText}>
                            Story: {title}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    <View style={styles.cardActions}>
                      {candidate.status !== "card_created" ? (
                        <>
                          <Pressable
                            style={styles.primaryAction}
                            onPress={() => handleAction("approve", candidate.id)}
                          >
                            <Text style={styles.primaryActionText}>Create Application Card</Text>
                          </Pressable>
                          {candidate.status !== "saved" ? (
                            <Pressable
                              style={styles.secondaryAction}
                              onPress={() => handleAction("save", candidate.id)}
                            >
                              <Text style={styles.secondaryActionText}>Save</Text>
                            </Pressable>
                          ) : null}
                          {candidate.status !== "dismissed" ? (
                            <Pressable
                              style={styles.secondaryAction}
                              onPress={() => handleAction("dismiss", candidate.id)}
                            >
                              <Text style={styles.secondaryActionText}>Dismiss</Text>
                            </Pressable>
                          ) : null}
                          {candidate.sourceUrl ? (
                            <Pressable
                              style={styles.secondaryAction}
                              onPress={() => openSourceUrl(candidate.sourceUrl!)}
                            >
                              <Text style={styles.secondaryActionText}>Open source</Text>
                            </Pressable>
                          ) : null}
                        </>
                      ) : candidate.applicationCardId ? (
                        <>
                          <Text style={styles.helpText}>Application card exists.</Text>
                          <Link href={`/card/${candidate.applicationCardId}`} asChild>
                            <Pressable style={styles.secondaryAction}>
                              <Text style={styles.secondaryActionText}>Open Application Card</Text>
                            </Pressable>
                          </Link>
                        </>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </Section>
        );
      })}
    </Screen>
  );
}
