import { type PropsWithChildren } from "react";
import { Text, View } from "react-native";

import { styles } from "../styles";

export type ChatModeNoteVariant = "companion" | "rawSignal";

interface ChatModeNoteProps extends PropsWithChildren {
  variant: ChatModeNoteVariant;
  message: string;
  detail?: string;
}

export function ChatModeNote({ variant, message, detail, children }: ChatModeNoteProps) {
  const containerStyle =
    variant === "companion" ? styles.chatModeNoteCompanion : styles.chatModeNoteRawSignal;

  return (
    <View style={containerStyle}>
      <Text style={styles.bodyText}>{message}</Text>
      {detail ? <Text style={[styles.helpText, { marginTop: 6 }]}>{detail}</Text> : null}
      {children ? <View style={styles.chatStatusRow}>{children}</View> : null}
    </View>
  );
}
