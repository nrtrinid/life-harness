import { type ReactNode, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";

interface MessageActionMenuProps {
  children: ReactNode;
  trailing?: ReactNode;
}

export function MessageActionMenu({ children, trailing }: MessageActionMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.checklist}>
      <View style={styles.chatBubbleFooter}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={styles.messageActionToggle}
          onPress={() => setOpen((value) => !value)}
        >
          <Text style={styles.chatBubbleToggleText}>{open ? "Hide actions" : "Actions"}</Text>
        </Pressable>
        {trailing ? <View style={styles.chatBubbleFooterTrailing}>{trailing}</View> : null}
      </View>
      {open ? <View style={styles.messageActionRow}>{children}</View> : null}
    </View>
  );
}
