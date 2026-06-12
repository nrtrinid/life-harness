import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CareerHubSummary } from "../../../core/careerHub";
import type { CareerPipelineState } from "../../../core/types";
import {
  JOB_BOARD_TAB_LABELS,
  type JobBoardTab
} from "../../../core/jobBoardTab";
import { styles } from "../../styles";

interface JobBoardTabBarProps {
  activeTab: JobBoardTab;
  summary: CareerHubSummary;
  pipeline: CareerPipelineState;
  onSelectTab: (tab: JobBoardTab) => void;
}

function badgeForTab(
  tab: JobBoardTab,
  summary: CareerHubSummary,
  pipeline: CareerPipelineState
): number {
  if (tab === "review") {
    return pipeline.candidatesWaiting;
  }
  if (tab === "apply") {
    return pipeline.activeApplications.length + pipeline.waitingApplications.length;
  }
  if (tab === "followup") {
    return pipeline.followUpsDue.length;
  }
  if (tab === "find") {
    return summary.dueSourceCount;
  }
  return 0;
}

export function JobBoardTabBar({
  activeTab,
  summary,
  pipeline,
  onSelectTab
}: JobBoardTabBarProps) {
  const tabs: JobBoardTab[] = ["find", "review", "apply", "followup"];

  return (
    <View style={styles.cardActionsRow}>
      {tabs.map((tab) => {
        const active = tab === activeTab;
        const badge = badgeForTab(tab, summary, pipeline);
        return (
          <Pressable
            key={tab}
            style={StyleSheet.flatten([
              active ? styles.primaryAction : styles.secondaryAction,
              { flex: 1, minWidth: 72 }
            ])}
            onPress={() => onSelectTab(tab)}
          >
            <Text style={active ? styles.primaryActionText : styles.secondaryActionText}>
              {JOB_BOARD_TAB_LABELS[tab]}
              {badge > 0 ? ` (${badge})` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
