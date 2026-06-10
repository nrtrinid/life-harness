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

export function scrollChatThreadToEnd(
  ref: RefObject<ScrollView | null> | undefined,
  animated = true
): void {
  requestAnimationFrame(() => {
    ref?.current?.scrollToEnd({ animated });
  });
}
