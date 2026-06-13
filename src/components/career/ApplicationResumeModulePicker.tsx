import { Link } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { suggestDefaultModuleIdsPerSection } from "../../core/applicationResumeAction";
import type { ApplicationResumeReadiness } from "../../core/resumeReadiness";
import {
  groupActiveResumeModules,
  RESUME_MODULE_SECTION_LABELS
} from "../../core/resumeModuleBank";
import type { ResumeModule, ResumeModuleSection } from "../../core/types";
import { Section } from "../Section";
import { lofiColors, styles } from "../styles";

const CRITICAL_SECTIONS: ResumeModuleSection[] = ["education", "skills", "projects"];
const PICKER_SECTIONS: ResumeModuleSection[] = [...CRITICAL_SECTIONS, "additional_experience"];

interface ApplicationResumeModulePickerProps {
  readiness: ApplicationResumeReadiness;
  resumeModules: ResumeModule[];
  selectedModuleIds: string[];
  onToggleModule: (moduleId: string) => void;
  onSetModuleForSection?: (section: ResumeModuleSection, moduleId: string) => void;
  onAddDefaultModules?: () => void;
  focusSection?: ResumeModuleSection | null;
}

export function ApplicationResumeModulePicker({
  readiness,
  resumeModules,
  selectedModuleIds,
  onToggleModule,
  onSetModuleForSection,
  onAddDefaultModules,
  focusSection
}: ApplicationResumeModulePickerProps) {
  const [expandedSection, setExpandedSection] = useState<ResumeModuleSection | null>(null);
  const groups = groupActiveResumeModules(resumeModules);
  const selectedSet = new Set(selectedModuleIds);
  const defaults = suggestDefaultModuleIdsPerSection(resumeModules);

  useEffect(() => {
    if (focusSection) {
      setExpandedSection(focusSection);
    }
  }, [focusSection]);

  const missingSections = new Set(
    readiness.warnings
      .filter((warning) => warning.category === "missing_section_coverage" && warning.section)
      .map((warning) => warning.section!)
  );

  const canAddDefaults = useMemo(() => {
    return CRITICAL_SECTIONS.some((section) => {
      const missing = readiness.selectedModulesBySection[section].length === 0;
      return missing && Boolean(defaults[section]);
    });
  }, [defaults, readiness.selectedModulesBySection]);

  function handleModulePress(section: ResumeModuleSection, moduleId: string) {
    if (CRITICAL_SECTIONS.includes(section) && onSetModuleForSection) {
      onSetModuleForSection(section, moduleId);
      return;
    }
    onToggleModule(moduleId);
  }

  return (
    <Section title="Resume modules for this application">
      <Text style={styles.helpText}>
        Pick one module per section from your Resume Bank. Export needs Education, Skills, and
        Projects at minimum.
      </Text>

      {canAddDefaults && onAddDefaultModules ? (
        <Pressable
          style={StyleSheet.flatten([styles.secondaryAction, { marginTop: 8, alignSelf: "flex-start" }])}
          onPress={onAddDefaultModules}
        >
          <Text style={styles.secondaryActionText}>Add standard modules from bank</Text>
        </Pressable>
      ) : null}

      {PICKER_SECTIONS.map((section) => {
        const group = groups.find((item) => item.section === section);
        const bankModules = group?.modules ?? [];
        const selected = readiness.selectedModulesBySection[section];
        const isCritical = CRITICAL_SECTIONS.includes(section);
        const isMissing = isCritical && missingSections.has(section);
        const expanded = expandedSection === section;

        return (
          <View
            key={section}
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: lofiColors.border
            }}
          >
            <Text style={styles.label}>{RESUME_MODULE_SECTION_LABELS[section]}</Text>
            {selected.length === 0 ? (
              <Text
                style={StyleSheet.flatten([
                  styles.bodyText,
                  isMissing ? { color: lofiColors.actionAmber } : null
                ])}
              >
                {isMissing ? "None — required for export" : "None selected"}
              </Text>
            ) : (
              selected.map((module) => (
                <View
                  key={module.id}
                  style={[styles.cardActionsRow, { marginTop: 4, alignItems: "center" }]}
                >
                  <Text style={[styles.bodyText, { flex: 1 }]}>- {module.title}</Text>
                  <Pressable
                    style={styles.smallButton}
                    onPress={() => onToggleModule(module.id)}
                  >
                    <Text style={styles.smallButtonText}>Remove</Text>
                  </Pressable>
                </View>
              ))
            )}

            {bankModules.length === 0 ? (
              <Text style={[styles.helpText, { marginTop: 6 }]}>
                No active modules in Resume Bank for this section.
              </Text>
            ) : (
              <Pressable
                style={StyleSheet.flatten([styles.smallButton, { marginTop: 8, alignSelf: "flex-start" }])}
                onPress={() => setExpandedSection(expanded ? null : section)}
              >
                <Text style={styles.smallButtonText}>
                  {expanded ? "Hide options" : `Add ${RESUME_MODULE_SECTION_LABELS[section]} module`}
                </Text>
              </Pressable>
            )}

            {expanded && bankModules.length > 0 ? (
              <View style={{ marginTop: 8, gap: 4 }}>
                {bankModules.map((module) => {
                  const isSelected = selectedSet.has(module.id);
                  return (
                    <Pressable
                      key={module.id}
                      style={StyleSheet.flatten([
                        styles.cardTile,
                        isSelected ? { borderColor: lofiColors.actionAmber } : null
                      ])}
                      onPress={() => handleModulePress(section, module.id)}
                    >
                      <Text style={styles.bodyText}>
                        {isSelected ? "[selected] " : ""}
                        {module.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={[styles.cardActionsRow, { marginTop: 12 }]}>
        <Link href="/resume-bank" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Resume Bank</Text>
          </Pressable>
        </Link>
        <Link href="/career-pack" asChild>
          <Pressable style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Career Pack</Text>
          </Pressable>
        </Link>
      </View>
    </Section>
  );
}
