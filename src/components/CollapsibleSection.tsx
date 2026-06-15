import { type PropsWithChildren, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "./styles";

interface CollapsibleSectionProps extends PropsWithChildren {
  title: string;
  defaultOpen?: boolean;
  testID?: string;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  testID
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        testID={testID}
        onPress={() => setOpen((value) => !value)}
        style={styles.collapsibleHeader}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.collapsibleChevron}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}
