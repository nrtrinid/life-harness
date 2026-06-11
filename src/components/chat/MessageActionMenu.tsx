import { type ReactNode, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";

interface MessageActionMenuProps {
  children: ReactNode;
}

export function MessageActionMenu({ children }: MessageActionMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.checklist}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.messageActionToggle}
        onPress={() => setOpen((value) => !value)}
      >
        <Text style={styles.chatBubbleToggleText}>{open ? "Hide actions" : "Actions"}</Text>
      </Pressable>
      {open ? <View style={styles.messageActionRow}>{children}</View> : null}
    </View>
  );
}
