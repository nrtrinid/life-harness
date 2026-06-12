import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { styles } from "../../styles";

interface JobBoardAddJobSheetProps {
  onClose: () => void;
  onPasteJob: () => void;
}

export function JobBoardAddJobSheet({ onClose, onPasteJob }: JobBoardAddJobSheetProps) {
  return (
    <View style={[styles.lofiCard, { gap: 12, marginBottom: 12 }]}>
      <Text style={styles.lofiTapeLabel}>Add a job</Text>
      <Text style={styles.bodyText}>
        Review a posting first, or create a board card only when the application is already real.
      </Text>
      <Pressable style={styles.primaryAction} onPress={onPasteJob}>
        <Text style={styles.primaryActionText}>Paste a posting</Text>
      </Pressable>
      <Link href="/career-intake" asChild>
        <Pressable style={styles.secondaryAction} onPress={onClose}>
          <Text style={styles.secondaryActionText}>Start application card directly</Text>
        </Pressable>
      </Link>
      <Pressable style={styles.smallButton} onPress={onClose}>
        <Text style={styles.smallButtonText}>Close</Text>
      </Pressable>
    </View>
  );
}
