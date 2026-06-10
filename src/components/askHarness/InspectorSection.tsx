import { type PropsWithChildren, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";

interface InspectorSectionProps extends PropsWithChildren {
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
}

export function InspectorSection({
  title,
  defaultOpen = true,
  open,
  onToggle,
  children
}: InspectorSectionProps) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : internalOpen;

  function handleToggle() {
    if (onToggle) {
      onToggle();
      return;
    }
    setInternalOpen((previous) => !previous);
  }

  return (
    <View style={styles.chatInspectorSection}>
      <Pressable style={styles.chatInspectorToggle} onPress={handleToggle}>
        <Text style={styles.chatInspectorToggleText}>
          {isOpen ? "−" : "+"} {title}
        </Text>
      </Pressable>
      {isOpen ? children : null}
    </View>
  );
}
