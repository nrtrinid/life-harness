import { useState } from "react";
import { Link, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { PrimaryAction } from "../../core/types";
import { styles } from "../styles";

interface TinyQuestCardProps {
  action: PrimaryAction;
  pounceLogged?: boolean;
  onPounce?: () => void;
  label?: string;
}

export function TinyQuestCard({
  action,
  pounceLogged = false,
  onPounce,
  label = "Today mission"
}: TinyQuestCardProps) {
  const [showSmaller, setShowSmaller] = useState(false);

  return (
    <View style={styles.lofiCardQuiet}>
      <Text style={styles.lofiTapeLabel}>{label}</Text>
      <Text style={styles.titleText}>{action.title}</Text>
      <Text style={[styles.bodyText, { marginTop: 8 }]}>{action.reason}</Text>

      {showSmaller ? (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.label}>Make smaller</Text>
          <Text style={styles.bodyText}>{action.smallestAction}</Text>
        </View>
      ) : null}

      <View style={[styles.lofiRescueRow, { marginTop: 16 }]}>
        {action.kind === "pounce" && !action.targetRoute ? (
          <Pressable
            style={pounceLogged ? styles.secondaryAction : styles.primaryAction}
            onPress={onPounce}
            disabled={pounceLogged || !onPounce}
          >
            <Text style={pounceLogged ? styles.secondaryActionText : styles.primaryActionText}>
              {pounceLogged ? "Started" : action.ctaLabel === "Start Pounce" ? "Start pounce" : action.ctaLabel ?? "Start pounce"}
            </Text>
          </Pressable>
        ) : action.targetRoute ? (
          <Link href={action.targetRoute as Href} asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>{action.ctaLabel ?? "Start"}</Text>
            </Pressable>
          </Link>
        ) : action.cardId ? (
          <Link href={`/card/${action.cardId}`} asChild>
            <Pressable style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>{action.ctaLabel ?? "Start"}</Text>
            </Pressable>
          </Link>
        ) : null}

        <Pressable style={styles.secondaryAction} onPress={() => setShowSmaller((value) => !value)}>
          <Text style={styles.secondaryActionText}>{showSmaller ? "Hide smaller" : "Make smaller"}</Text>
        </Pressable>
      </View>
      {action.kind === "pounce" && !pounceLogged ? (
        <Text style={[styles.helpText, { marginTop: 8 }]}>Start pounce logs initiation — not completion.</Text>
      ) : null}
    </View>
  );
}
