import { describe, expect, it } from "vitest";

import {
  BACKROOM_NAV_ROUTES,
  getAllNavRoutes,
  getNavGroupForPath,
  isNavActive,
  isSystemPath,
  LEGACY_NAV_HREFS,
  NAV_GROUPS,
  PRIMARY_NAV_ROUTES
} from "./navRoutes";

describe("navRoutes", () => {
  it("keeps the primary nav focused on act surfaces only", () => {
    expect(PRIMARY_NAV_ROUTES).toEqual([
      { href: "/", label: "Today" },
      { href: "/board", label: "Board" },
      { href: "/career", label: "Jobs" },
      { href: "/ask-harness", label: "Companion" },
      { href: "/progress", label: "Playback" }
    ]);
  });

  it("includes legacy and machinery hrefs in the shell nav", () => {
    const hrefs = new Set(getAllNavRoutes().map((route) => route.href));

    for (const href of LEGACY_NAV_HREFS) {
      expect(hrefs.has(href)).toBe(true);
    }

    expect(hrefs.size).toBe(LEGACY_NAV_HREFS.length);
    expect(hrefs.has("/career")).toBe(true);
    expect(hrefs.has("/agent-workbench")).toBe(true);
    expect(hrefs.has("/proof-ledger")).toBe(true);
    expect(hrefs.has("/career-pack")).toBe(true);
    expect(hrefs.has("/job-sources")).toBe(true);
  });

  it("detects active routes including index and nested paths", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/index", "/")).toBe(true);
    expect(isNavActive("/board", "/board")).toBe(true);
    expect(isNavActive("/ask-harness", "/ask-harness")).toBe(true);
    expect(isNavActive("/card/abc", "/board")).toBe(false);
    expect(isNavActive("/job-candidates/extra", "/job-candidates")).toBe(true);
  });

  it("classifies primary and backroom paths for collapsible nav", () => {
    expect(getNavGroupForPath("/career")).toBe("primary");
    expect(getNavGroupForPath("/ask-harness")).toBe("primary");
    expect(getNavGroupForPath("/")).toBe("primary");
    expect(getNavGroupForPath("/board")).toBe("primary");
    expect(getNavGroupForPath("/progress")).toBe("primary");

    expect(isSystemPath("/agent-workbench")).toBe(true);
    expect(getNavGroupForPath("/agent-workbench")).toBe("system");
    expect(isSystemPath("/raw-lab")).toBe(true);
    expect(isSystemPath("/memory-bank")).toBe(true);
    expect(isSystemPath("/source-setup")).toBe(true);
    expect(isSystemPath("/ask-harness")).toBe(false);
    expect(isSystemPath("/review")).toBe(true);
    expect(isSystemPath("/proof-ledger")).toBe(true);
    expect(getNavGroupForPath("/proof-ledger")).toBe("system");
    expect(getNavGroupForPath("/job-sources")).toBe("system");
    expect(getNavGroupForPath("/career-pack")).toBe("system");
    expect(getNavGroupForPath("/career-intake")).toBe("system");
    expect(getNavGroupForPath("/candidate-intake")).toBe("system");
    expect(getNavGroupForPath("/job-candidates")).toBe("system");
    expect(getNavGroupForPath("/review")).toBe("system");
    expect(getNavGroupForPath("/log")).toBe("system");
    expect(getNavGroupForPath("/resume-bank")).toBe("system");
    expect(getNavGroupForPath("/card/abc")).toBe(null);
  });

  it("uses product labels and keeps machinery in backroom only", () => {
    const routes = getAllNavRoutes();
    const ask = routes.find((route) => route.href === "/ask-harness");
    const bank = routes.find((route) => route.href === "/resume-bank");
    const replay = routes.find((route) => route.href === "/review");
    const raw = routes.find((route) => route.href === "/raw-lab");
    const workbench = routes.find((route) => route.href === "/agent-workbench");
    const memory = routes.find((route) => route.href === "/memory-bank");
    const setupInPrimary = PRIMARY_NAV_ROUTES.some((route) => route.href === "/source-setup");
    const setupInBackroom = BACKROOM_NAV_ROUTES.some((route) => route.href === "/source-setup");

    expect(ask?.label).toBe("Companion");
    expect(bank?.label).toBe("Resume Bank");
    expect(replay?.label).toBe("Weekly Review");
    expect(raw?.label).toBe("Raw Signal");
    expect(workbench?.label).toBe("Agent Workbench");
    expect(memory?.label).toBe("Memory Bank");
    expect(setupInPrimary).toBe(false);
    expect(setupInBackroom).toBe(true);
    expect(NAV_GROUPS.find((group) => group.id === "system")?.label).toBe("Backroom");
    expect(NAV_GROUPS.map((group) => group.id)).toEqual(["primary", "system"]);
  });
});
