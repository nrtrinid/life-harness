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
      { href: "/proof-ledger", label: "Proof Ledger" },
      { href: "/review", label: "Weekly Review" },
      { href: "/memory-bank", label: "Memory Bank" },
      { href: "/raw-lab", label: "Raw Signal" },
      { href: "/log", label: "Log" },
      { href: "/resume-bank", label: "Resume Bank" },
      { href: "/job-sources", label: "Job Sources" },
      { href: "/career-pack", label: "Career Pack" },
      { href: "/job-candidates", label: "Queue" },
      { href: "/candidate-intake", label: "Candidate Intake" },
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
  "/candidate-intake",
  "/job-candidates",
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

export function isSystemPath(pathname: string): boolean {
  for (const href of SYSTEM_HREFS) {
    if (isNavActive(pathname, href)) {
      return true;
    }
  }

  return false;
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
