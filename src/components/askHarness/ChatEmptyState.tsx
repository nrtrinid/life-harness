import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";
import type { QuickQuestion } from "./ChatComposer";

export const EMPTY_STATE_PROMPTS: QuickQuestion[] = [
  { label: "Next?", message: "What should I do next?", mode: "operator" },
  { label: "Avoiding?", message: "What am I avoiding?", mode: "operator" },
  { label: "Smaller", message: "Make this smaller.", mode: "reflection" },
  { label: "Pattern?", message: "What pattern are you noticing?", mode: "general" }
];

interface ChatEmptyStateProps {
  onSelectPrompt: (item: QuickQuestion) => void;
}

export function ChatEmptyState({ onSelectPrompt }: ChatEmptyStateProps) {
  return (
    <View style={styles.chatEmptyState}>
      <Text style={styles.chatEmptyStateTitle}>Companion is ready</Text>
      <Text style={styles.chatEmptyStateCopy}>
        Ask about your next move, a card, or a pattern.
      </Text>
      <View style={styles.chatEmptyStateSuggestions}>
        {EMPTY_STATE_PROMPTS.map((item) => (
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
