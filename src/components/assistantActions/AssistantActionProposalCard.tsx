import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";
import type {
  AssistantActionPreview,
  AssistantProposedAction
} from "../../core/assistantActionRegistry";

export type ProposalUiStatus = "pending" | "approved" | "dismissed";

type AssistantActionProposalCardProps = {
  action: AssistantProposedAction;
  preview?: AssistantActionPreview;
  validationError?: string;
  status: ProposalUiStatus;
  onApprove: () => void;
  onDismiss: () => void;
};

function RiskPill({ risk }: { risk: AssistantActionPreview["risk"] }) {
  const label = risk === "low" ? "Low risk" : "Medium risk";
  return (
    <View style={styles.chatMetaPill}>
      <Text style={styles.chatMetaPillText}>{label}</Text>
    </View>
  );
}

export function AssistantActionProposalCard({
  action,
  preview,
  validationError,
  status,
  onApprove,
  onDismiss
}: AssistantActionProposalCardProps) {
  const valid = !validationError && preview;
  const title = preview?.title ?? action.type.replaceAll("_", " ");

  return (
    <View style={styles.cardTile}>
      <View style={styles.splitRow}>
        <Text style={styles.titleText}>{title}</Text>
        {preview ? <RiskPill risk={preview.risk} /> : null}
      </View>
      {preview?.cardTitle ? (
        <Text style={styles.helpText}>Card: {preview.cardTitle}</Text>
      ) : null}
      {validationError ? (
        <Text style={styles.helpText}>{validationError}</Text>
      ) : preview ? (
        <Text style={styles.bodyText}>{preview.description}</Text>
      ) : null}
      {status === "pending" && valid ? (
        <View style={styles.splitRow}>
          <Pressable style={styles.primaryAction} onPress={onApprove}>
            <Text style={styles.primaryActionText}>Approve</Text>
          </Pressable>
          <Pressable style={styles.secondaryAction} onPress={onDismiss}>
            <Text style={styles.secondaryActionText}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
      {status === "approved" ? <Text style={styles.helpText}>Approved</Text> : null}
      {status === "dismissed" ? <Text style={styles.helpText}>Dismissed</Text> : null}
    </View>
  );
}
