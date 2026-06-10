import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";
import type { CompanionSelfMemory } from "../../core/companionSelfMemory";
import {
  DEFAULT_GATEWAY_MAX_INPUT_CHARS,
  DEFAULT_RAW_LAB_MAX_INPUT_CHARS
} from "../../core/gatewayBudget";
import {
  buildRawLabSendBundle,
  type RawLabBudgetLevel,
  type RawLabCompactionNotice
} from "../../core/rawLabContextBudget";
import type { RawLabThreadState, RawLabTurn } from "../../core/rawLabThreadState";

type RawLabBudgetInspectorProps = {
  turns: RawLabTurn[];
  threadState: RawLabThreadState;
  message: string;
  companionSelfMemories?: CompanionSelfMemory[];
  forceExpanded?: boolean;
  lastSend?: {
    estimatedChars: number;
    level: RawLabBudgetLevel;
    turnsSent: number;
    memoriesSent: number;
    budgetCapChars: number;
    notice?: RawLabCompactionNotice;
  };
};

export function RawLabBudgetInspector({
  turns,
  threadState,
  message,
  companionSelfMemories = [],
  forceExpanded = false,
  lastSend
}: RawLabBudgetInspectorProps) {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<{
    estimatedChars: number;
    level: RawLabBudgetLevel;
    turnsSent: number;
    memoriesSent: number;
    budgetCapChars: number;
  } | null>(null);

  useEffect(() => {
    if (forceExpanded) {
      setExpanded(true);
    }
  }, [forceExpanded]);

  function handlePreviewCompact() {
    const bundle = buildRawLabSendBundle({
      message: message.trim() || "preview",
      turns,
      threadState,
      companionSelfMemories
    });
    setPreview({
      estimatedChars: bundle.estimatedChars,
      level: bundle.level,
      turnsSent: bundle.recentTurns.length,
      memoriesSent: bundle.companionSelfMemories.length,
      budgetCapChars: DEFAULT_RAW_LAB_MAX_INPUT_CHARS
    });
  }

  function capLabel(cap: number): string {
    const isRawLabCap = cap === DEFAULT_RAW_LAB_MAX_INPUT_CHARS;
    return isRawLabCap
      ? `${cap.toLocaleString()} (Raw Lab-specific)`
      : `${cap.toLocaleString()} (custom)`;
  }

  if (!expanded) {
    return (
      <Pressable onPress={() => setExpanded(true)} style={styles.smallButton}>
        <Text style={styles.smallButtonText}>
          Thread budget{lastSend?.notice ? " ⚠" : ""}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.bannerInfo}>
      <Pressable onPress={() => setExpanded(false)}>
        <Text style={styles.sectionTitle}>Thread budget</Text>
      </Pressable>
      <Text style={styles.helpText}>
        Raw Lab max ~{DEFAULT_RAW_LAB_MAX_INPUT_CHARS.toLocaleString()} chars (Ask Harness default{" "}
        {DEFAULT_GATEWAY_MAX_INPUT_CHARS.toLocaleString()}).
      </Text>
      {lastSend ? (
        <>
          <Text style={styles.bodyText}>
            Last send: ~{lastSend.estimatedChars.toLocaleString()} chars, {lastSend.turnsSent} turns,{" "}
            {lastSend.memoriesSent} self-memories, level {lastSend.level}.
          </Text>
          <Text style={styles.helpText}>
            Budget cap used: {capLabel(lastSend.budgetCapChars)}
            {lastSend.budgetCapChars === DEFAULT_RAW_LAB_MAX_INPUT_CHARS
              ? " — not the Ask Harness 12k default."
              : ""}
          </Text>
          {lastSend.notice ? (
            <Text style={styles.bannerWarningText}>{lastSend.notice.message}</Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.helpText}>No sends yet this session.</Text>
      )}
      {preview ? (
        <>
          <Text style={styles.bodyText}>
            Preview compact: ~{preview.estimatedChars.toLocaleString()} chars, {preview.turnsSent}{" "}
            turns, {preview.memoriesSent} self-memories, level {preview.level}.
          </Text>
          <Text style={styles.helpText}>Preview cap: {capLabel(preview.budgetCapChars)}</Text>
        </>
      ) : null}
      <Pressable onPress={handlePreviewCompact} style={styles.smallButton}>
        <Text style={styles.smallButtonText}>Compact older thread memory now (preview)</Text>
      </Pressable>
    </View>
  );
}
