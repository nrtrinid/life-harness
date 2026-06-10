import { type PropsWithChildren, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";

interface ChatAdvancedPanelProps extends PropsWithChildren {
  title?: string;
  badge?: string;
  defaultOpen?: boolean;
  onExpandedChange?: (open: boolean) => void;
}

export function ChatAdvancedPanel({
  title = "Backroom",
  badge,
  defaultOpen = false,
  onExpandedChange,
  children
}: ChatAdvancedPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const label = badge ? `${title} · ${badge}` : title;

  function handleToggle() {
    setOpen((value) => {
      const next = !value;
      onExpandedChange?.(next);
      return next;
    });
  }

  return (
    <View style={styles.chatAdvancedPanel}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={handleToggle}
        style={styles.chatAdvancedPanelToggle}
      >
        <Text style={styles.chatAdvancedPanelToggleText}>
          {open ? `${label} ▾` : `${label} ▸`}
        </Text>
      </Pressable>
      {open ? <View style={styles.chatAdvancedPanelBody}>{children}</View> : null}
    </View>
  );
}
