import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  canCopyTextToClipboard,
  copyTextToClipboard
} from "../../core/askHarnessSynthesis";
import { RUNNER_START_COMMAND } from "../../core/jobScoutRunnerClient";
import { useRunnerHealth } from "../../hooks/useRunnerHealth";
import { colors, styles } from "../styles";

interface RunnerStatusBannerProps {
  onStatusChange?: (ok: boolean) => void;
  compact?: boolean;
}

export function RunnerStatusBanner({ onStatusChange, compact = false }: RunnerStatusBannerProps) {
  const { ok, message, checking, refresh, startRunner } = useRunnerHealth();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    onStatusChange?.(ok);
  }, [ok, onStatusChange]);

  async function handleStartRunner() {
    setNotice(null);
    const result = await startRunner();
    setNotice(result.message);
  }

  async function handleCopyCommand() {
    if (!canCopyTextToClipboard()) {
      setNotice("Clipboard unavailable — run npm run scout:runner in a terminal.");
      return;
    }
    const copied = await copyTextToClipboard(RUNNER_START_COMMAND);
    setNotice(copied ? "Copied npm run scout:runner." : "Could not copy command.");
  }

  if (checking && !compact) {
    return <Text style={styles.helpText}>Checking Job Scout Runner…</Text>;
  }

  if (compact && ok) {
    return null;
  }

  return (
    <View
      style={[
        styles.lofiCardQuiet,
        {
          borderLeftWidth: 3,
          borderLeftColor: ok ? colors.accentSuccess : colors.accentDanger,
          gap: 8
        }
      ]}
    >
      <Text style={styles.lofiTapeLabel}>{ok ? "Runner awake" : "Runner not running"}</Text>
      {!compact ? <Text style={styles.bodyText}>{message}</Text> : null}
      {notice ? <Text style={styles.helpText}>{notice}</Text> : null}
      <View style={styles.cardActionsRow}>
        {!ok ? (
          <Pressable
            style={StyleSheet.flatten([styles.primaryAction, checking && { opacity: 0.7 }])}
            disabled={checking}
            onPress={() => void handleStartRunner()}
          >
            <Text style={styles.primaryActionText}>
              {checking ? "Starting runner…" : "Start runner"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          style={StyleSheet.flatten([styles.secondaryAction, checking && { opacity: 0.7 }])}
          disabled={checking}
          onPress={() => void refresh()}
        >
          <Text style={styles.secondaryActionText}>Check again</Text>
        </Pressable>
        {!ok ? (
          <Pressable style={styles.secondaryAction} onPress={() => void handleCopyCommand()}>
            <Text style={styles.secondaryActionText}>Copy CLI command</Text>
          </Pressable>
        ) : null}
      </View>
      {!ok && !compact ? (
        <Text style={styles.helpText}>
          Start runner works when the dev launcher is up (npm run web starts it automatically).
        </Text>
      ) : null}
    </View>
  );
}
