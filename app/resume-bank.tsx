import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { PageHeader } from "../src/components/PageHeader";
import { Screen } from "../src/components/Screen";
import { Section } from "../src/components/Section";
import { styles } from "../src/components/styles";
import {
  FIT_SCORE_DISCLAIMER,
  RESUME_MODULE_CATEGORY_LABELS,
  ROLE_TYPE_LABELS
} from "../src/core/labels";
import {
  buildResumeModuleReadinessSummary,
  groupActiveResumeModules,
  normalizeResumeModulePlacement,
  RESUME_MODULE_SECTION_LABELS
} from "../src/core/resumeModuleBank";
import type { ResumeModule } from "../src/core/types";
import { useLifeHarness } from "../src/state/LifeHarnessState";

function ModuleCard({
  module,
  expanded,
  onToggle
}: {
  module: ResumeModule;
  expanded: boolean;
  onToggle: () => void;
}) {
  const placement = normalizeResumeModulePlacement(module, 0);

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
        </View>
      ) : null}
    </View>
  );
}

export default function ResumeBankScreen() {
  const { resumeModules } = useLifeHarness();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const readiness = buildResumeModuleReadinessSummary(resumeModules);
  const groups = groupActiveResumeModules(resumeModules);
  const inactiveModules = resumeModules.filter((module) => !module.isActive);

  return (
    <Screen>
      <PageHeader
        title="Resume Bank"
        subtitle="Structured resume modules for deterministic matching. No resume generation here."
      />

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
            <Text style={styles.emptyText}>No active modules here yet.</Text>
          ) : (
            group.modules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                expanded={expandedId === module.id}
                onToggle={() => setExpandedId(expandedId === module.id ? null : module.id)}
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
              onToggle={() => setExpandedId(expandedId === module.id ? null : module.id)}
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
