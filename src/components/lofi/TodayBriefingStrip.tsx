import { Link, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { Briefing } from "../../core/types";
import { getBriefingHighlightItems } from "../../core/briefing";
import type { DailyState, LifeCard, LifeLogEntry } from "../../core/types";
import { styles } from "../styles";

interface TodayBriefingStripProps {
  briefing: Briefing;
  cards: LifeCard[];
  dailyState: DailyState;
  logs: LifeLogEntry[];
  companionNote: string;
  now: Date;
}

export function TodayBriefingStrip({
  briefing,
  cards,
  dailyState,
  logs,
  companionNote,
  now
}: TodayBriefingStripProps) {
  const highlights = getBriefingHighlightItems(briefing, cards, dailyState, logs, now, 3);
  const hasHighlights = highlights.length > 0;

  if (!hasHighlights && !companionNote.trim()) {
    return null;
  }

  return (
    <View style={styles.todayBriefingStrip}>
      <Text style={styles.todayBriefingLabel}>While you were away</Text>
      {hasHighlights ? (
        <View style={styles.todayBriefingList}>
          {highlights.map((item, index) => {
            const line = (
              <Text style={styles.todayBriefingItem} key={`${item.text}-${index}`}>
                {item.text}
              </Text>
            );

            if (!item.cardId) {
              return line;
            }

            return (
              <Link key={`${item.text}-${index}`} href={`/card/${item.cardId}` as Href} asChild>
                <Pressable accessibilityRole="link">{line}</Pressable>
              </Link>
            );
          })}
        </View>
      ) : (
        <Text style={styles.todayBriefingCompanion}>{companionNote}</Text>
      )}
    </View>
  );
}
