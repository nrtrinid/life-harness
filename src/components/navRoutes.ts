export interface NavRoute {
  href: string;
  label: string;
}

export interface NavGroup {
  id: "primary" | "system";
  label?: string;
  routes: NavRoute[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "primary",
    routes: [
      { href: "/", label: "Today" },
      { href: "/board", label: "Board" },
      { href: "/career", label: "Jobs" },
      { href: "/ask-harness", label: "Companion" },
      { href: "/progress", label: "Playback" }
    ]
  },
  {
    id: "system",
    label: "Backroom",
    routes: [
      { href: "/agent-workbench", label: "Agent Workbench" },
      { href: "/feature-sprints", label: "Feature Sprints" },
      { href: "/proof-ledger", label: "Proof Ledger" },
      { href: "/review", label: "Weekly Review" },
      { href: "/memory-bank", label: "Memory Bank" },
      { href: "/raw-lab", label: "Raw Signal" },
      { href: "/log", label: "Log" },
      { href: "/resume-bank", label: "Resume Bank" },
      { href: "/job-sources", label: "Job Sources" },
      { href: "/career-pack", label: "Career Pack" },
      { href: "/career?tab=review", label: "Review queue" },
      { href: "/career?tab=find&add=1", label: "Paste a job" },
      { href: "/career-intake", label: "Career Intake" },
      { href: "/source-setup", label: "Source Setup" }
    ]
  }
];

export const PRIMARY_NAV_ROUTES = NAV_GROUPS.find((group) => group.id === "primary")!.routes;

export const BACKROOM_NAV_ROUTES = NAV_GROUPS.find((group) => group.id === "system")!.routes;

/** Hrefs from the pre-v0.1 flat nav plus later machinery routes — parity checks. */
export const LEGACY_NAV_HREFS = [
  "/",
  "/board",
  "/career",
  "/career-intake",
  "/career?tab=find&add=1",
  "/career?tab=review",
  "/resume-bank",
  "/memory-bank",
  "/job-sources",
  "/career-pack",
  "/source-setup",
  "/progress",
  "/log",
  "/ask-harness",
  "/raw-lab",
  "/agent-workbench",
  "/feature-sprints",
  "/proof-ledger",
  "/review"
] as const;

export function getAllNavRoutes(): NavRoute[] {
  return NAV_GROUPS.flatMap((group) => group.routes);
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/" || pathname === "/index";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

const SYSTEM_HREFS = new Set(
  NAV_GROUPS.find((group) => group.id === "system")?.routes.map((route) => route.href) ?? []
);

const LEGACY_SYSTEM_PATHS = ["/candidate-intake", "/job-candidates"] as const;

export function isSystemPath(pathname: string): boolean {
  for (const href of SYSTEM_HREFS) {
    if (isNavActive(pathname, href)) {
      return true;
    }
  }

  return LEGACY_SYSTEM_PATHS.some((href) => isNavActive(pathname, href));
}

export function getNavGroupForPath(pathname: string): NavGroup["id"] | null {
  const primary = NAV_GROUPS.find((group) => group.id === "primary");
  if (primary?.routes.some((route) => isNavActive(pathname, route.href))) {
    return "primary";
  }

  if (isSystemPath(pathname)) {
    return "system";
  }

  return null;
}
