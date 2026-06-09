import type { LifeArea, LogType } from "./types";

export type QuickCaptureIntent =
  | { kind: "new_idea"; title: string }
  | { kind: "park" }
  | { kind: "log"; type: LogType; area: LifeArea; applied?: boolean };

export function parseQuickCapture(rawText: string): QuickCaptureIntent | undefined {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();

  if (lower.startsWith("new idea:")) {
    const title = trimmed.slice("new idea:".length).trim();
    if (!title) {
      return undefined;
    }
    return { kind: "new_idea", title };
  }

  if (/\bpark\b/i.test(trimmed)) {
    return { kind: "park" };
  }

  if (/(worked on|coded|built)/i.test(trimmed)) {
    return { kind: "log", type: "win", area: "build" };
  }

  if (/(walked|lifted|ran|\bate\b)/i.test(trimmed)) {
    return { kind: "log", type: "win", area: "body" };
  }

  if (/\bapplied\b/i.test(trimmed)) {
    return { kind: "log", type: "win", area: "social_career", applied: true };
  }

  if (/(texted|emailed|follow-up)/i.test(trimmed)) {
    return { kind: "log", type: "win", area: "social_career" };
  }

  if (/(bought|\$|subscription)/i.test(trimmed)) {
    return { kind: "log", type: "leak", area: "stability_vices" };
  }

  return undefined;
}
