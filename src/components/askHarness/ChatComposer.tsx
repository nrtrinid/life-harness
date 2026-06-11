import { type RefObject } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  type TextInputKeyPressEvent,
  View
} from "react-native";

import { styles } from "../styles";
import type { ChatHarnessMode } from "../../core/harnessContext";
import { shouldSubmitOnComposerKeyPress } from "./chatComposerKeyboard";

export interface QuickQuestion {
  label: string;
  message: string;
  mode: ChatHarnessMode;
}

interface ChatComposerProps {
  message: string;
  loading: boolean;
  quickQuestions: QuickQuestion[];
  placeholder?: string;
  inputRef?: RefObject<TextInput | null>;
  onMessageChange: (value: string) => void;
  onQuickQuestion: (item: QuickQuestion) => void;
  onSend: () => void;
}

export function ChatComposer({
  message,
  loading,
  quickQuestions,
  placeholder = "Ask the scout…",
  inputRef,
  onMessageChange,
  onQuickQuestion,
  onSend
}: ChatComposerProps) {
  const canSend = !loading && message.trim().length > 0;

  function handleKeyPress(event: TextInputKeyPressEvent) {
    if (Platform.OS !== "web") {
      return;
    }

    const nativeEvent = event.nativeEvent as {
      key: string;
      shiftKey?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
      isComposing?: boolean;
    };

    if (
      !shouldSubmitOnComposerKeyPress({
        key: nativeEvent.key,
        shiftKey: nativeEvent.shiftKey,
        ctrlKey: nativeEvent.ctrlKey,
        metaKey: nativeEvent.metaKey,
        isComposing: nativeEvent.isComposing
      }) ||
      !canSend
    ) {
      return;
    }

    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    onSend();
  }

  return (
    <View style={styles.chatComposer}>
      <View style={styles.splitRow}>
        {quickQuestions.map((item) => (
          <Pressable
            key={item.label}
            style={styles.chatQuickChip}
            onPress={() => onQuickQuestion(item)}
          >
            <Text style={styles.chatQuickChipText}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.chatComposerInputRow}>
        <TextInput
          ref={inputRef}
          value={message}
          onChangeText={onMessageChange}
          onKeyPress={handleKeyPress}
          multiline
          editable={!loading}
          placeholder={placeholder}
          placeholderTextColor="rgba(212,216,200,0.3)"
          style={styles.chatComposerInput}
        />
        <Pressable style={styles.chatSendButton} disabled={!canSend} onPress={onSend}>
          {loading ? (
            <ActivityIndicator color="#0E100A" />
          ) : (
            <Text style={styles.primaryActionText}>Send</Text>
          )}
        </Pressable>
      </View>
      {Platform.OS === "web" ? (
        <Text style={styles.chatComposerHint}>Enter to send · Shift+Enter for newline</Text>
      ) : null}
    </View>
  );
}
