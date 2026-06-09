import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { NoticeState } from "./Notice";
import { useLifeHarness } from "../state/LifeHarnessState";
import { colors, styles } from "./styles";

interface QuickCaptureProps {
  onNotice: (notice: NoticeState) => void;
}

export function QuickCapture({ onNotice }: QuickCaptureProps) {
  const { submitQuickCapture } = useLifeHarness();
  const [text, setText] = useState("");

  function handleSubmit() {
    if (!text.trim()) {
      onNotice({ kind: "warning", message: "Type something first." });
      return;
    }

    const result = submitQuickCapture(text);
    if (result.ok) {
      setText("");
      onNotice({ kind: "success", message: result.message ?? "Logged." });
    } else {
      onNotice({ kind: "info", message: result.message ?? "No rule matched." });
    }
  }

  return (
    <View style={styles.captureWrap}>
      <Text style={styles.label}>Report</Text>
      <TextInput
        editable
        placeholder="worked on project for 10 min..."
        placeholderTextColor={colors.inputPlaceholder}
        style={styles.captureInput}
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSubmit}
        returnKeyType="done"
      />
      <Pressable style={styles.secondaryAction} onPress={handleSubmit}>
        <Text style={styles.secondaryActionText}>Log Action</Text>
      </Pressable>
      <Text style={styles.helpText}>New ideas go to Inbox, not Active.</Text>
    </View>
  );
}
