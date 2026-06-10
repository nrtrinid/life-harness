import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Notice } from "../Notice";
import { styles } from "../styles";
import {
  ANDROID_EMULATOR_CHAT_HARNESS_URL,
  DEFAULT_CHAT_HARNESS_URL,
  PHYSICAL_DEVICE_URL_HINT
} from "../../core/chatHarnessClient";
import {
  DEFAULT_GATEWAY_MAX_INPUT_CHARS,
  type ChatHarnessMode
} from "../../core/harnessContext";
import type { HarnessChatSummary, HarnessMemoryItem, SensitivityLevel } from "../../core/types";
import type { ReasoningDepth } from "../../core/chatHarnessClient";
import { formatCompactChars, formatGatewayHost } from "./askHarnessInspectorFormat";
import { InspectorSection } from "./InspectorSection";
import type { ContextExportMode } from "./types";

const MODES: ChatHarnessMode[] = ["general", "operator", "reflection", "builder"];
const SENSITIVITIES: SensitivityLevel[] = ["S0", "S1", "S2", "S3"];

const REASONING_DEPTHS: ReasoningDepth[] = ["fast", "deliberate", "deep"];

interface AskHarnessAdvancedPanelProps {
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  mode: ChatHarnessMode;
  onModeChange: (mode: ChatHarnessMode) => void;
  sensitivity: SensitivityLevel;
  onSensitivityChange: (value: SensitivityLevel) => void;
  reasoningDepth: ReasoningDepth;
  onReasoningDepthChange: (value: ReasoningDepth) => void;
  contextMode: ContextExportMode;
  onContextModeChange: (mode: ContextExportMode) => void;
  selectedJsonChars: number;
  selectedPromptChars: number;
  fullChars: number;
  compactChars: number;
  fullPromptChars: number;
  compactPromptChars: number;
  promptOverBudget: boolean;
  qualitySummary: string;
  qualityOpen: boolean;
  onQualityOpenToggle: () => void;
  previewOpen: boolean;
  onPreviewOpenToggle: () => void;
  previewText: string;
  recentMemories: HarnessChatSummary[];
  onDeleteChatSummary: (id: string) => void;
  recentMemoryBankItems: HarnessMemoryItem[];
  onToggleMemoryItemActive: (id: string) => void;
  onDeleteMemoryItem: (id: string) => void;
}

export function AskHarnessAdvancedPanel({
  baseUrl,
  onBaseUrlChange,
  mode,
  onModeChange,
  sensitivity,
  onSensitivityChange,
  reasoningDepth,
  onReasoningDepthChange,
  contextMode,
  onContextModeChange,
  selectedJsonChars,
  selectedPromptChars,
  fullChars,
  compactChars,
  fullPromptChars,
  compactPromptChars,
  promptOverBudget,
  qualitySummary,
  qualityOpen,
  onQualityOpenToggle,
  previewOpen,
  onPreviewOpenToggle,
  previewText,
  recentMemories,
  onDeleteChatSummary,
  recentMemoryBankItems,
  onToggleMemoryItemActive,
  onDeleteMemoryItem
}: AskHarnessAdvancedPanelProps) {
  const hasMemory = recentMemories.length > 0 || recentMemoryBankItems.length > 0;
  const statusLine = `${formatGatewayHost(baseUrl)} · ${contextMode === "compact" ? "Compact" : "Full"} · ${formatCompactChars(selectedJsonChars)} context`;

  return (
    <View style={styles.chatInspectorColumn}>
      <Text style={styles.chatInspectorHeader}>Inspector</Text>
      <Text style={styles.chatInspectorStatusLine}>{statusLine}</Text>

      <InspectorSection title="Gateway" defaultOpen>
        <TextInput
          value={baseUrl}
          onChangeText={onBaseUrlChange}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={DEFAULT_CHAT_HARNESS_URL}
          placeholderTextColor="rgba(212,216,200,0.3)"
          style={styles.captureInput}
        />
        <Text style={styles.helpText} numberOfLines={2}>
          Desktop {DEFAULT_CHAT_HARNESS_URL} · Emulator {ANDROID_EMULATOR_CHAT_HARNESS_URL}.{" "}
          {PHYSICAL_DEVICE_URL_HINT}
        </Text>
      </InspectorSection>

      <InspectorSection title="Mode and sensitivity" defaultOpen>
        <Text style={styles.chatInspectorSectionTitle}>Mode</Text>
        <View style={styles.splitRow}>
          {MODES.map((option) => (
            <Pressable
              key={option}
              style={mode === option ? styles.chatMetaPillAccent : styles.chatQuickChip}
              onPress={() => onModeChange(option)}
            >
              <Text style={mode === option ? styles.chatMetaPillTextAccent : styles.chatQuickChipText}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.chatInspectorSectionTitle}>Sensitivity</Text>
        <View style={styles.splitRow}>
          {SENSITIVITIES.map((option) => (
            <Pressable
              key={option}
              style={sensitivity === option ? styles.chatMetaPillAccent : styles.chatQuickChip}
              onPress={() => onSensitivityChange(option)}
            >
              <Text
                style={sensitivity === option ? styles.chatMetaPillTextAccent : styles.chatQuickChipText}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.chatInspectorSectionTitle}>Reasoning depth</Text>
        <View style={styles.splitRow}>
          {REASONING_DEPTHS.map((option) => (
            <Pressable
              key={option}
              style={reasoningDepth === option ? styles.chatMetaPillAccent : styles.chatQuickChip}
              onPress={() => onReasoningDepthChange(option)}
            >
              <Text
                style={
                  reasoningDepth === option ? styles.chatMetaPillTextAccent : styles.chatQuickChipText
                }
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
        {reasoningDepth === "deep" ? (
          <Text style={styles.helpText}>Deep mode may take longer on local OpenVINO.</Text>
        ) : null}
      </InspectorSection>

      <InspectorSection title="Context export" defaultOpen>
        <Text style={styles.helpText}>
          ~{selectedJsonChars} json · ~{selectedPromptChars} prompt (Full ~{fullChars}/{fullPromptChars} ·
          Compact ~{compactChars}/{compactPromptChars})
        </Text>
        {promptOverBudget ? (
          <Notice
            kind="error"
            message={`Selected export exceeds gateway prompt budget (${DEFAULT_GATEWAY_MAX_INPUT_CHARS}). Switch to Compact context or shorten your message.`}
          />
        ) : null}
        <View style={styles.splitRow}>
          {(["full", "compact"] as const).map((option) => (
            <Pressable
              key={option}
              style={contextMode === option ? styles.chatMetaPillAccent : styles.chatQuickChip}
              onPress={() => onContextModeChange(option)}
            >
              <Text style={contextMode === option ? styles.chatMetaPillTextAccent : styles.chatQuickChipText}>
                {option === "full" ? "Full" : "Compact"}
              </Text>
            </Pressable>
          ))}
        </View>
        {compactChars < fullChars ? (
          <Text style={styles.helpText}>
            Compact strips resume bank cards first for OpenVINO prompt headroom.
          </Text>
        ) : null}
      </InspectorSection>

      <InspectorSection
        title="Context quality"
        defaultOpen={false}
        open={qualityOpen}
        onToggle={onQualityOpenToggle}
      >
        <Text style={styles.helpText}>{qualitySummary}</Text>
      </InspectorSection>

      <InspectorSection
        title="JSON preview"
        defaultOpen={false}
        open={previewOpen}
        onToggle={onPreviewOpenToggle}
      >
        {previewOpen ? (
          <ScrollView horizontal>
            <Text style={[styles.helpText, { fontFamily: "monospace" }]}>{previewText}</Text>
          </ScrollView>
        ) : null}
      </InspectorSection>

      {hasMemory ? (
        <InspectorSection title="Memory" defaultOpen={false}>
          {recentMemoryBankItems.length > 0 ? (
            <View style={styles.checklist}>
              <Text style={styles.chatInspectorSectionTitle}>Memory Bank</Text>
              {recentMemoryBankItems.map((item) => (
                <View key={item.id} style={styles.checklist}>
                  <Text style={styles.helpText}>
                    {item.kind} · {item.title} · {item.isActive ? "Active" : "Inactive"}
                  </Text>
                  <Text style={styles.helpText}>{item.summary}</Text>
                  <View style={styles.splitRow}>
                    <Pressable style={styles.smallButton} onPress={() => onToggleMemoryItemActive(item.id)}>
                      <Text style={styles.smallButtonText}>
                        {item.isActive ? "Inactive" : "Active"}
                      </Text>
                    </Pressable>
                    <Pressable style={styles.smallButton} onPress={() => onDeleteMemoryItem(item.id)}>
                      <Text style={styles.smallButtonText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {recentMemories.length > 0 ? (
            <View style={styles.checklist}>
              <Text style={styles.chatInspectorSectionTitle}>Chat summaries</Text>
              {recentMemories.map((item) => (
                <View key={item.id} style={styles.checklist}>
                  <Text style={styles.helpText}>
                    {item.mode} · {item.createdAt.slice(0, 16).replace("T", " ")}
                  </Text>
                  <Text style={styles.helpText}>{item.assistantSummary}</Text>
                  <Pressable style={styles.smallButton} onPress={() => onDeleteChatSummary(item.id)}>
                    <Text style={styles.smallButtonText}>Delete</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </InspectorSection>
      ) : null}
    </View>
  );
}
