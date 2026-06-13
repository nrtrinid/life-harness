import { describe, expect, it } from "vitest";

import type { CareerHubSummary } from "./careerHub";
import {
  jobBoardTabHref,
  parseJobBoardTab,
  resolveJobBoardTab,
  suggestJobBoardTab
} from "./jobBoardTab";

function summary(overrides: Partial<CareerHubSummary> = {}): CareerHubSummary {
  return {
    nextAction: {
      title: "Test",
      reason: "Test",
      ctaLabel: "Go",
      href: "/career"
    },
    queueCount: 0,
    activeApplicationCount: 0,
    waitingApplicationCount: 0,
    followUpCount: 0,
    dueSourceCount: 0,
    enabledSourceCount: 0,
    resumeModuleCount: 0,
    activeResumeModuleCount: 0,
    hasCareerPack: false,
    queuePreview: [],
    followUpPreview: [],
    applicationPreview: [],
    ...overrides
  };
}

describe("jobBoardTab", () => {
  it("parses valid tab params", () => {
    expect(parseJobBoardTab("find")).toBe("find");
    expect(parseJobBoardTab("review")).toBe("review");
    expect(parseJobBoardTab("apply")).toBe("apply");
    expect(parseJobBoardTab("followup")).toBe("followup");
    expect(parseJobBoardTab(["review"])).toBe("review");
  });

  it("returns null for invalid or missing params", () => {
    expect(parseJobBoardTab(undefined)).toBeNull();
    expect(parseJobBoardTab("invalid")).toBeNull();
  });

  it("suggests followup when follow-ups are due", () => {
    expect(suggestJobBoardTab(summary({ followUpCount: 2, queueCount: 5 }))).toBe("followup");
  });

  it("suggests review when queue has candidates", () => {
    expect(suggestJobBoardTab(summary({ queueCount: 3 }))).toBe("review");
  });

  it("suggests apply when applications are in motion", () => {
    expect(
      suggestJobBoardTab(summary({ activeApplicationCount: 1, waitingApplicationCount: 0 }))
    ).toBe("apply");
  });

  it("defaults to find when nothing is pending", () => {
    expect(suggestJobBoardTab(summary())).toBe("find");
  });

  it("resolveJobBoardTab prefers explicit param over suggestion", () => {
    expect(resolveJobBoardTab("find", summary({ followUpCount: 3 }))).toBe("find");
    expect(resolveJobBoardTab(undefined, summary({ queueCount: 2 }))).toBe("review");
  });

  it("builds tab deep links", () => {
    expect(jobBoardTabHref("review")).toBe("/career?tab=review");
    expect(jobBoardTabHref("followup")).toBe("/career?tab=followup");
  });
});
