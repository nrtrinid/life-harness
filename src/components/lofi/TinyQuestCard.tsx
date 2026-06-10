import { useState } from "react";
import { Link, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { PrimaryAction } from "../../core/types";
import { styles } from "../styles";

interface TinyQuestCardProps {
  action: PrimaryAction;
  pounceLogged?: boolean;
  onPounce?: () => void;
}

export function TinyQuestCard({ action, pounceLogged = false, onPounce }: TinyQuestCardProps) {
  const [showSmaller, setShowSmaller] = useState(false);

  return (
    <View style={styles.lofiCardHero}>
      <Text style={styles.lofiTapeLabel}>Tiny quest</Text>
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
              {pounceLogged ? "Started" : "Start"}
            </Text>
          </Pressable>
        ) : action.targetRoute ? (
          <Link href={action.targetRoute as Href} asChild>
            <Pressable style={styles.primaryAction}>
              <Text style={styles.primaryActionText}>{action.ctaLabel ?? "Start"}</Text>
            </Pressable>
          </Link>
        ) : action.cardId ? (
          <Link href={`/card/${action.cardId}`} asChild>
            <Pressable style={styles.primaryAction}>
              <Text style={styles.primaryActionText}>{action.ctaLabel ?? "Start"}</Text>
            </Pressable>
          </Link>
        ) : null}

        <Pressable style={styles.secondaryAction} onPress={() => setShowSmaller((value) => !value)}>
          <Text style={styles.secondaryActionText}>{showSmaller ? "Hide smaller" : "Make smaller"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
