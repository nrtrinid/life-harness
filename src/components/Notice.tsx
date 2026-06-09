import { Text, View } from "react-native";

import { styles } from "./styles";

export type NoticeKind = "success" | "warning" | "error" | "info";

interface NoticeProps {
  kind: NoticeKind;
  message: string;
}

const KIND_STYLES: Record<NoticeKind, object> = {
  success: styles.noticeSuccess,
  warning: styles.noticeWarning,
  error: styles.noticeError,
  info: styles.noticeInfo
};

const KIND_TEXT_STYLES: Record<NoticeKind, object> = {
  success: styles.noticeSuccessText,
  warning: styles.noticeWarningText,
  error: styles.noticeErrorText,
  info: styles.noticeInfoText
};

export function Notice({ kind, message }: NoticeProps) {
  return (
    <View style={[styles.noticeBase, KIND_STYLES[kind]]}>
      <Text style={[styles.noticeText, KIND_TEXT_STYLES[kind]]}>{message}</Text>
    </View>
  );
}

export interface NoticeState {
  kind: NoticeKind;
  message: string;
}
