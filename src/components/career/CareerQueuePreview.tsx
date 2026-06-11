import { Link, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { CareerHubQueuePreviewItem } from "../../core/careerHub";
import { styles } from "../styles";

interface CareerQueuePreviewProps {
  emptyText: string;
  items: CareerHubQueuePreviewItem[];
}

export function CareerQueuePreview({ emptyText, items }: CareerQueuePreviewProps) {
  if (items.length === 0) {
    return <Text style={styles.emptyText}>{emptyText}</Text>;
  }

  return (
    <View style={styles.checklist}>
      {items.map((item) => (
        <Link key={item.id} href={item.href as Href} asChild>
          <Pressable style={styles.cardTile}>
            <Text style={styles.titleText}>{item.title}</Text>
            <Text style={styles.helpText}>{item.detail}</Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}
