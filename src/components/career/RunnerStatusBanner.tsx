import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  canCopyTextToClipboard,
  copyTextToClipboard
} from "../../core/askHarnessSynthesis";
import {
  checkJobScoutRunnerHealth,
  requestJobScoutRunnerStart,
  RUNNER_START_COMMAND
} from "../../core/jobScoutRunnerClient";
import { colors, styles } from "../styles";

interface RunnerStatusBannerProps {
  onStatusChange?: (ok: boolean) => void;
}

export function RunnerStatusBanner({ onStatusChange }: RunnerStatusBannerProps) {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await checkJobScoutRunnerHealth();
    setStatus(result);
    onStatusChange?.(result.ok);
    return result;
  }, [onStatusChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleStartRunner() {
    setBusy(true);
    setNotice(null);
    const start = await requestJobScoutRunnerStart();
    if (!start.ok) {
      setNotice(start.message);
      setBusy(false);
      return;
    }

    const health = await refresh();
    setNotice(health.ok ? start.message : start.message);
    setBusy(false);
  }

  async function handleCopyCommand() {
    if (!canCopyTextToClipboard()) {
      setNotice("Clipboard unavailable — run npm run scout:runner in a terminal.");
      return;
    }
    const copied = await copyTextToClipboard(RUNNER_START_COMMAND);
    setNotice(copied ? "Copied npm run scout:runner." : "Could not copy command.");
  }

  if (!status) {
    return <Text style={styles.helpText}>Checking Job Scout Runner…</Text>;
  }

  return (
    <View
      style={[
        styles.lofiCardQuiet,
        {
          borderLeftWidth: 3,
          borderLeftColor: status.ok ? colors.accentSuccess : colors.accentDanger,
          gap: 8
        }
      ]}
    >
      <Text style={styles.lofiTapeLabel}>{status.ok ? "Runner awake" : "Runner not running"}</Text>
      <Text style={styles.bodyText}>{status.message}</Text>
      {notice ? <Text style={styles.helpText}>{notice}</Text> : null}
      <View style={styles.cardActionsRow}>
        {!status.ok ? (
          <Pressable
            style={StyleSheet.flatten([styles.primaryAction, busy && { opacity: 0.7 }])}
            disabled={busy}
            onPress={() => void handleStartRunner()}
          >
            <Text style={styles.primaryActionText}>
              {busy ? "Starting runner…" : "Start runner"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          style={StyleSheet.flatten([styles.secondaryAction, busy && { opacity: 0.7 }])}
          disabled={busy}
          onPress={() => void refresh()}
        >
          <Text style={styles.secondaryActionText}>Check again</Text>
        </Pressable>
        {!status.ok ? (
          <Pressable style={styles.secondaryAction} onPress={() => void handleCopyCommand()}>
            <Text style={styles.secondaryActionText}>Copy CLI command</Text>
          </Pressable>
        ) : null}
      </View>
      {!status.ok ? (
        <Text style={styles.helpText}>
          Start runner works when the dev launcher is up (npm run web starts it automatically).
        </Text>
      ) : null}
    </View>
  );
}
