import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { ClarificationQuestionPresentation } from "../../core/featureSprintManualKernelBridge";
import { colors, styles } from "../styles";

export function FeatureSprintClarificationAnswersForm({
  questions,
  stateRevision,
  actionId,
  isSubmitting = false,
  error,
  onSubmit
}: {
  questions: ClarificationQuestionPresentation[];
  stateRevision: number;
  actionId: string;
  isSubmitting?: boolean;
  error?: string;
  onSubmit: (answers: Array<{ questionId: string; answer: string }>) => void;
}) {
  const [answersById, setAnswersById] = useState<Record<string, string>>({});

  useEffect(() => {
    setAnswersById({});
  }, [actionId, stateRevision]);

  if (questions.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.cardTile,
        {
          marginTop: 8,
          borderColor: colors.accentPrimary,
          borderWidth: 1
        }
      ]}
      testID="feature-sprint-clarification-answers-form"
    >
      <Text style={styles.label}>Clarification answers</Text>
      <Text style={[styles.helpText, { marginTop: 4 }]}>
        Answer the open questions, then submit explicitly. This does not approve, freeze, or launch
        workers.
      </Text>

      <View style={{ gap: 12, marginTop: 10 }}>
        {questions.map((question) => (
          <View key={question.id} style={{ gap: 4 }}>
            <Text style={styles.bodyText}>
              {question.question}
              {question.required ? (
                <Text style={{ color: colors.accentPrimary }}> (required)</Text>
              ) : (
                <Text style={styles.helpText}> (optional)</Text>
              )}
            </Text>
            <TextInput
              testID={`feature-sprint-clarification-answer-${question.id}`}
              value={answersById[question.id] ?? ""}
              onChangeText={(value) => {
                setAnswersById((prev) => ({ ...prev, [question.id]: value }));
              }}
              placeholder={question.required ? "Required answer" : "Optional answer"}
              placeholderTextColor={colors.inputPlaceholder}
              multiline
              style={[styles.captureInput, { minHeight: 64, textAlignVertical: "top" }]}
              editable={!isSubmitting}
            />
          </View>
        ))}
      </View>

      {error ? (
        <Text style={[styles.helpText, { marginTop: 8, color: colors.accentPrimary }]}>{error}</Text>
      ) : null}

      <View style={[styles.cardActionsRow, { marginTop: 12 }]}>
        <Pressable
          testID="feature-sprint-apply-clarification-answers"
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={() => {
            onSubmit(
              questions.map((question) => ({
                questionId: question.id,
                answer: answersById[question.id] ?? ""
              }))
            );
          }}
          style={[
            styles.secondaryAction,
            {
              flex: 1,
              borderColor: colors.accentPrimary,
              opacity: isSubmitting ? 0.6 : 1
            }
          ]}
        >
          <Text style={[styles.secondaryActionText, { color: colors.accentPrimary }]}>
            {isSubmitting ? "Applying…" : "Apply clarification answers"}
          </Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 10, gap: 2 }}>
        <Text style={styles.helpText}>Debug</Text>
        <Text style={styles.helpText}>State revision: {stateRevision}</Text>
        <Text style={styles.helpText} selectable>
          Action ID: {actionId}
        </Text>
      </View>
    </View>
  );
}
