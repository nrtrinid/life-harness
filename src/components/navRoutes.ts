export interface NavRoute {
  href: string;
  label: string;
}

export interface NavGroup {
  id: "primary" | "careerTools" | "system";
  label?: string;
  routes: NavRoute[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "primary",
    routes: [
      { href: "/", label: "Today" },
      { href: "/career", label: "Jobs" },
      { href: "/board", label: "Board" },
      { href: "/progress", label: "Playback" },
      { href: "/ask-harness", label: "Companion" }
    ]
  },
  {
    id: "careerTools",
    label: "Career tools",
    routes: [{ href: "/resume-bank", label: "Resume Bank" }]
  },
  {
    id: "system",
    label: "Backroom",
    routes: [
      { href: "/agent-workbench", label: "Workbench" },
      { href: "/raw-lab", label: "Raw Signal" },
      { href: "/memory-bank", label: "Tape Archive" },
      { href: "/review", label: "Weekly Review" },
      { href: "/proof-ledger", label: "Proof Ledger" },
      { href: "/log", label: "Log" },
      { href: "/source-setup", label: "Source Setup" }
    ]
  }
];

export const PRIMARY_NAV_ROUTES = NAV_GROUPS.find((group) => group.id === "primary")!.routes;

export const BACKROOM_NAV_ROUTES = NAV_GROUPS.find((group) => group.id === "system")!.routes;

/** Hrefs from the pre-v0.1 flat nav — used for parity checks. */
export const LEGACY_NAV_HREFS = [
  "/",
  "/board",
  "/career-intake",
  "/candidate-intake",
  "/job-candidates",
  "/resume-bank",
  "/memory-bank",
  "/job-sources",
  "/source-setup",
  "/progress",
  "/log",
  "/ask-harness",
  "/raw-lab"
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

const CAREER_TOOL_HREFS = new Set(
  NAV_GROUPS.find((group) => group.id === "careerTools")?.routes.map((route) => route.href) ?? []
);

/** Career routes still reachable from Jobs but not listed in Career Tools nav. */
const HIDDEN_CAREER_HREFS = [
  "/career-intake",
  "/candidate-intake",
  "/job-candidates",
  "/career-pack",
  "/job-sources"
] as const;

const SYSTEM_HREFS = new Set(
  NAV_GROUPS.find((group) => group.id === "system")?.routes.map((route) => route.href) ?? []
);

export function isCareerToolPath(pathname: string): boolean {
  if (pathname === "/career" || pathname === "/career/") {
    return true;
  }

  for (const href of [...CAREER_TOOL_HREFS, ...HIDDEN_CAREER_HREFS]) {
    if (isNavActive(pathname, href)) {
      return true;
    }
  }

  return false;
}

export function isSystemPath(pathname: string): boolean {
  for (const href of SYSTEM_HREFS) {
    if (isNavActive(pathname, href)) {
      return true;
    }
  }

  return false;
}

export function getNavGroupForPath(pathname: string): NavGroup["id"] | null {
  if (isCareerToolPath(pathname)) {
    return "careerTools";
  }

  if (isSystemPath(pathname)) {
    return "system";
  }

  const primary = NAV_GROUPS.find((group) => group.id === "primary");
  if (primary?.routes.some((route) => isNavActive(pathname, route.href))) {
    return "primary";
  }

  return null;
}
