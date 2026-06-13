import { Text, View } from "react-native";

import type { ApplicationResumeReadiness } from "../../core/resumeReadiness";
import { RESUME_MODULE_SECTION_LABELS } from "../../core/resumeModuleBank";
import type { ResumeModuleSection } from "../../core/types";
import { lofiColors, styles } from "../styles";

const CHECKLIST_SECTIONS: ResumeModuleSection[] = ["education", "skills", "projects"];

interface ResumeSectionChecklistProps {
  readiness: ApplicationResumeReadiness;
}

function rowLabel(section: ResumeModuleSection, readiness: ApplicationResumeReadiness): string {
  const selected = readiness.selectedModulesBySection[section].length > 0;
  const missing = readiness.warnings.some(
    (warning) =>
      warning.category === "missing_section_coverage" && warning.section === section
  );
  const mark = selected && !missing ? "[x]" : "[ ]";
  return `${mark} ${RESUME_MODULE_SECTION_LABELS[section]}`;
}

export function ResumeSectionChecklist({ readiness }: ResumeSectionChecklistProps) {
  const exportReady = readiness.exportReadiness.canExportDocx;

  return (
    <View style={{ gap: 2, marginBottom: 8 }}>
      {CHECKLIST_SECTIONS.map((section) => (
        <Text
          key={section}
          style={[
            styles.helpText,
            readiness.selectedModulesBySection[section].length > 0
              ? { color: lofiColors.mossGreen }
              : null
          ]}
        >
          {rowLabel(section, readiness)}
        </Text>
      ))}
      <Text style={[styles.helpText, exportReady ? { color: lofiColors.mossGreen } : null]}>
        {exportReady ? "[x] Export ready" : "[ ] Export ready"}
      </Text>
    </View>
  );
}
