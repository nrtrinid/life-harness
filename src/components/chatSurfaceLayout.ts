import type { RefObject } from "react";
import type { ScrollView } from "react-native";

export function getChatSurfaceHeight(
  windowHeight: number,
  variant: "harness" | "rawLab",
  isWideLayout = false
): number {
  if (variant === "rawLab") {
    return Math.round(windowHeight * 0.45);
  }

  return Math.round(windowHeight * (isWideLayout ? 0.55 : 0.5));
}

export function scrollChatThreadToEnd(
  ref: RefObject<ScrollView | null> | undefined,
  animated = true
): void {
  requestAnimationFrame(() => {
    ref?.current?.scrollToEnd({ animated });
  });
}
