import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { NoticeState } from "./Notice";
import type { CardState } from "../core/types";
import { useLifeHarness } from "../state/LifeHarnessState";
import { WaitingNudge } from "./WaitingNudge";
import { colors, styles } from "./styles";

interface QuickCaptureProps {
  onNotice: (notice: NoticeState) => void;
  actMode?: boolean;
}

export function QuickCapture({ onNotice, actMode = false }: QuickCaptureProps) {
  const { submitQuickCapture, setCardState } = useLifeHarness();
  const [text, setText] = useState("");
  const [waitingNudge, setWaitingNudge] = useState<
    { cardId: string; label: string; state: CardState } | undefined
  >();

  function handleSubmit() {
    if (!text.trim()) {
      onNotice({ kind: "warning", message: "Type something first." });
      return;
    }

    const result = submitQuickCapture(text);
    if (result.ok) {
      setText("");
      onNotice({ kind: "success", message: result.message ?? "Logged." });
      if (result.suggestedCardState) {
        setWaitingNudge(result.suggestedCardState);
      }
    } else {
      onNotice({ kind: "info", message: result.message ?? "No rule matched." });
    }
  }

  return (
    <View style={styles.captureWrap}>
      <Text style={styles.label}>{actMode ? "Capture, log, or park" : "Report"}</Text>
      <TextInput
        editable
        placeholder={
          actMode
            ? "new idea: … · worked on … · followed up with …"
            : "worked on project for 10 min..."
        }
        placeholderTextColor={colors.inputPlaceholder}
        style={styles.captureInput}
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSubmit}
        returnKeyType="done"
      />
      <Pressable style={styles.primaryAction} onPress={handleSubmit}>
        <Text style={styles.primaryActionText}>Capture</Text>
      </Pressable>
      <Text style={styles.helpText}>
        {actMode
          ? "Try: new idea: my project · worked on resume · followed up with recruiter"
          : "New ideas go to Inbox, not Active."}
      </Text>
      {waitingNudge ? (
        <WaitingNudge
          cardId={waitingNudge.cardId}
          label={waitingNudge.label}
          onMove={setCardState}
          onDismiss={() => setWaitingNudge(undefined)}
        />
      ) : null}
    </View>
  );
}
