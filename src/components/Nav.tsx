import { Link, usePathname } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { styles } from "./styles";

const NAV_ITEMS = [
  { href: "/", label: "Today" },
  { href: "/board", label: "Board" },
  { href: "/career-intake", label: "Intake" },
  { href: "/candidate-intake", label: "Paste" },
  { href: "/job-candidates", label: "Queue" },
  { href: "/resume-bank", label: "Bank" },
  { href: "/job-sources", label: "Sources" },
  { href: "/progress", label: "Progress" },
  { href: "/log", label: "Log" },
  { href: "/ask-harness", label: "Ask Harness Dev" }
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/" || pathname === "/index";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname();

  return (
    <View style={styles.navRow}>
      {NAV_ITEMS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link key={href} href={href} asChild>
            <Pressable style={active ? styles.navButtonActive : styles.navButton}>
              <Text style={styles.navButtonText}>{label}</Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}
