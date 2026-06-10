import { type Href, Link, usePathname } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { isNavActive, NAV_GROUPS } from "./navRoutes";
import { styles } from "./styles";

function NavLink({
  href,
  label,
  active,
  variant
}: {
  href: string;
  label: string;
  active: boolean;
  variant: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";

  return (
    <Link href={href as Href} asChild>
      <Pressable
        style={isPrimary ? (active ? styles.navPrimaryButtonActive : styles.navPrimaryButton) : active ? styles.navSecondaryButtonActive : styles.navSecondaryButton}
      >
        <Text
          style={
            isPrimary
              ? active
                ? styles.navPrimaryButtonTextActive
                : styles.navPrimaryButtonText
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

export function Nav() {
  const pathname = usePathname();
  const primaryGroup = NAV_GROUPS.find((group) => group.id === "primary");
  const secondaryGroups = NAV_GROUPS.filter((group) => group.id !== "primary");

  return (
    <View style={styles.navShell}>
      {primaryGroup ? (
        <View style={styles.navPrimaryRow}>
          {primaryGroup.routes.map(({ href, label }) => (
            <NavLink
              key={href}
              href={href}
              label={label}
              active={isNavActive(pathname, href)}
              variant="primary"
            />
          ))}
        </View>
      ) : null}

      {secondaryGroups.map((group) => (
        <View key={group.id}>
          {group.label ? <Text style={styles.navGroupLabel}>{group.label}</Text> : null}
          <View style={styles.navSecondaryRow}>
            {group.routes.map(({ href, label }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                active={isNavActive(pathname, href)}
                variant="secondary"
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
