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
      { href: "/board", label: "Board" },
      { href: "/career", label: "Career" },
      { href: "/ask-harness", label: "Ask" },
      { href: "/progress", label: "Progress" },
      { href: "/review", label: "Review" }
    ]
  },
  {
    id: "careerTools",
    label: "Career Tools",
    routes: [
      { href: "/career-intake", label: "Intake" },
      { href: "/candidate-intake", label: "Paste" },
      { href: "/job-candidates", label: "Queue" },
      { href: "/career-pack", label: "Career Pack" },
      { href: "/resume-bank", label: "Bank" },
      { href: "/job-sources", label: "Sources" },
      { href: "/source-setup", label: "Setup" }
    ]
  },
  {
    id: "system",
    label: "System",
    routes: [
      { href: "/memory-bank", label: "Memory" },
      { href: "/log", label: "Log" },
      { href: "/raw-lab", label: "Raw Lab" }
    ]
  }
];

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

const SYSTEM_HREFS = new Set(
  NAV_GROUPS.find((group) => group.id === "system")?.routes.map((route) => route.href) ?? []
);

export function isCareerToolPath(pathname: string): boolean {
  if (pathname === "/career" || pathname === "/career/") {
    return true;
  }

  for (const href of CAREER_TOOL_HREFS) {
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
