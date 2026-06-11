import { Text, View } from "react-native";

import { ChatModeNote } from "../chat/ChatModeNote";

export function HarnessReadCard() {
  return (
    <ChatModeNote
      variant="companion"
      message="Companion is reading your board context. It can suggest, but it will not change the board."
    />
  );
}
