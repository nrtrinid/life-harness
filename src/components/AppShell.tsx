import { type PropsWithChildren } from "react";
import { useWindowDimensions, View } from "react-native";

import { CompactNav, SidebarNav } from "./SidebarNav";
import { styles } from "./styles";

const WIDE_BREAKPOINT = 900;

export function AppShell({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  if (isWide) {
    return (
      <View style={styles.appShellWide}>
        <SidebarNav />
        <View style={styles.appShellContent}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.appShellNarrow}>
      <CompactNav />
      <View style={styles.appShellContent}>{children}</View>
    </View>
  );
}
