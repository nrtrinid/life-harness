import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";
import type { QuickQuestion } from "./ChatComposer";

interface ChatComposerQuickMenuProps {
  items: QuickQuestion[];
  disabled?: boolean;
  onSelect: (item: QuickQuestion) => void;
}

export function ChatComposerQuickMenu({
  items,
  disabled = false,
  onSelect
}: ChatComposerQuickMenuProps) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) {
    return null;
  }

  function handleSelect(item: QuickQuestion) {
    onSelect(item);
    setOpen(false);
  }

  return (
    <View style={styles.chatComposerQuickWrap}>
      {open ? (
        <View style={styles.chatComposerQuickMenu}>
          {items.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="menuitem"
              style={styles.chatComposerQuickMenuItem}
              onPress={() => handleSelect(item)}
            >
              <Text style={styles.chatComposerQuickMenuItemLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick prompts"
        disabled={disabled}
        style={styles.chatComposerQuickTrigger}
        onPress={() => setOpen((previous) => !previous)}
      >
        <Text style={styles.chatComposerQuickTriggerText}>+</Text>
      </Pressable>
    </View>
  );
}
