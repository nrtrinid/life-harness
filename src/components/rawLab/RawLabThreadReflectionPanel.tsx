import { Pressable, Text, View } from "react-native";

import {
  hasRawLabThreadReflectionProposal,
  type RawLabThreadReflectionResponse
} from "../../core/rawLabThreadReflectionClient";
import { styles } from "../styles";

interface RawLabThreadReflectionPanelProps {
  reflection: RawLabThreadReflectionResponse | null;
  reflecting: boolean;
  disabled?: boolean;
  onReflect: () => void;
  onApply: () => void;
  onDismiss: () => void;
}

const FIELD_LABELS: Array<{
  key:
    | "self_observations"
    | "questions_to_revisit"
    | "provisional_stances"
    | "do_not_repeat"
    | "user_steering";
  label: string;
}> = [
  { key: "self_observations", label: "Self-observations" },
  { key: "questions_to_revisit", label: "Questions to revisit" },
  { key: "provisional_stances", label: "Provisional stances" },
  { key: "do_not_repeat", label: "Do not repeat" },
  { key: "user_steering", label: "User steering" }
];

function ProposalList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <View style={styles.checklist}>
      <Text style={styles.helpText}>{label}</Text>
      {items.map((item, index) => (
        <View style={styles.memoryReviewCard} key={`${label}-${index}`}>
          <Text style={styles.memoryReviewCardText}>&ldquo;{item}&rdquo;</Text>
        </View>
      ))}
    </View>
  );
}

export function RawLabThreadReflectionPanel({
  reflection,
  reflecting,
  disabled = false,
  onReflect,
  onApply,
  onDismiss
}: RawLabThreadReflectionPanelProps) {
  const hasProposal = hasRawLabThreadReflectionProposal(reflection);

  return (
    <View style={styles.checklist}>
      <Text style={styles.sectionTitle}>Thread reflection</Text>
      <Text style={styles.helpText}>
        Temporary to this chat. Review before applying. Not saved to Life Harness.
      </Text>
      <Pressable style={styles.smallButton} onPress={onReflect} disabled={reflecting || disabled}>
        <Text style={styles.smallButtonText}>
          {reflecting ? "Reflecting..." : "Reflect on thread"}
        </Text>
      </Pressable>

      {reflection && !hasProposal ? (
        <Text style={styles.helpText}>No thread-state changes proposed.</Text>
      ) : null}

      {reflection?.proposals.current_vibe.trim() ? (
        <View style={styles.checklist}>
          <Text style={styles.helpText}>Current vibe</Text>
          <View style={styles.memoryReviewCard}>
            <Text style={styles.memoryReviewCardText}>
              &ldquo;{reflection.proposals.current_vibe}&rdquo;
            </Text>
          </View>
        </View>
      ) : null}

      {reflection
        ? FIELD_LABELS.map(({ key, label }) => (
            <ProposalList key={key} label={label} items={reflection.proposals[key]} />
          ))
        : null}

      {reflection?.safety_notes.length ? (
        <Text style={styles.helpText}>{reflection.safety_notes.join(" ")}</Text>
      ) : null}

      {reflection ? (
        <View style={styles.splitRow}>
          {hasProposal ? (
            <Pressable style={styles.smallButton} onPress={onApply}>
              <Text style={styles.smallButtonText}>Apply to this chat</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.smallButton} onPress={onDismiss}>
            <Text style={styles.smallButtonText}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
