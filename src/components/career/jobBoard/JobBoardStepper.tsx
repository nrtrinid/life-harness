import { Pressable, Text, View } from "react-native";

import {
  JOB_BOARD_TAB_LABELS,
  type JobBoardTab
} from "../../../core/jobBoardTab";
import type { CareerPipelineState } from "../../../core/types";
import { lofiColors, styles } from "../../styles";

interface JobBoardStepperProps {
  activeTab: JobBoardTab;
  pipeline: CareerPipelineState;
  onSelectTab: (tab: JobBoardTab) => void;
}

const STEPS: JobBoardTab[] = ["find", "review", "apply", "followup"];

function stepCount(tab: JobBoardTab, pipeline: CareerPipelineState): number {
  if (tab === "find") {
    return pipeline.enabledSources;
  }
  if (tab === "review") {
    return pipeline.candidatesWaiting;
  }
  if (tab === "apply") {
    return pipeline.activeApplications.length + pipeline.waitingApplications.length;
  }
  return pipeline.followUpsDue.length;
}

export function JobBoardStepper({ activeTab, pipeline, onSelectTab }: JobBoardStepperProps) {
  return (
    <View style={[styles.lofiCardQuiet, { gap: 8 }]}>
      <Text style={styles.lofiTapeLabel}>Pipeline</Text>
      <View style={styles.cardActionsRow}>
        {STEPS.map((step, index) => {
          const active = step === activeTab;
          const count = stepCount(step, pipeline);
          return (
            <Pressable
              key={step}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 6,
                borderLeftWidth: active ? 3 : 0,
                borderLeftColor: active ? lofiColors.actionAmber : "transparent"
              }}
              onPress={() => onSelectTab(step)}
            >
              <Text style={active ? styles.titleText : styles.bodyText}>
                {index + 1}. {JOB_BOARD_TAB_LABELS[step]}
              </Text>
              <Text style={styles.helpText}>{count}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
