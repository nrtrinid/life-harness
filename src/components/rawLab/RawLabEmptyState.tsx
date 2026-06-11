import { Pressable, Text, View } from "react-native";

import type { QuickQuestion } from "../askHarness/ChatComposer";
import { styles } from "../styles";

export const RAW_LAB_EMPTY_STATE_PROMPTS: QuickQuestion[] = [
  { label: "Blunt", message: "Give me a blunt take.", mode: "general" },
  { label: "Weird", message: "Give me a weird speculative riff.", mode: "general" },
  { label: "Playful", message: "Be playful and less corporate.", mode: "general" },
  { label: "Challenge", message: "Challenge my assumption directly.", mode: "general" }
];

interface RawLabEmptyStateProps {
  onSelectPrompt: (item: QuickQuestion) => void;
}

export function RawLabEmptyState({ onSelectPrompt }: RawLabEmptyStateProps) {
  return (
    <View style={styles.chatEmptyState}>
      <Text style={styles.chatEmptyStateTitle}>Raw Signal is open</Text>
      <Text style={styles.chatEmptyStateCopy}>
        Ungrounded sandbox — blunt takes, weird riffs, no board context.
      </Text>
      <View style={styles.chatEmptyStateSuggestions}>
        {RAW_LAB_EMPTY_STATE_PROMPTS.map((item) => (
          <Pressable
            key={item.message}
            style={styles.chatSuggestionCard}
            onPress={() => onSelectPrompt(item)}
          >
            <Text style={styles.chatSuggestionCardText}>{item.message}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
