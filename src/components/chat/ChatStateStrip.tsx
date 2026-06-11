import { Pressable, Text, View } from "react-native";

import type { ChatStateChipDescriptor, ChatStateChipTone } from "../../core/chatBackroomSummary";
import { styles } from "../styles";

export type ChatStateStripVariant = "companion" | "rawSignal";

interface ChatStateStripProps {
  variant: ChatStateStripVariant;
  chips: ChatStateChipDescriptor[];
  backroomOpen: boolean;
  onChipPress: (chip: ChatStateChipDescriptor) => void;
}

function chipContainerStyle(tone: ChatStateChipTone | undefined, active: boolean) {
  if (active) {
    return styles.chatStateChipActive;
  }
  if (tone === "warning") {
    return styles.chatStateChipWarning;
  }
  if (tone === "accent") {
    return styles.chatStateChipAccent;
  }
  return styles.chatStateChip;
}

function chipTextStyle(tone: ChatStateChipTone | undefined) {
  if (tone === "warning") {
    return styles.chatStateChipTextWarning;
  }
  if (tone === "accent") {
    return styles.chatStateChipTextAccent;
  }
  return styles.chatStateChipText;
}

export function ChatStateStrip({
  variant,
  chips,
  backroomOpen,
  onChipPress
}: ChatStateStripProps) {
  const stripStyle =
    variant === "companion" ? styles.chatStateStripCompanion : styles.chatStateStripRawSignal;

  return (
    <View style={[styles.chatStateStrip, stripStyle]}>
      {chips.map((chip) => {
        const isBackroom = chip.id === "backroom";
        const active = isBackroom && backroomOpen;

        return (
          <Pressable
            key={chip.id}
            accessibilityRole="button"
            accessibilityState={{ expanded: isBackroom ? backroomOpen : undefined }}
            onPress={() => onChipPress(chip)}
            style={chipContainerStyle(chip.tone, active)}
          >
            <Text style={chipTextStyle(chip.tone)}>{chip.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
