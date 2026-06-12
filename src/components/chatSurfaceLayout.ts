import type { RefObject } from "react";
import type { ScrollView } from "react-native";

export function getChatSurfaceHeight(
  windowHeight: number,
  variant: "harness" | "rawLab",
  _isWideLayout = false
): number {
  const ratio = variant === "rawLab" ? 0.62 : 0.62;
  return Math.max(420, Math.round(windowHeight * ratio));
}

export const CHAT_COMPOSER_INPUT_MIN_HEIGHT = 32;
export const CHAT_COMPOSER_INPUT_MAX_HEIGHT_RATIO = 0.28;
export const CHAT_FILL_CHROME_ESTIMATE = 360;

/** Minimum chat pane height when filling the viewport below page chrome. */
export function getChatFillPaneMinHeight(windowHeight: number): number {
  return Math.max(240, windowHeight - CHAT_FILL_CHROME_ESTIMATE);
}

/** Cap multiline composer growth to ~28% of the estimated chat surface (~1/3 of the pane). */
export function getChatComposerInputMaxHeight(windowHeight: number): number {
  const chromeEstimate = 280;
  const surfaceHeight = Math.max(360, windowHeight - chromeEstimate);
  return Math.max(160, Math.round(surfaceHeight * CHAT_COMPOSER_INPUT_MAX_HEIGHT_RATIO));
}

export function scrollChatThreadToEnd(
  ref: RefObject<ScrollView | null> | undefined,
  animated = true
): void {
  const scroll = () => {
    ref?.current?.scrollToEnd({ animated });
  };

  requestAnimationFrame(() => {
    scroll();
    requestAnimationFrame(scroll);
  });
}
