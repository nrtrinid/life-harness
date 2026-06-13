import { Link } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ResumeModulePatchSheet } from "../src/components/career/ResumeModulePatchSheet";
import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import type { ResumeModulePatch } from "../src/core/actions";
import {
  FIT_SCORE_DISCLAIMER,
  RESUME_MODULE_CATEGORY_LABELS,
  ROLE_TYPE_LABELS
} from "../src/core/labels";
import type { ResumeReadinessWarning } from "../src/core/resumeReadiness";
import {
  buildResumeModuleReadinessSummary,
  groupActiveResumeModules,
  normalizeResumeModulePlacement,
  RESUME_MODULE_SECTION_LABELS,
  type ResumeModuleIssue
} from "../src/core/resumeModuleBank";
import type { ResumeModule } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

function issuesToWarnings(module: ResumeModule, issues: ResumeModuleIssue[]): ResumeReadinessWarning[] {
  return issues
    .filter((issue) => issue.moduleId === module.id)
    .map((issue, index) => {
      let category: ResumeReadinessWarning["category"] = "missing_bullets";
      if (issue.message.includes("date")) {
        category = "missing_date";
      } else if (issue.message.includes("proof")) {
        category = "missing_proof";
      } else if (issue.message.includes("skill")) {
        category = "missing_bullets";
      }
      return {
        id: `bank-${module.id}-${index}`,
        category,
        message: issue.message,
        moduleId: module.id,
        moduleTitle: module.title,
        blocksExport: category !== "missing_proof"
      };
    });
}

function ModuleCard({
  module,
  expanded,
  issues,
  patching,
  onToggle,
  onOpenPatch,
  onPatch,
  onClosePatch
}: {
  module: ResumeModule;
  expanded: boolean;
  issues: ResumeModuleIssue[];
  patching: boolean;
  onToggle: () => void;
  onOpenPatch: () => void;
  onPatch: (patch: ResumeModulePatch) => void;
  onClosePatch: () => void;
}) {
  const placement = normalizeResumeModulePlacement(module, 0);
  const moduleIssues = issues.filter((issue) => issue.moduleId === module.id);

  return (
    <View style={styles.cardTile}>
      <Pressable onPress={onToggle}>
        <Text style={styles.titleText}>{placement.heading}</Text>
        <Text style={styles.bodyText}>
          {RESUME_MODULE_CATEGORY_LABELS[module.category]} -{" "}
          {RESUME_MODULE_SECTION_LABELS[placement.section]}
          {placement.date ? ` - ${placement.date}` : " - Missing date"}
          {module.importedFromCareerPack ? " - Career Pack" : ""}
        </Text>
        {placement.detail ? <Text style={styles.helpText}>{placement.detail}</Text> : null}
        <Text style={styles.helpText}>{module.summary}</Text>
      </Pressable>
      {expanded ? (
        <View style={{ marginTop: 8, gap: 4 }}>
          <Text style={styles.label}>Module</Text>
          <Text style={styles.bodyText}>
            {module.title} - {module.isActive ? "Active" : "Inactive"}
          </Text>
          <Text style={styles.label}>Tags</Text>
          <Text style={styles.bodyText}>{module.tags.join(", ") || "None yet"}</Text>
          <Text style={styles.label}>Skills</Text>
          <Text style={styles.bodyText}>{module.skills.join(", ") || "None yet"}</Text>
          <Text style={styles.label}>Best For</Text>
          <Text style={styles.bodyText}>
            {module.bestFor.map((role) => ROLE_TYPE_LABELS[role]).join(", ")}
          </Text>
          <Text style={styles.label}>Proof</Text>
          <Text style={styles.bodyText}>{module.proof?.join(", ") || "No proof attached"}</Text>
          <Text style={styles.label}>Bullets</Text>
          {module.bullets.length > 0 ? (
            module.bullets.map((bullet) => (
              <Text key={bullet} style={styles.listItem}>
                - {bullet}
              </Text>
            ))
          ) : (
            <Text style={styles.helpText}>No bullets yet.</Text>
          )}
          {moduleIssues.length > 0 ? (
            <Pressable
              style={StyleSheet.flatten([styles.secondaryAction, { marginTop: 8, alignSelf: "flex-start" }])}
              onPress={onOpenPatch}
            >
              <Text style={styles.secondaryActionText}>Patch module</Text>
            </Pressable>
          ) : null}
          {patching ? (
            <ResumeModulePatchSheet
              module={module}
              blockingWarnings={issuesToWarnings(module, issues)}
              onPatch={onPatch}
              onClose={onClosePatch}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function ResumeBankScreen() {
  const { resumeModules, patchResumeModule } = useLifeHarness();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [patchModuleId, setPatchModuleId] = useState<string | null>(null);
  const readiness = useMemo(
    () => buildResumeModuleReadinessSummary(resumeModules),
    [resumeModules]
  );
  const groups = groupActiveResumeModules(resumeModules);
  const inactiveModules = resumeModules.filter((module) => !module.isActive);

  function handlePatch(moduleId: string, patch: ResumeModulePatch) {
    const result = patchResumeModule(moduleId, patch);
    if (result.ok) {
      setPatchModuleId(null);
    }
  }

  return (
    <Screen>
      <PageHeader
        title="Resume Bank"
        subtitle="Structured resume modules for deterministic matching. Patch gaps here before export."
      />

      <View style={styles.lofiCardHero}>
        <Text style={styles.lofiTapeLabel}>Next move</Text>
        <Text style={styles.titleText}>
          {readiness.issues[0]?.moduleTitle ?? "Resume modules"}
        </Text>
        <Text style={styles.bodyText}>
          {readiness.issues[0]?.message ??
            (readiness.active > 0
              ? "Modules look ready for application work."
              : "No active modules here yet. Import Career Pack or open Jobs.")}
        </Text>
        {readiness.issues[0] ? (
          <Pressable
            style={StyleSheet.flatten([styles.primaryAction, { alignSelf: "flex-start" }])}
            onPress={() => {
              setExpandedId(readiness.issues[0]!.moduleId);
              setPatchModuleId(readiness.issues[0]!.moduleId);
            }}
          >
            <Text style={styles.primaryActionText}>Patch first issue</Text>
          </Pressable>
        ) : (
          <Link href="/career" asChild>
            <Pressable style={StyleSheet.flatten([styles.primaryAction, { alignSelf: "flex-start" }])}>
              <Text style={styles.primaryActionText}>Open Jobs</Text>
            </Pressable>
          </Link>
        )}
        <Link href="/career-pack" asChild>
          <Pressable style={StyleSheet.flatten([styles.smallButton, { marginTop: 8, alignSelf: "flex-start" }])}>
            <Text style={styles.smallButtonText}>Open Career Pack</Text>
          </Pressable>
        </Link>
      </View>

      <Section title="Readiness">
        <Text style={styles.bodyText}>
          Active: {readiness.active} - Inactive: {readiness.inactive} - Issues:{" "}
          {readiness.issues.length}
        </Text>
        <Text style={styles.helpText}>
          Education {readiness.bySection.education} - Skills {readiness.bySection.skills} -
          Projects {readiness.bySection.projects} - Additional Experience{" "}
          {readiness.bySection.additional_experience}
        </Text>
        {readiness.issues.slice(0, 4).map((issue) => (
          <Text key={`${issue.moduleId}-${issue.message}`} style={styles.listItem}>
            - {issue.moduleTitle}: {issue.message}
          </Text>
        ))}
        {readiness.issues.length > 4 ? (
          <Text style={styles.helpText}>{readiness.issues.length - 4} more readiness notes.</Text>
        ) : null}
      </Section>

      {groups.map((group) => (
        <Section key={group.section} title={`${group.label} (${group.modules.length})`}>
          {group.modules.length === 0 ? (
            <Text style={styles.emptyText}>
              No active modules here yet. Import Career Pack or open Jobs.
            </Text>
          ) : (
            group.modules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                expanded={expandedId === module.id}
                issues={readiness.issues}
                patching={patchModuleId === module.id}
                onToggle={() => setExpandedId(expandedId === module.id ? null : module.id)}
                onOpenPatch={() => setPatchModuleId(module.id)}
                onPatch={(patch) => handlePatch(module.id, patch)}
                onClosePatch={() => setPatchModuleId(null)}
              />
            ))
          )}
        </Section>
      ))}

      <Section title={`Inactive (${inactiveModules.length})`}>
        {inactiveModules.length === 0 ? (
          <Text style={styles.emptyText}>No inactive modules.</Text>
        ) : (
          inactiveModules.map((module) => (
            <ModuleCard
              key={module.id}
              module={module}
              expanded={expandedId === module.id}
              issues={readiness.issues}
              patching={patchModuleId === module.id}
              onToggle={() => setExpandedId(expandedId === module.id ? null : module.id)}
              onOpenPatch={() => setPatchModuleId(module.id)}
              onPatch={(patch) => handlePatch(module.id, patch)}
              onClosePatch={() => setPatchModuleId(null)}
            />
          ))
        )}
      </Section>

      <Link href="/career-pack" asChild>
        <Pressable style={styles.secondaryAction}>
          <Text style={styles.secondaryActionText}>Career Pack import</Text>
        </Pressable>
      </Link>
      <Text style={styles.helpText}>
        Imported modules are reference material until reviewed in the Resume Bank.
      </Text>
      <Text style={styles.helpText}>{FIT_SCORE_DISCLAIMER}</Text>
    </Screen>
  );
}
