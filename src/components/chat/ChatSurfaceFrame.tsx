import { type ReactNode } from "react";
import { View } from "react-native";

import { styles } from "../styles";
import type { ChatModeNoteVariant } from "./ChatModeNote";

interface ChatSurfaceFrameProps {
  variant: ChatModeNoteVariant;
  height: number;
  toolbar?: ReactNode;
  children: ReactNode;
  composer: ReactNode;
}

export function ChatSurfaceFrame({
  variant,
  height,
  toolbar,
  children,
  composer
}: ChatSurfaceFrameProps) {
  const frameStyle =
    variant === "companion" ? styles.chatSurfaceFrameCompanion : styles.chatSurfaceFrameRawSignal;

  return (
    <View style={[frameStyle, { height }]}>
      {toolbar ? <View style={styles.chatThreadToolbar}>{toolbar}</View> : null}
      <View style={styles.chatSurfaceThreadSlot}>{children}</View>
      <View style={styles.chatSurfaceComposerSlot}>{composer}</View>
    </View>
  );
}
