import { type PropsWithChildren } from "react";
import { ScrollView } from "react-native";

import { styles } from "./styles";

export function Screen({ children }: PropsWithChildren) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      {children}
    </ScrollView>
  );
}
