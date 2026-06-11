import { type ReactNode, useEffect, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { styles } from "../styles";

export type ChatBackroomSectionId =
  | "memory"
  | "style"
  | "signal"
  | "budget"
  | "context"
  | "board"
  | "inspector";

interface ChatBackroomPanelProps {
  open: boolean;
  onClose: () => void;
  focusedSection?: ChatBackroomSectionId | null;
  layout?: "inline" | "side";
  children: ReactNode;
}

export function ChatBackroomSection({
  sectionId,
  focused,
  title,
  children
}: {
  sectionId: ChatBackroomSectionId;
  focused?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <View
      nativeID={`chat-backroom-section-${sectionId}`}
      style={focused ? styles.chatBackroomSectionFocused : styles.chatBackroomSection}
    >
      {title ? <Text style={styles.chatInspectorSectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function ChatBackroomPanel({
  open,
  onClose,
  focusedSection,
  layout = "inline",
  children
}: ChatBackroomPanelProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!open || !focusedSection) {
      return;
    }
    // Best-effort scroll on web; native may no-op harmlessly.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [open, focusedSection]);

  if (!open) {
    return null;
  }

  return (
    <View
      style={[
        styles.chatBackroomPanel,
        layout === "side" ? styles.chatBackroomPanelSide : null
      ]}
    >
      <View style={styles.chatBackroomHeader}>
        <Text style={styles.chatBackroomHeaderTitle}>Backroom</Text>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.smallButton}>
          <Text style={styles.smallButtonText}>Close</Text>
        </Pressable>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.chatBackroomBody}>
        {children}
      </ScrollView>
    </View>
  );
}
