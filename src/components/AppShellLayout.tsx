import { type PropsWithChildren } from "react";
import { usePathname } from "expo-router";
import { View } from "react-native";

import { AppShell } from "./AppShell";
import { styles } from "./styles";

function isCardDetailPath(pathname: string): boolean {
  return pathname === "/card" || pathname.startsWith("/card/");
}

export function AppShellLayout({ children }: PropsWithChildren) {
  const pathname = usePathname();

  if (isCardDetailPath(pathname)) {
    return <View style={styles.appShellContent}>{children}</View>;
  }

  return <AppShell>{children}</AppShell>;
}
