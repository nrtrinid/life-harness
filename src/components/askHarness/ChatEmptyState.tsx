import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";
import type { QuickQuestion } from "./ChatComposer";

export const EMPTY_STATE_PROMPTS: QuickQuestion[] = [
  { label: "Avoiding?", message: "What am I avoiding right now?", mode: "operator" },
  { label: "Next?", message: "What should I do next?", mode: "operator" },
  { label: "Over-opt?", message: "Am I over-optimizing again?", mode: "reflection" },
  { label: "Pattern?", message: "What pattern are you watching?", mode: "general" }
];

interface ChatEmptyStateProps {
  onSelectPrompt: (item: QuickQuestion) => void;
}

export function ChatEmptyState({ onSelectPrompt }: ChatEmptyStateProps) {
  return (
    <View style={styles.chatEmptyState}>
      <Text style={styles.chatEmptyStateTitle}>Harness is ready</Text>
      <Text style={styles.chatEmptyStateCopy}>
        Ask about your board, career momentum, projects, or patterns.
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
