import { useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { canCopyTextToClipboard, copyTextToClipboard } from "../../core/askHarnessSynthesis";
import type { FeatureSprintRunnerAgent } from "../../core/featureSprintRunner";
import {
  classifyRunnerHealthFailure,
  type FeatureSprintRunnerHealthProbe
} from "../../core/featureSprintRunnerHealth";
import {
  buildRunnerSetupGuide,
  detectRunnerSetupPlatform,
  runnerSetupSummaryTitle
} from "../../core/featureSprintRunnerSetup";
import { colors, lofiTypography, styles } from "../styles";

export type FeatureSprintRunnerSetupPanelProps = {
  runnerAgent: FeatureSprintRunnerAgent;
  runnerHealth: "unknown" | "available" | "unavailable";
  runnerHealthProbe?: FeatureSprintRunnerHealthProbe;
  appTokenConfigured: boolean;
  onNotice?: (kind: "success" | "warning", message: string) => void;
};

export function FeatureSprintRunnerSetupPanel({
  runnerAgent,
  runnerHealth,
  runnerHealthProbe,
  appTokenConfigured,
  onNotice
}: FeatureSprintRunnerSetupPanelProps) {
  const [expanded, setExpanded] = useState(runnerHealth !== "available");

  const platform = detectRunnerSetupPlatform(Platform.OS);
  const failureKind = classifyRunnerHealthFailure(runnerHealthProbe, {
    httpStatus: runnerHealthProbe?.httpStatus,
    appTokenConfigured,
    runnerAgent
  });

  const steps = useMemo(
    () =>
      buildRunnerSetupGuide({
        probe: runnerHealthProbe,
        httpStatus: runnerHealthProbe?.httpStatus,
        runnerAgent,
        appTokenConfigured,
        platform,
        showAllCommands: expanded && runnerHealth === "available"
      }),
    [
      appTokenConfigured,
      expanded,
      platform,
      runnerAgent,
      runnerHealth,
      runnerHealthProbe
    ]
  );

  const showPanel = runnerHealth !== "available" || expanded;
  const canCopy = canCopyTextToClipboard();

  if (!showPanel && steps.length === 0) {
    return (
      <Pressable style={[styles.secondaryAction, { marginTop: 8, alignSelf: "flex-start" }]} onPress={() => setExpanded(true)}>
        <Text style={styles.secondaryActionText}>Show setup commands</Text>
      </Pressable>
    );
  }

  async function copyCommand(command: string) {
    if (!canCopy) {
      onNotice?.("warning", "Clipboard unavailable in this environment.");
      return;
    }
    const copied = await copyTextToClipboard(command);
    onNotice?.(copied ? "success" : "warning", copied ? "Command copied." : "Clipboard unavailable.");
  }

  return (
    <View style={[styles.cardTile, { marginTop: 8, backgroundColor: colors.bgSecondary }]}>
      <View style={[styles.cardActionsRow, { justifyContent: "space-between", alignItems: "center" }]}>
        <Text style={styles.label}>Runner setup</Text>
        <Pressable onPress={() => setExpanded((value) => !value)}>
          <Text style={styles.helpText}>{expanded ? "Hide" : "Show"} setup commands</Text>
        </Pressable>
      </View>

      <Text style={[styles.bodyText, { marginTop: 6 }]}>
        {runnerSetupSummaryTitle(failureKind, runnerAgent)}
      </Text>

      {runnerHealthProbe?.error && runnerHealth !== "available" ? (
        <Text style={[styles.helpText, { marginTop: 4 }]}>{runnerHealthProbe.error}</Text>
      ) : null}

      {steps.length === 0 ? (
        <Text style={[styles.helpText, { marginTop: 6 }]}>
          Runner looks ready for {runnerAgent}. Use Check runner after changing env or restarting the
          runner process.
        </Text>
      ) : (
        <View style={{ marginTop: 8, gap: 10 }}>
          {steps.map((step, index) => (
            <View key={step.id}>
              <Text style={styles.bodyText}>
                {index + 1}. {step.title}
              </Text>
              <Text style={[styles.helpText, { marginTop: 2 }]}>{step.detail}</Text>
              {step.command ? (
                <View style={{ marginTop: 6, gap: 6 }}>
                  <Text
                    style={[styles.helpText, { fontFamily: lofiTypography.fontLofiMono }]}
                    selectable
                  >
                    {step.command}
                  </Text>
                  {canCopy ? (
                    <Pressable
                      style={[styles.secondaryAction, { alignSelf: "flex-start" }]}
                      onPress={() => {
                        void copyCommand(step.command!);
                      }}
                    >
                      <Text style={styles.secondaryActionText}>Copy command</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
