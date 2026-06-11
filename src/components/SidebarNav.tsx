import { type ReactNode, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { usePathname } from "expo-router";

import {
  BACKROOM_NAV_ROUTES,
  getNavGroupForPath,
  NAV_GROUPS,
  PRIMARY_NAV_ROUTES
} from "./navRoutes";
import { NavLink, NavSecondaryLink } from "./nav/NavLink";
import { styles } from "./styles";

function NavGroupToggle({
  label,
  open,
  onToggle,
  children,
  layout
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  layout: "sidebar" | "compact";
}) {
  if (layout === "sidebar") {
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={onToggle}
          style={styles.sidebarGroupToggle}
        >
          <Text style={styles.sidebarGroupLabel}>
            {label} {open ? "▾" : "▸"}
          </Text>
        </Pressable>
        {open ? <View style={styles.sidebarNavStack}>{children}</View> : null}
      </View>
    );
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={styles.navCompactBackroomToggle}
      >
        <Text style={styles.navCompactBackroomToggleText}>
          {label} {open ? "▾" : "▸"}
        </Text>
      </Pressable>
      {open ? <View style={styles.navSecondaryRow}>{children}</View> : null}
    </View>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const activeGroup = getNavGroupForPath(pathname);
  const backroomGroup = NAV_GROUPS.find((group) => group.id === "system");

  const [backroomOpen, setBackroomOpen] = useState(activeGroup === "system");

  useEffect(() => {
    if (activeGroup === "system") {
      setBackroomOpen(true);
    }
  }, [activeGroup]);

  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarBrand}>
        <Text style={styles.sidebarBrandTitle}>Life Harness</Text>
        <Text style={styles.sidebarBrandSubtitle}>local companion awake</Text>
      </View>

      <View style={styles.sidebarNavStack}>
        {PRIMARY_NAV_ROUTES.map(({ href, label }) => (
          <NavLink key={href} href={href} label={label} layout="sidebar" />
        ))}
      </View>

      {backroomGroup ? (
        <NavGroupToggle
          label={backroomGroup.label ?? "Backroom"}
          open={backroomOpen}
          onToggle={() => setBackroomOpen((value) => !value)}
          layout="sidebar"
        >
          {backroomGroup.routes.map(({ href, label }) => (
            <NavSecondaryLink key={href} href={href} label={label} layout="sidebar" />
          ))}
        </NavGroupToggle>
      ) : null}
    </View>
  );
}

export function CompactNav() {
  const pathname = usePathname();
  const activeGroup = getNavGroupForPath(pathname);
  const [backroomOpen, setBackroomOpen] = useState(activeGroup === "system");

  useEffect(() => {
    if (activeGroup === "system") {
      setBackroomOpen(true);
    }
  }, [activeGroup]);

  return (
    <View style={styles.navTopChrome}>
      <View style={styles.sidebarBrand}>
        <Text style={styles.sidebarBrandTitle}>Life Harness</Text>
        <Text style={styles.sidebarBrandSubtitle}>local companion awake</Text>
      </View>

      <View style={styles.navPrimaryRow}>
        {PRIMARY_NAV_ROUTES.map(({ href, label }) => (
          <NavLink key={href} href={href} label={label} layout="horizontal" />
        ))}
      </View>

      <NavGroupToggle
        label="Backroom"
        open={backroomOpen}
        onToggle={() => setBackroomOpen((value) => !value)}
        layout="compact"
      >
        {BACKROOM_NAV_ROUTES.map(({ href, label }) => (
          <NavSecondaryLink key={href} href={href} label={label} layout="horizontal" />
        ))}
      </NavGroupToggle>
    </View>
  );
}
