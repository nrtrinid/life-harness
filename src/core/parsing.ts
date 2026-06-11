export type UniversalCaptureIntent =
  | { type: "idea"; text: string }
  | { type: "worked_on"; text: string }
  | { type: "followed_up"; text: string }
  | { type: "agent_finished"; text: string }
  | { type: "resume_exported"; text: string }
  | { type: "park"; text: string };

/** @deprecated Use UniversalCaptureIntent */
export type QuickCaptureIntent = UniversalCaptureIntent;

const PREFIX_RULES: Array<{ type: UniversalCaptureIntent["type"]; prefixes: string[] }> = [
  { type: "idea", prefixes: ["new idea:", "idea:"] },
  {
    type: "resume_exported",
    prefixes: ["resume exported for ", "resume exported:", "resume exported "]
  },
  {
    type: "followed_up",
    prefixes: ["followed up with ", "followed up:", "followed up "]
  },
  { type: "agent_finished", prefixes: ["agent finished ", "agent done "] },
  { type: "worked_on", prefixes: ["worked on:", "worked on "] },
  { type: "park", prefixes: ["park:", "park "] }
];

export function parseUniversalCapture(rawText: string): UniversalCaptureIntent | undefined {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();

  for (const rule of PREFIX_RULES) {
    const sortedPrefixes = [...rule.prefixes].sort((left, right) => right.length - left.length);
    for (const prefix of sortedPrefixes) {
      if (!lower.startsWith(prefix)) {
        continue;
      }
      const payload = trimmed.slice(prefix.length).trim();
      if (!payload) {
        return undefined;
      }
      return { type: rule.type, text: payload } as UniversalCaptureIntent;
    }
  }

  return undefined;
}

export function parseQuickCapture(rawText: string): UniversalCaptureIntent | undefined {
  return parseUniversalCapture(rawText);
}

export const CAPTURE_GRAMMAR_HINT =
  "No rule matched. Try: worked on … · followed up with … · agent finished … · new idea: …";
