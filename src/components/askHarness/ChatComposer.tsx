import { type RefObject, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputContentSizeChangeEvent,
  type TextInputKeyPressEvent,
  type TextStyle,
  useWindowDimensions,
  View
} from "react-native";

import type { ReasoningDepth } from "../../core/chatHarnessClient";
import { styles } from "../styles";
import type { ChatHarnessMode } from "../../core/harnessContext";
import {
  CHAT_COMPOSER_INPUT_MIN_HEIGHT,
  getChatComposerInputMaxHeight
} from "../chatSurfaceLayout";
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
  const { height: windowHeight } = useWindowDimensions();
  const inputMaxHeight = useMemo(
    () => getChatComposerInputMaxHeight(windowHeight),
    [windowHeight]
  );
  const [inputHeight, setInputHeight] = useState(CHAT_COMPOSER_INPUT_MIN_HEIGHT);
  const canSend = !loading && message.trim().length > 0;
  const showDepthMenu = reasoningDepth !== undefined && onReasoningDepthChange !== undefined;
  const shellAlignEnd = inputHeight > CHAT_COMPOSER_INPUT_MIN_HEIGHT + 4;

  useEffect(() => {
    if (!message) {
      setInputHeight(CHAT_COMPOSER_INPUT_MIN_HEIGHT);
    }
  }, [message]);

  function handleContentSizeChange(event: TextInputContentSizeChangeEvent) {
    const nextHeight = Math.ceil(event.nativeEvent.contentSize.height);
    setInputHeight(
      Math.min(inputMaxHeight, Math.max(CHAT_COMPOSER_INPUT_MIN_HEIGHT, nextHeight))
    );
  }

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

  const textAlignVertical: TextStyle["textAlignVertical"] =
    inputHeight > CHAT_COMPOSER_INPUT_MIN_HEIGHT ? "top" : "center";
  const webInputStyle =
    Platform.OS === "web"
      ? ({
          margin: 0,
          outlineStyle: "none",
          outlineWidth: 0,
          paddingTop: 5,
          paddingBottom: 5
        } as unknown as TextStyle)
      : null;

  const inputStyle = StyleSheet.flatten([
    styles.chatComposerInputInline,
    {
      height: inputHeight,
      maxHeight: inputMaxHeight,
      textAlignVertical
    },
    webInputStyle
  ]);

  const composerBody = (
    <>
      <View
        style={StyleSheet.flatten([
          styles.chatComposerShell,
          shellAlignEnd ? styles.chatComposerShellExpanded : null
        ])}
      >
        <ChatComposerQuickMenu items={quickQuestions} onSelect={onQuickQuestion} />
        <View
          style={StyleSheet.flatten([
            styles.chatComposerInputWrap,
            shellAlignEnd ? styles.chatComposerInputWrapExpanded : null
          ])}
        >
          <TextInput
            ref={inputRef}
            value={message}
            onChangeText={onMessageChange}
            onContentSizeChange={handleContentSizeChange}
            onKeyPress={handleKeyPress}
            multiline
            scrollEnabled={inputHeight >= inputMaxHeight}
            placeholder={placeholder}
            placeholderTextColor="rgba(212,216,200,0.3)"
            selectionColor="rgba(200,168,75,0.4)"
            style={[
              inputStyle,
              Platform.OS === "web"
                ? ({ overflow: "auto", resize: "none" } as unknown as TextStyle) // RN Web CSS; not in RN TextStyle defs
                : null
            ]}
          />
        </View>
        <View style={styles.chatComposerTrailing}>
          {showDepthMenu ? (
            <ChatComposerDepthMenu value={reasoningDepth} onChange={onReasoningDepthChange} />
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
