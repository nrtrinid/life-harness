import { Link, useRouter, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Platform, Pressable, Text, TextInput, View } from "react-native";

import { PrimaryMovePanel, SignalStrip, UsefulEmptyState } from "../../AlivePatterns";
import { Section } from "../../Section";
import { colors, styles } from "../../styles";
import {
  filterAndSortCandidatesWithCareerPack,
  type CareerPackCandidateFilters,
  type CareerPackSortMode
} from "../../../core/careerPackCandidateFilters";
import {
  matchCandidatesWithCareerPack,
  type CareerCandidateMatch,
  type CareerFitTier
} from "../../../core/careerPackMatching";
import { FIT_SCORE_DISCLAIMER, JOB_CANDIDATE_ORIGIN_LABELS } from "../../../core/labels";
import { formatFitScore } from "../../../core/jobScout";
import {
  buildCandidateResumePacket,
  RESUME_MODULE_SECTION_LABELS
} from "../../../core/resumeModuleBank";
import type { JobCandidate, JobCandidateStatus } from "../../../core/types";
import { useLifeHarness } from "../../../state/LifeHarnessState";

const FIT_TIERS: Array<CareerFitTier | "all"> = ["all", "strong", "mixed", "weak"];
const SORT_MODES: CareerPackSortMode[] = ["best_fit", "newest", "queue_order"];

type ReviewSubTab = "to_review" | "passed" | "applied";

const SUB_TAB_STATUSES: Record<ReviewSubTab, JobCandidateStatus[]> = {
  to_review: ["new", "saved"],
  passed: ["dismissed"],
  applied: ["card_created"]
};

const SUB_TAB_LABELS: Record<ReviewSubTab, string> = {
  to_review: "To review",
  passed: "Passed",
  applied: "Applied"
};

function sortByFitScore(candidates: JobCandidate[]): JobCandidate[] {
  return [...candidates].sort((a, b) => b.fitScore - a.fitScore);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}...`;
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

interface JobBoardReviewTabProps {
  embedded?: boolean;
  onApplicationStarted?: () => void;
}

export function JobBoardReviewTab({
  embedded = false,
  onApplicationStarted
}: JobBoardReviewTabProps) {
  const router = useRouter();
  const {
    jobCandidates,
    jobSources,
    resumeModules,
    careerSourcePack,
    saveJobCandidate,
    dismissJobCandidate,
    approveJobCandidate
  } = useLifeHarness();

  const [subTab, setSubTab] = useState<ReviewSubTab>("to_review");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fitTier, setFitTier] = useState<CareerFitTier | "all">("all");
  const [roleRecipeId, setRoleRecipeId] = useState<string | "all">("all");
  const [moduleId, setModuleId] = useState<string | "all">("all");
  const [hideWeak, setHideWeak] = useState(false);
  const [hideCautions, setHideCautions] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState<CareerPackSortMode>("best_fit");

  const pack = careerSourcePack?.pack ?? null;
  const visibleSubTabs = (["to_review", "passed", "applied"] as ReviewSubTab[]).filter((tab) =>
    jobCandidates.some((candidate) => SUB_TAB_STATUSES[tab].includes(candidate.status))
  );
  const activeSubTab = visibleSubTabs.includes(subTab)
    ? subTab
    : (visibleSubTabs[0] ?? "to_review");

  const matchesById = useMemo(() => {
    if (!pack) {
      return new Map<string, CareerCandidateMatch>();
    }
    return matchCandidatesWithCareerPack(jobCandidates, pack, resumeModules, jobSources);
  }, [jobCandidates, pack, resumeModules, jobSources]);

  const filters: CareerPackCandidateFilters = {
    fitTier,
    roleRecipeId,
    moduleId,
    hideWeak,
    hideCautions,
    searchText
  };

  function handleAction(action: "save" | "dismiss" | "approve", candidateId: string) {
    const result =
      action === "save"
        ? saveJobCandidate(candidateId)
        : action === "dismiss"
          ? dismissJobCandidate(candidateId)
          : approveJobCandidate(candidateId);

    if (action === "approve" && result.ok && "cardId" in result && result.cardId) {
      onApplicationStarted?.();
      const href = (
        "cardHref" in result && result.cardHref ? result.cardHref : `/card/${result.cardId}`
      ) as Href;
      router.push(href);
    }
  }

  function cycleFitTier() {
    setFitTier(FIT_TIERS[(FIT_TIERS.indexOf(fitTier) + 1) % FIT_TIERS.length]);
  }

  function cycleRoleRecipe() {
    if (!pack) {
      return;
    }
    const options: Array<string | "all"> = ["all", ...pack.roleRecipes.map((r) => r.id)];
    setRoleRecipeId(options[(options.indexOf(roleRecipeId) + 1) % options.length]);
  }

  function cycleModule() {
    if (!pack) {
      return;
    }
    const options: Array<string | "all"> = ["all", ...pack.resumeModules.map((m) => m.id)];
    setModuleId(options[(options.indexOf(moduleId) + 1) % options.length]);
  }

  function cycleSortMode() {
    setSortMode(SORT_MODES[(SORT_MODES.indexOf(sortMode) + 1) % SORT_MODES.length]);
  }

  const grouped = jobCandidates.filter((candidate) =>
    SUB_TAB_STATUSES[activeSubTab].includes(candidate.status)
  );
  const sorted =
    activeSubTab === "to_review"
      ? pack
        ? filterAndSortCandidatesWithCareerPack(grouped, matchesById, filters, sortMode)
        : sortByFitScore(grouped)
      : grouped;
  const leadCandidate = activeSubTab === "to_review" ? sorted[0] : undefined;
  const leadMatch = leadCandidate ? matchesById.get(leadCandidate.id) : undefined;
  const leadResumePacket = leadCandidate
    ? buildCandidateResumePacket(leadCandidate, resumeModules)
    : null;
  const supportingCandidates = leadCandidate
    ? sorted.filter((candidate) => candidate.id !== leadCandidate.id)
    : sorted;

  return (
    <View style={{ gap: 12 }}>
      {leadCandidate ? (
        <PrimaryMovePanel
          label="Review next"
          title={`${leadCandidate.company} - ${leadCandidate.roleTitle}`}
          reason={
            leadCandidate.fitReasons[0]
              ? truncate(leadCandidate.fitReasons[0], 150)
              : "Decide whether this should become a real application card."
          }
          primaryAction={{
            label: "Start application",
            onPress: () => handleAction("approve", leadCandidate.id)
          }}
          secondaryActions={[
            ...(leadCandidate.status !== "saved"
              ? [
                  {
                    label: "Save",
                    onPress: () => handleAction("save", leadCandidate.id),
                    variant: "small" as const
                  }
                ]
              : []),
            ...(leadCandidate.sourceUrl
              ? [
                  {
                    label: "Open posting",
                    onPress: () => openSourceUrl(leadCandidate.sourceUrl!),
                    variant: "small" as const
                  }
                ]
              : []),
            ...(leadCandidate.status !== "dismissed"
              ? [
                  {
                    label: "Pass",
                    onPress: () => handleAction("dismiss", leadCandidate.id),
                    variant: "small" as const
                  }
                ]
              : [])
          ]}
          footnote="One decision is enough. Start it, save it, or pass cleanly."
        >
          <SignalStrip
            label="Fit signal"
            text={`${formatFitScore(leadCandidate.fitScore, leadCandidate.fitLabel)}${
              leadMatch ? ` - ${tierLabel(leadMatch.fitTier)}` : ""
            }`}
            tone={leadCandidate.fitLabel === "strong" ? "proof" : "neutral"}
          />
          {leadResumePacket && leadResumePacket.modules.length > 0 ? (
            <Text style={styles.helpText}>
              Resume modules: {leadResumePacket.modules.map((m) => m.title).join(", ")}
            </Text>
          ) : null}
        </PrimaryMovePanel>
      ) : activeSubTab === "to_review" ? (
        <UsefulEmptyState
          title="Review queue is clear"
          copy="Nothing needs a decision right now. Paste or run one source when you want the next outside-world option."
        />
      ) : null}

      <SignalStrip label="Scoring note" text={FIT_SCORE_DISCLAIMER} tone="neutral" />

      {visibleSubTabs.length > 0 ? (
        <View style={styles.cardActionsRow}>
          {visibleSubTabs.map((tab) => (
            <Pressable
              key={tab}
              style={activeSubTab === tab ? styles.primaryAction : styles.secondaryAction}
              onPress={() => setSubTab(tab)}
            >
              <Text
                style={
                  activeSubTab === tab ? styles.primaryActionText : styles.secondaryActionText
                }
              >
                {SUB_TAB_LABELS[tab]} (
                {jobCandidates.filter((c) => SUB_TAB_STATUSES[tab].includes(c.status)).length})
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {pack ? (
        <Section title="Tune review list">
          <TextInput
            style={styles.captureInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search company, title, description..."
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
        </Section>
      ) : (
        <Section title="Career Pack">
          <Text style={styles.helpText}>Import a pack for role-recipe ranking.</Text>
          <Link href="/career-pack" asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Import Career Pack</Text>
            </Pressable>
          </Link>
        </Section>
      )}

      <Section
        title={
          activeSubTab === "to_review" && leadCandidate
            ? `More to review (${supportingCandidates.length})`
            : `${SUB_TAB_LABELS[activeSubTab]} (${supportingCandidates.length})`
        }
      >
        {supportingCandidates.length === 0 ? (
          <UsefulEmptyState
            title={activeSubTab === "to_review" ? "No other reviews queued" : "Nothing here right now"}
            copy={
              activeSubTab === "to_review"
                ? "Handle the review above, then the next decision will surface here."
                : "This lane is quiet. The useful work is in the active career move above."
            }
          />
        ) : (
          supportingCandidates.map((candidate) => {
            const source = jobSources.find((item) => item.id === candidate.sourceId);
            const packMatch = matchesById.get(candidate.id);
            const expanded = expandedId === candidate.id;
            const matchExpanded = expanded && packMatch;

            return (
              <View key={candidate.id} style={styles.cardTile}>
                <Text style={styles.titleText}>
                  {candidate.company} - {candidate.roleTitle}
                </Text>
                <Text style={styles.bodyText}>
                  {formatFitScore(candidate.fitScore, candidate.fitLabel)}
                  {packMatch ? ` - ${tierLabel(packMatch.fitTier)}` : ""}
                </Text>
                {candidate.fitReasons[0] ? (
                  <Text style={styles.listItem}>- {truncate(candidate.fitReasons[0], 120)}</Text>
                ) : null}
                <Text style={styles.helpText}>
                  {JOB_CANDIDATE_ORIGIN_LABELS[candidate.origin]}
                  {source ? ` - ${source.name}` : ""}
                </Text>
                {packMatch ? (
                  <Pressable onPress={() => setExpandedId(expanded ? null : candidate.id)}>
                    <Text style={styles.secondaryActionText}>
                      {matchExpanded ? "Hide" : "Why this match?"}
                    </Text>
                  </Pressable>
                ) : null}
                {matchExpanded ? (
                  <View style={{ marginTop: 8, gap: 4 }}>
                    {packMatch.suggestedSummaryAngle ? (
                      <Text style={styles.helpText}>Angle: {packMatch.suggestedSummaryAngle}</Text>
                    ) : null}
                    {(() => {
                      const packet = buildCandidateResumePacket(candidate, resumeModules);
                      return packet.sectionCoverage.length > 0 ? (
                        <Text style={styles.helpText}>
                          Sections:{" "}
                          {packet.sectionCoverage
                            .map((s) => RESUME_MODULE_SECTION_LABELS[s])
                            .join(", ")}
                        </Text>
                      ) : null;
                    })()}
                    {packMatch.cautionSignals.slice(0, 3).map((signal) => (
                      <Text key={signal.label} style={styles.listItem}>
                        ! {signal.label}
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
                        <Text style={styles.primaryActionText}>Start application</Text>
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
                          <Text style={styles.secondaryActionText}>Pass</Text>
                        </Pressable>
                      ) : null}
                      {candidate.sourceUrl ? (
                        <Pressable
                          style={styles.secondaryAction}
                          onPress={() => openSourceUrl(candidate.sourceUrl!)}
                        >
                          <Text style={styles.secondaryActionText}>Open posting</Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : candidate.applicationCardId ? (
                    <Link href={`/card/${candidate.applicationCardId}`} asChild>
                      <Pressable style={styles.secondaryAction}>
                        <Text style={styles.secondaryActionText}>Open application</Text>
                      </Pressable>
                    </Link>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </Section>
    </View>
  );
}
