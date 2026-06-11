import { type RefObject } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEvent,
  type TextStyle,
  View
} from "react-native";

import type { ReasoningDepth } from "../../core/chatHarnessClient";
import { styles } from "../styles";
import type { ChatHarnessMode } from "../../core/harnessContext";
import { ChatComposerDepthMenu } from "./ChatComposerDepthMenu";
import { ChatComposerQuickMenu } from "./ChatComposerQuickMenu";
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
  reasoningDepth?: ReasoningDepth;
  onReasoningDepthChange?: (value: ReasoningDepth) => void;
  centered?: boolean;
  onMessageChange: (value: string) => void;
  onQuickQuestion: (item: QuickQuestion) => void;
  onSend: () => void;
}

function webComposerInputOverrides(singleLineInput: boolean): TextStyle {
  // `resize` and outline props are web-only CSS; they are not on React Native TextStyle.
  return {
    margin: 0,
    outlineStyle: "none",
    outlineWidth: 0,
    paddingTop: 5,
    paddingBottom: 5,
    resize: "none",
    ...(singleLineInput ? { height: 32 } : { minHeight: 32 })
  } as unknown as TextStyle;
}

export function ChatComposer({
  message,
  loading,
  quickQuestions,
  placeholder = "Ask the scout…",
  inputRef,
  reasoningDepth,
  onReasoningDepthChange,
  centered = false,
  onMessageChange,
  onQuickQuestion,
  onSend
}: ChatComposerProps) {
  const canSend = !loading && message.trim().length > 0;
  const showDepthMenu = reasoningDepth !== undefined && onReasoningDepthChange !== undefined;
  const singleLineInput = !message.includes("\n");

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

  const composerBody = (
    <>
      <View style={styles.chatComposerShell}>
        <ChatComposerQuickMenu
          items={quickQuestions}
          disabled={loading}
          onSelect={onQuickQuestion}
        />
        <View style={styles.chatComposerInputWrap}>
          <TextInput
            ref={inputRef}
            value={message}
            onChangeText={onMessageChange}
            onKeyPress={handleKeyPress}
            multiline
            editable={!loading}
            placeholder={placeholder}
            placeholderTextColor="rgba(212,216,200,0.3)"
            selectionColor="rgba(200,168,75,0.4)"
            style={StyleSheet.flatten([
              styles.chatComposerInputInline,
              Platform.OS === "web" ? webComposerInputOverrides(singleLineInput) : null
            ])}
          />
        </View>
        <View style={styles.chatComposerTrailing}>
          {showDepthMenu ? (
            <ChatComposerDepthMenu
              value={reasoningDepth}
              disabled={loading}
              onChange={onReasoningDepthChange}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={StyleSheet.flatten([
              styles.chatComposerSendCircle,
              !canSend && styles.chatComposerSendCircleDisabled
            ])}
            disabled={!canSend}
            onPress={onSend}
          >
            {loading ? (
              <ActivityIndicator color="#0E100A" size="small" />
            ) : (
              <Text style={styles.chatComposerSendArrow}>↑</Text>
            )}
          </Pressable>
        </View>
      </View>
      {Platform.OS === "web" ? (
        <Text
          style={StyleSheet.flatten([
            styles.chatComposerHint,
            centered ? styles.chatComposerHintCentered : null
          ])}
        >
          Enter to send · Shift+Enter for newline
        </Text>
      ) : null}
    </>
  );

  return (
    <View style={StyleSheet.flatten([styles.chatComposer, centered ? styles.chatComposerCentered : null])}>
      {centered ? <View style={styles.chatComposerBodyNarrow}>{composerBody}</View> : composerBody}
    </View>
  );
}
