import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AREA_LABELS, WARMTH_LABELS } from "../core/labels";
import { computeCardProgress } from "../core/progress";
import { computeCardWarmth } from "../core/warmth";
import type { LifeCard, LifeLogEntry } from "../core/types";
import { useLifeHarness } from "../state/LifeHarnessState";
import { CardStateButtons } from "./CardStateButtons";
import { ProgressBar } from "./ProgressBar";
import { styles } from "./styles";

interface CardTileProps {
  card: LifeCard;
  logs: LifeLogEntry[];
  compact?: boolean;
  showStateButtons?: boolean;
}

export function CardTile({ card, logs, compact = false, showStateButtons = false }: CardTileProps) {
  const { dailyState } = useLifeHarness();
  const tileStyle = StyleSheet.flatten([styles.cardTile, compact ? styles.cardTileCompact : null]);
  const warmth = computeCardWarmth(card, logs, new Date());
  const progress = computeCardProgress(card, logs, dailyState.sessionStartedAt);

  return (
    <View style={tileStyle}>
      <Link href={`/card/${card.id}`} asChild>
        <Pressable style={styles.cardLinkArea}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardWarmth}>{WARMTH_LABELS[warmth]}</Text>
          </View>
          <Text style={styles.cardMeta}>
            {AREA_LABELS[card.area]}
            {card.careerApplication ? ` · ${card.careerApplication.company}` : ""} · {card.state}
          </Text>
          <ProgressBar value={progress} />
          <Text style={styles.label}>Next Tiny Action</Text>
          <Text style={styles.bodyText}>{card.nextTinyAction}</Text>
        </Pressable>
      </Link>
      {showStateButtons ? <CardStateButtons cardId={card.id} currentState={card.state} compact /> : null}
    </View>
  );
}
