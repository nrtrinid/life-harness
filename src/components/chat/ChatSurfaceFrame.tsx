import { type ReactNode } from "react";
import { View } from "react-native";

import { styles } from "../styles";
import type { ChatModeNoteVariant } from "./ChatModeNote";

interface ChatSurfaceFrameProps {
  variant: ChatModeNoteVariant;
  height?: number;
  fill?: boolean;
  toolbar?: ReactNode;
  children: ReactNode;
  composer: ReactNode;
}

export function ChatSurfaceFrame({
  variant,
  height,
  fill = false,
  toolbar,
  children,
  composer
}: ChatSurfaceFrameProps) {
  const frameStyle =
    variant === "companion" ? styles.chatSurfaceFrameCompanion : styles.chatSurfaceFrameRawSignal;
  const sizeStyle = fill ? styles.chatSurfaceFrameFill : height !== undefined ? { height } : undefined;

  return (
    <View style={[frameStyle, sizeStyle]}>
      {toolbar ? <View style={styles.chatThreadToolbar}>{toolbar}</View> : null}
      <View style={styles.chatSurfaceThreadSlot}>{children}</View>
      <View style={styles.chatSurfaceComposerSlot}>{composer}</View>
    </View>
  );
}
