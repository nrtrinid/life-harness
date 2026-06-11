import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";
import type { CompanionSelfMemory } from "../../core/companionSelfMemory";
import { DEFAULT_GATEWAY_MAX_INPUT_CHARS } from "../../core/gatewayBudget";
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
  gatewayRawLabMaxInputChars: number;
  gatewayMaxInputChars?: number;
  companionSelfMemories?: CompanionSelfMemory[];
  forceExpanded?: boolean;
  embeddedInBackroom?: boolean;
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
  gatewayRawLabMaxInputChars,
  gatewayMaxInputChars = DEFAULT_GATEWAY_MAX_INPUT_CHARS,
  companionSelfMemories = [],
  forceExpanded = false,
  embeddedInBackroom = false,
  lastSend
}: RawLabBudgetInspectorProps) {
  const [expanded, setExpanded] = useState(embeddedInBackroom);
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
      companionSelfMemories,
      maxInputChars: gatewayRawLabMaxInputChars
    });
    setPreview({
      estimatedChars: bundle.estimatedChars,
      level: bundle.level,
      turnsSent: bundle.recentTurns.length,
      memoriesSent: bundle.companionSelfMemories.length,
      budgetCapChars: gatewayRawLabMaxInputChars
    });
  }

  function capLabel(cap: number): string {
    const isRawLabCap = cap === gatewayRawLabMaxInputChars;
    const isHarnessDefault = cap === gatewayMaxInputChars;
    if (isRawLabCap) {
      return `${cap.toLocaleString()} (Raw Signal-specific)`;
    }
    if (isHarnessDefault) {
      return `${cap.toLocaleString()} (Companion default)`;
    }
    return `${cap.toLocaleString()} (custom)`;
  }

  if (!expanded) {
    return (
      <Pressable onPress={() => setExpanded(true)} style={styles.smallButton}>
        <Text style={styles.smallButtonText}>
          {embeddedInBackroom ? "Show budget details" : `Thread budget${lastSend?.notice ? " ⚠" : ""}`}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.chatBackroomSection}>
      <Pressable onPress={() => !embeddedInBackroom && setExpanded(false)}>
        <Text style={styles.sectionTitle}>Thread budget</Text>
      </Pressable>
      <Text style={styles.helpText}>
        {lastSend?.notice ? "Compact older thread memory when needed." : "Budget OK for now."}
      </Text>
      <Text style={styles.helpText}>
        Raw Signal max ~{gatewayRawLabMaxInputChars.toLocaleString()} chars (Companion default{" "}
        {gatewayMaxInputChars.toLocaleString()}).
      </Text>
      {lastSend ? (
        <>
          <Text style={styles.bodyText}>
            Last send: ~{lastSend.estimatedChars.toLocaleString()} chars, {lastSend.turnsSent} turns,{" "}
            {lastSend.memoriesSent} self-memories, level {lastSend.level}.
          </Text>
          <Text style={styles.helpText}>
            Budget cap used: {capLabel(lastSend.budgetCapChars)}
            {lastSend.budgetCapChars === gatewayRawLabMaxInputChars &&
            gatewayRawLabMaxInputChars !== gatewayMaxInputChars
              ? ` — not the Companion ${gatewayMaxInputChars.toLocaleString()} default.`
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
