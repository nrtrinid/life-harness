import { describe, expect, it } from "vitest";

import {
  getAllNavRoutes,
  getNavGroupForPath,
  isCareerToolPath,
  isNavActive,
  isSystemPath,
  LEGACY_NAV_HREFS,
  NAV_GROUPS
} from "./navRoutes";

describe("navRoutes", () => {
  it("keeps the primary nav focused on the daily loop", () => {
    const primary = NAV_GROUPS.find((group) => group.id === "primary")?.routes;

    expect(primary).toEqual([
      { href: "/", label: "Today" },
      { href: "/career", label: "Jobs" },
      { href: "/board", label: "Board" },
      { href: "/progress", label: "Playback" },
      { href: "/ask-harness", label: "Companion" }
    ]);
  });

  it("includes legacy nav hrefs still in the shell plus Jobs hub", () => {
    const hrefs = new Set(getAllNavRoutes().map((route) => route.href));
    const legacyMovedToJobs = [
      "/career-intake",
      "/candidate-intake",
      "/job-candidates",
      "/job-sources"
    ] as const;

    for (const href of LEGACY_NAV_HREFS) {
      if (legacyMovedToJobs.includes(href as (typeof legacyMovedToJobs)[number])) {
        expect(hrefs.has(href)).toBe(false);
        continue;
      }
      expect(hrefs.has(href)).toBe(true);
    }

    expect(hrefs.has("/career")).toBe(true);
    expect(hrefs.has("/review")).toBe(true);
    expect(hrefs.has("/agent-workbench")).toBe(true);
    expect(hrefs.has("/proof-ledger")).toBe(true);
    expect(hrefs.has("/career-pack")).toBe(false);
    expect(hrefs.size).toBe(LEGACY_NAV_HREFS.length);
  });

  it("detects active routes including index and nested paths", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/index", "/")).toBe(true);
    expect(isNavActive("/board", "/board")).toBe(true);
    expect(isNavActive("/ask-harness", "/ask-harness")).toBe(true);
    expect(isNavActive("/card/abc", "/board")).toBe(false);
    expect(isNavActive("/job-candidates/extra", "/job-candidates")).toBe(true);
  });

  it("classifies career tool and system paths for collapsible nav", () => {
    expect(isCareerToolPath("/career")).toBe(true);
    expect(isCareerToolPath("/job-candidates")).toBe(true);
    expect(isCareerToolPath("/board")).toBe(false);
    expect(isSystemPath("/agent-workbench")).toBe(true);
    expect(getNavGroupForPath("/agent-workbench")).toBe("system");
    expect(isSystemPath("/raw-lab")).toBe(true);
    expect(isSystemPath("/memory-bank")).toBe(true);
    expect(isSystemPath("/source-setup")).toBe(true);
    expect(isSystemPath("/ask-harness")).toBe(false);
    expect(isSystemPath("/review")).toBe(true);
    expect(isSystemPath("/proof-ledger")).toBe(true);
    expect(getNavGroupForPath("/proof-ledger")).toBe("system");
    expect(getNavGroupForPath("/career-intake")).toBe("careerTools");
    expect(getNavGroupForPath("/ask-harness")).toBe("primary");
    expect(getNavGroupForPath("/review")).toBe("system");
    expect(getNavGroupForPath("/log")).toBe("system");
    expect(getNavGroupForPath("/")).toBe("primary");
  });

  it("uses lo-fi labels and keeps setup in backroom only", () => {
    const routes = getAllNavRoutes();
    const ask = routes.find((route) => route.href === "/ask-harness");
    const bank = routes.find((route) => route.href === "/resume-bank");
    const replay = routes.find((route) => route.href === "/review");
    const raw = routes.find((route) => route.href === "/raw-lab");
    const setupInCareer = NAV_GROUPS.find((group) => group.id === "careerTools")?.routes.some(
      (route) => route.href === "/source-setup"
    );
    const setupInBackroom = NAV_GROUPS.find((group) => group.id === "system")?.routes.some(
      (route) => route.href === "/source-setup"
    );

    expect(ask?.label).toBe("Companion");
    expect(bank?.label).toBe("Resume Bank");
    expect(replay?.label).toBe("Weekly Review");
    expect(raw?.label).toBe("Raw Signal");
    expect(setupInCareer).toBe(false);
    expect(setupInBackroom).toBe(true);
    expect(NAV_GROUPS.find((group) => group.id === "system")?.label).toBe("Backroom");
  });
});
