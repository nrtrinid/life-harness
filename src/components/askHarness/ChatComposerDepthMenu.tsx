import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { ReasoningDepth } from "../../core/chatHarnessClient";
import {
  reasoningDepthHint,
  reasoningDepthLabel,
  reasoningDepthShortLabel
} from "../../core/companionLabels";
import { styles } from "../styles";

const DEPTH_OPTIONS: ReasoningDepth[] = ["fast", "deliberate", "deep"];

interface ChatComposerDepthMenuProps {
  value: ReasoningDepth;
  disabled?: boolean;
  onChange: (value: ReasoningDepth) => void;
}

export function ChatComposerDepthMenu({
  value,
  disabled = false,
  onChange
}: ChatComposerDepthMenuProps) {
  const [open, setOpen] = useState(false);

  function select(next: ReasoningDepth) {
    onChange(next);
    setOpen(false);
  }

  return (
    <View style={styles.chatComposerDepthWrap}>
      {open ? (
        <View style={styles.chatComposerDepthMenu}>
          {DEPTH_OPTIONS.map((option) => {
            const active = option === value;
            return (
              <Pressable
                key={option}
                accessibilityRole="menuitem"
                style={active ? styles.chatComposerDepthMenuItemActive : styles.chatComposerDepthMenuItem}
                onPress={() => select(option)}
              >
                <Text
                  style={
                    active
                      ? styles.chatComposerDepthMenuItemLabelActive
                      : styles.chatComposerDepthMenuItemLabel
                  }
                >
                  {reasoningDepthLabel(option)}
                </Text>
                <Text style={styles.chatComposerDepthMenuItemHint}>
                  {reasoningDepthHint(option)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Thinking mode: ${reasoningDepthLabel(value)}`}
        disabled={disabled}
        style={styles.chatComposerDepthTrigger}
        onPress={() => setOpen((previous) => !previous)}
      >
        <Text style={styles.chatComposerDepthTriggerText}>
          {reasoningDepthShortLabel(value)}
        </Text>
        <Text style={styles.chatComposerDepthChevron}>{open ? "▴" : "▾"}</Text>
      </Pressable>
    </View>
  );
}
