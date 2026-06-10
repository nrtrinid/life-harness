import { Text, View } from "react-native";

import { MvdChecklist } from "../MvdChecklist";
import type { NoticeState } from "../Notice";
import { SalvagePicker } from "../SalvagePicker";
import { styles } from "../styles";
import type { RecoveryVisibility } from "../../core/types";

interface RecoveryPanelProps {
  visibility: RecoveryVisibility;
  onNotice: (notice: NoticeState) => void;
}

export function RecoveryPanel({ visibility, onNotice }: RecoveryPanelProps) {
  return (
    <View style={styles.lofiCard}>
      <Text style={styles.lofiTapeLabel}>Recovery</Text>
      {visibility.salvageReason ? (
        <Text style={styles.bodyText}>{visibility.salvageReason}</Text>
      ) : null}
      {visibility.showMvd ? (
        <Text style={[styles.helpText, { marginTop: 6 }]}>
          Evening check-in — minimum viable day still open.
        </Text>
      ) : null}
      <View style={styles.recoveryRow}>
        {visibility.showMvd ? (
          <View style={styles.recoveryItem}>
            <MvdChecklist onNotice={onNotice} />
          </View>
        ) : null}
        {visibility.showSalvage ? (
          <View style={styles.recoveryItem}>
            <SalvagePicker onNotice={onNotice} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
