import { describe, expect, it } from "vitest";

import { parseUniversalCapture } from "./parsing";
import {
  buildRawLabCompanionHandoffPacket,
  buildRawLabIdeaCaptureText,
  buildRawLabMemoryInput,
  isAttachableRawLabOutput,
  RAW_LAB_IDEA_PAYLOAD_MAX
} from "./rawLabOutputAttachment";

describe("rawLabOutputAttachment", () => {
  it("builds idea capture with new idea prefix", () => {
    expect(buildRawLabIdeaCaptureText("foo")).toBe("new idea: foo");
  });

  it("truncates long output with ellipsis and still parses", () => {
    const longOutput = "x".repeat(RAW_LAB_IDEA_PAYLOAD_MAX + 50);
    const captureText = buildRawLabIdeaCaptureText(longOutput);
    expect(captureText).not.toBeNull();
    expect(captureText!.length).toBeLessThan(longOutput.length + 20);
    expect(captureText).toContain("...");

    const parsed = parseUniversalCapture(captureText!);
    expect(parsed?.type).toBe("idea");
  });

  it("rejects empty output", () => {
    expect(isAttachableRawLabOutput("")).toBe(false);
    expect(isAttachableRawLabOutput("   ")).toBe(false);
    expect(buildRawLabIdeaCaptureText("")).toBeNull();
    expect(buildRawLabIdeaCaptureText("  ")).toBeNull();
  });

  it("builds inactive raw-lab memory input", () => {
    const input = buildRawLabMemoryInput("Ship the smallest useful slice first.");
    expect(input).not.toBeNull();
    expect(input!.kind).toBe("pattern");
    expect(input!.isActive).toBe(false);
    expect(input!.tags).toEqual(["raw-lab"]);
    expect(input!.title.length).toBeGreaterThan(0);
    expect(input!.summary.length).toBeGreaterThan(0);
  });

  it("builds companion handoff packet with disclaimer", () => {
    const packet = buildRawLabCompanionHandoffPacket("Try a blunt take on the blocker.");
    expect(packet).toContain("Try a blunt take on the blocker.");
    expect(packet).toContain("From Raw Signal (sandbox). Review before using in Companion.");
  });
});
