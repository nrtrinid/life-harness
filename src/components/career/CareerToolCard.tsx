import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colorProofCareer, styles } from "../styles";

interface CareerToolCardProps {
  title: string;
  eyebrow?: string;
  description: string;
  href: string;
  ctaLabel: string;
  meta?: string;
  quiet?: boolean;
}

export function CareerToolCard({
  title,
  eyebrow,
  description,
  href,
  ctaLabel,
  meta,
  quiet
}: CareerToolCardProps) {
  return (
    <View
      style={[
        quiet ? styles.lofiCardQuiet : styles.lofiCard,
        !quiet && { borderLeftColor: colorProofCareer, borderLeftWidth: 3 }
      ]}
    >
      {eyebrow ? <Text style={styles.lofiTapeLabel}>{eyebrow}</Text> : null}
      <Text style={styles.titleText}>{title}</Text>
      {meta ? <Text style={styles.helpText}>{meta}</Text> : null}
      <Text style={styles.bodyText}>{description}</Text>
      <Link href={href as Href} asChild>
        <Pressable
          style={StyleSheet.flatten([
            quiet ? styles.smallButton : styles.secondaryAction,
            { alignSelf: "flex-start" }
          ])}
        >
          <Text style={quiet ? styles.smallButtonText : styles.secondaryActionText}>{ctaLabel}</Text>
        </Pressable>
      </Link>
    </View>
  );
}
