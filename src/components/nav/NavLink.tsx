import { type Href, Link, usePathname } from "expo-router";
import { Pressable, Text } from "react-native";

import { isNavActive } from "../navRoutes";
import { styles } from "../styles";

export function NavLink({
  href,
  label,
  layout = "horizontal"
}: {
  href: string;
  label: string;
  layout?: "horizontal" | "sidebar";
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href);
  const isSidebar = layout === "sidebar";

  return (
    <Link href={href as Href} asChild>
      <Pressable
        style={
          isSidebar
            ? active
              ? styles.sidebarNavLinkActive
              : styles.sidebarNavLink
            : active
              ? styles.navPrimaryButtonActive
              : styles.navPrimaryButton
        }
      >
        <Text
          style={
            isSidebar
              ? active
                ? styles.sidebarNavLinkTextActive
                : styles.sidebarNavLinkText
              : active
                ? styles.navPrimaryButtonTextActive
                : styles.navPrimaryButtonText
          }
        >
          {label}
        </Text>
      </Pressable>
    </Link>
  );
}

export function NavSecondaryLink({
  href,
  label,
  layout = "horizontal"
}: {
  href: string;
  label: string;
  layout?: "horizontal" | "sidebar";
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href);
  const isSidebar = layout === "sidebar";

  return (
    <Link href={href as Href} asChild>
      <Pressable
        style={
          isSidebar
            ? active
              ? styles.sidebarNavLinkActive
              : styles.sidebarNavLink
            : active
              ? styles.navSecondaryButtonActive
              : styles.navSecondaryButton
        }
      >
        <Text
          style={
            isSidebar
              ? active
                ? styles.sidebarNavLinkTextActive
                : styles.sidebarNavLinkText
              : active
                ? styles.navSecondaryButtonTextActive
                : styles.navSecondaryButtonText
          }
        >
          {label}
        </Text>
      </Pressable>
    </Link>
  );
}
