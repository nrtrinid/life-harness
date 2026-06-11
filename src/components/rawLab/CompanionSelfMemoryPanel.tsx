import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  createCompanionSelfMemory,
  formatCompanionSelfMemorySource,
  groupCompanionSelfMemoriesBySubjectAndKind,
  requiresSensitivityConfirm,
  type CompanionSelfMemory,
  type CompanionSelfMemoryKind,
  type CompanionSelfMemorySubject,
  type CompanionSelfMemorySensitivity
} from "../../core/companionSelfMemory";
import type { RawLabSelfMemoryProposal } from "../../core/rawLabSelfReflectionClient";
import { styles } from "../styles";

const SUBJECT_LABELS: Record<CompanionSelfMemorySubject, string> = {
  companion_self: "Companion self",
  interaction_pattern: "Interaction patterns",
  user_preference: "Your preferences"
};

const KIND_OPTIONS: CompanionSelfMemoryKind[] = [
  "self_observation",
  "learned_preference",
  "anti_pattern",
  "drive",
  "ritual",
  "running_joke",
  "boundary",
  "style_trait"
];

const SUBJECT_PLACEHOLDERS: Record<CompanionSelfMemorySubject, string> = {
  companion_self:
    "Example: I tend to ask for direction after claiming autonomy; I want to learn to choose a direction myself.",
  interaction_pattern:
    "Example: We keep looping creator/GPU mythology then pivot to tools.",
  user_preference:
    "Example: Nick prefers emergent personality over scripted persona."
};

type EditableProposal = RawLabSelfMemoryProposal;

interface CompanionSelfMemoryPanelProps {
  memories: CompanionSelfMemory[];
  proposals: RawLabSelfMemoryProposal[];
  reflecting: boolean;
  embedded?: boolean;
  onMemoriesChange: (memories: CompanionSelfMemory[]) => void;
  onSessionOnly: (proposal: RawLabSelfMemoryProposal, index: number) => void;
  onReflect: () => void;
  onDismissProposal: (index: number) => void;
}

export function countActiveSelfMemories(memories: CompanionSelfMemory[]): number {
  return memories.filter((memory) => memory.isActive).length;
}

function SensitivityPicker({
  value,
  onChange
}: {
  value: CompanionSelfMemorySensitivity;
  onChange: (value: CompanionSelfMemorySensitivity) => void;
}) {
  return (
    <View style={styles.splitRow}>
      {(["S0", "S1", "S2"] as const).map((level) => (
        <Pressable key={level} style={styles.chatBubbleToggle} onPress={() => onChange(level)}>
          <Text style={styles.chatBubbleToggleText}>
            {value === level ? `[${level}]` : level}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function S2ConfirmNote({
  visible,
  onConfirm,
  onCancel
}: {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!visible) {
    return null;
  }
  return (
    <View style={styles.checklist}>
      <Text style={styles.bannerWarningText}>
        S2 may include more personal context. Confirm before saving to persistent self-memory.
      </Text>
      <View style={styles.splitRow}>
        <Pressable style={styles.smallButton} onPress={onConfirm}>
          <Text style={styles.smallButtonText}>Confirm save</Text>
        </Pressable>
        <Pressable style={styles.smallButton} onPress={onCancel}>
          <Text style={styles.smallButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SubjectPicker({
  value,
  onChange
}: {
  value: CompanionSelfMemorySubject;
  onChange: (value: CompanionSelfMemorySubject) => void;
}) {
  return (
    <View style={styles.splitRow}>
      {(["companion_self", "interaction_pattern", "user_preference"] as const).map((subject) => (
        <Pressable key={subject} style={styles.chatBubbleToggle} onPress={() => onChange(subject)}>
          <Text style={styles.chatBubbleToggleText}>
            {value === subject ? `[${SUBJECT_LABELS[subject]}]` : SUBJECT_LABELS[subject]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function KindPicker({
  value,
  onChange
}: {
  value: CompanionSelfMemoryKind;
  onChange: (value: CompanionSelfMemoryKind) => void;
}) {
  return (
    <View style={styles.splitRow}>
      {KIND_OPTIONS.map((kind) => (
        <Pressable key={kind} style={styles.chatBubbleToggle} onPress={() => onChange(kind)}>
          <Text style={styles.chatBubbleToggleText}>
            {value === kind ? `[${kind}]` : kind.replace(/_/g, " ")}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function MemoryRow({
  memory,
  onToggleActive,
  onDelete,
  onEdit
}: {
  memory: CompanionSelfMemory;
  onToggleActive: () => void;
  onDelete: () => void;
  onEdit: (patch: {
    text: string;
    sensitivity: CompanionSelfMemorySensitivity;
    subject: CompanionSelfMemorySubject;
    kind: CompanionSelfMemoryKind;
  }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(memory.text);
  const [draftSensitivity, setDraftSensitivity] = useState(memory.sensitivity);
  const [draftSubject, setDraftSubject] = useState(memory.subject);
  const [draftKind, setDraftKind] = useState(memory.kind);
  const [s2ConfirmPending, setS2ConfirmPending] = useState(false);

  function attemptSave() {
    if (requiresSensitivityConfirm(draftSensitivity) && !s2ConfirmPending) {
      setS2ConfirmPending(true);
      return;
    }
    onEdit({
      text: draftText,
      sensitivity: draftSensitivity,
      subject: draftSubject,
      kind: draftKind
    });
    setS2ConfirmPending(false);
    setEditing(false);
  }

  return (
    <View style={styles.checklist}>
      <Text style={styles.bodyText}>{memory.text}</Text>
      <Text style={styles.helpText}>
        {memory.kind} · {SUBJECT_LABELS[memory.subject]} · {memory.sensitivity} · confidence{" "}
        {Math.round(memory.confidence * 100)}% · {formatCompanionSelfMemorySource(memory.source)}
      </Text>
      <Text style={styles.helpText}>
        {memory.isActive ? "Active" : "Inactive"}
        {memory.lastUsedAt ? ` · last used ${memory.lastUsedAt.slice(0, 10)}` : ""}
      </Text>
      {editing ? (
        <View style={styles.checklist}>
          <SubjectPicker value={draftSubject} onChange={setDraftSubject} />
          <KindPicker value={draftKind} onChange={setDraftKind} />
          <TextInput
            style={styles.captureInput}
            value={draftText}
            onChangeText={setDraftText}
            multiline
          />
          <SensitivityPicker value={draftSensitivity} onChange={setDraftSensitivity} />
          <S2ConfirmNote
            visible={s2ConfirmPending}
            onConfirm={attemptSave}
            onCancel={() => setS2ConfirmPending(false)}
          />
          {!s2ConfirmPending ? (
            <Pressable style={styles.smallButton} onPress={attemptSave}>
              <Text style={styles.smallButtonText}>Save edit</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.splitRow}>
          <Pressable style={styles.smallButton} onPress={onToggleActive}>
            <Text style={styles.smallButtonText}>
              {memory.isActive ? "Deactivate" : "Activate"}
            </Text>
          </Pressable>
          <Pressable style={styles.smallButton} onPress={() => setEditing(true)}>
            <Text style={styles.smallButtonText}>Edit</Text>
          </Pressable>
          <Pressable style={styles.smallButton} onPress={onDelete}>
            <Text style={styles.smallButtonText}>Delete</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ProposalCard({
  proposal,
  index,
  onKeep,
  onEditKeep,
  onSessionOnly,
  onForget
}: {
  proposal: RawLabSelfMemoryProposal;
  index: number;
  onKeep: (proposal: EditableProposal, index: number) => void;
  onEditKeep: (proposal: EditableProposal, index: number) => void;
  onSessionOnly: (proposal: EditableProposal, index: number) => void;
  onForget: (index: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditableProposal>(proposal);
  const [s2ConfirmPending, setS2ConfirmPending] = useState(false);

  function saveEdited() {
    if (requiresSensitivityConfirm(draft.sensitivity) && !s2ConfirmPending) {
      setS2ConfirmPending(true);
      return;
    }
    onEditKeep(draft, index);
    setS2ConfirmPending(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <View style={styles.checklist}>
        <Text style={styles.helpText}>Edit proposal before saving</Text>
        <SubjectPicker
          value={draft.subject}
          onChange={(subject) => setDraft((previous) => ({ ...previous, subject }))}
        />
        <KindPicker
          value={draft.kind as CompanionSelfMemoryKind}
          onChange={(kind) => setDraft((previous) => ({ ...previous, kind }))}
        />
        <TextInput
          style={styles.captureInput}
          value={draft.text}
          onChangeText={(text) => setDraft((previous) => ({ ...previous, text }))}
          multiline
        />
        <SensitivityPicker
          value={draft.sensitivity}
          onChange={(sensitivity) => setDraft((previous) => ({ ...previous, sensitivity }))}
        />
        <S2ConfirmNote
          visible={s2ConfirmPending}
          onConfirm={saveEdited}
          onCancel={() => setS2ConfirmPending(false)}
        />
        <View style={styles.splitRow}>
          {!s2ConfirmPending ? (
            <Pressable style={styles.smallButton} onPress={saveEdited}>
              <Text style={styles.smallButtonText}>Save & keep</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.smallButton} onPress={() => setEditing(false)}>
            <Text style={styles.smallButtonText}>Cancel edit</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.checklist}>
      <Text style={styles.bodyText}>{proposal.text}</Text>
      <Text style={styles.helpText}>
        {proposal.kind} · {SUBJECT_LABELS[proposal.subject]} · {proposal.sensitivity} ·
        confidence {Math.round(proposal.confidence * 100)}%
        {proposal.reason ? ` — ${proposal.reason}` : ""}
      </Text>
      <View style={styles.splitRow}>
        <Pressable style={styles.smallButton} onPress={() => onKeep(proposal, index)}>
          <Text style={styles.smallButtonText}>Keep</Text>
        </Pressable>
        <Pressable style={styles.smallButton} onPress={() => setEditing(true)}>
          <Text style={styles.smallButtonText}>Edit & keep</Text>
        </Pressable>
        <Pressable
          style={styles.smallButton}
          onPress={() => onSessionOnly(proposal, index)}
        >
          <Text style={styles.smallButtonText}>Keep for this chat only</Text>
        </Pressable>
        <Pressable style={styles.smallButton} onPress={() => onForget(index)}>
          <Text style={styles.smallButtonText}>Forget</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MemoryGroups({
  memories,
  onMemoriesChange,
  allMemories,
  onError
}: {
  memories: CompanionSelfMemory[];
  allMemories: CompanionSelfMemory[];
  onMemoriesChange: (memories: CompanionSelfMemory[]) => void;
  onError: (message: string) => void;
}) {
  const grouped = groupCompanionSelfMemoriesBySubjectAndKind(memories);

  return (
    <>
      {grouped.map(({ subject, kindGroups }) => (
        <View key={subject} style={styles.checklist}>
          <Text style={styles.helpText}>{SUBJECT_LABELS[subject]}</Text>
          {kindGroups.map(({ kind, items }) => (
            <View key={`${subject}-${kind}`} style={styles.checklist}>
              <Text style={styles.helpText}>{kind.replace(/_/g, " ")}</Text>
              {items.map((memory) => (
                <MemoryRow
                  key={memory.id}
                  memory={memory}
                  onToggleActive={() =>
                    onMemoriesChange(
                      allMemories.map((item) =>
                        item.id === memory.id ? { ...item, isActive: !item.isActive } : item
                      )
                    )
                  }
                  onDelete={() =>
                    onMemoriesChange(allMemories.filter((item) => item.id !== memory.id))
                  }
                  onEdit={(patch) => {
                    const updated = createCompanionSelfMemory({
                      kind: patch.kind,
                      subject: patch.subject,
                      text: patch.text,
                      source: "manual_edit",
                      confidence: memory.confidence,
                      sensitivity: patch.sensitivity,
                      isActive: memory.isActive
                    });
                    if (!updated.ok) {
                      onError(updated.reason);
                      return;
                    }
                    onMemoriesChange(
                      allMemories.map((item) =>
                        item.id === memory.id
                          ? {
                              ...updated.memory,
                              id: memory.id,
                              createdAt: memory.createdAt,
                              lastUsedAt: memory.lastUsedAt
                            }
                          : item
                      )
                    );
                  }}
                />
              ))}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

export function CompanionSelfMemoryPanel({
  memories,
  proposals,
  reflecting,
  embedded = false,
  onMemoriesChange,
  onSessionOnly,
  onReflect,
  onDismissProposal
}: CompanionSelfMemoryPanelProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [clearConfirmPending, setClearConfirmPending] = useState(false);
  const [addText, setAddText] = useState("");
  const [addKind, setAddKind] = useState<CompanionSelfMemoryKind>("self_observation");
  const [addSubject, setAddSubject] = useState<CompanionSelfMemorySubject>("companion_self");
  const [addSensitivity, setAddSensitivity] = useState<CompanionSelfMemorySensitivity>("S0");
  const [addS2ConfirmPending, setAddS2ConfirmPending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (proposals.length > 0) {
      setCollapsed(false);
    }
  }, [proposals.length]);

  const activeMemories = memories.filter((memory) => memory.isActive);
  const inactiveMemories = memories.filter((memory) => !memory.isActive);

  function saveFromProposal(proposal: EditableProposal, index: number) {
    const created = createCompanionSelfMemory({
      kind: proposal.kind as CompanionSelfMemoryKind,
      subject: proposal.subject,
      text: proposal.text,
      source: "user_approved_proposal",
      confidence: proposal.confidence,
      sensitivity: proposal.sensitivity
    });
    if (!created.ok) {
      setAddError(created.reason);
      return;
    }
    setAddError(null);
    onMemoriesChange([...memories, created.memory]);
    onDismissProposal(index);
  }

  function handleAddManual() {
    if (requiresSensitivityConfirm(addSensitivity) && !addS2ConfirmPending) {
      setAddS2ConfirmPending(true);
      return;
    }
    const created = createCompanionSelfMemory({
      kind: addKind,
      subject: addSubject,
      text: addText,
      source: "manual_user_teaching",
      sensitivity: addSensitivity
    });
    if (!created.ok) {
      setAddError(created.reason);
      return;
    }
    setAddError(null);
    setAddS2ConfirmPending(false);
    onMemoriesChange([...memories, created.memory]);
    setAddText("");
  }

  const panelBody = (
        <>
          {activeMemories.length > 0 ? (
            <MemoryGroups
              memories={activeMemories}
              allMemories={memories}
              onMemoriesChange={onMemoriesChange}
              onError={setAddError}
            />
          ) : (
            <Text style={styles.helpText}>No active self-memories yet.</Text>
          )}

          {inactiveMemories.length > 0 ? (
            <View style={styles.checklist}>
              <Pressable
                style={styles.smallButton}
                onPress={() => setShowInactive((value) => !value)}
              >
                <Text style={styles.smallButtonText}>
                  {showInactive
                    ? `Hide inactive (${inactiveMemories.length})`
                    : `Show inactive (${inactiveMemories.length})`}
                </Text>
              </Pressable>
              {showInactive ? (
                <MemoryGroups
                  memories={inactiveMemories}
                  allMemories={memories}
                  onMemoriesChange={onMemoriesChange}
                  onError={setAddError}
                />
              ) : null}
            </View>
          ) : null}

          <View style={styles.checklist}>
            <Text style={styles.helpText}>Add memory manually</Text>
            <SubjectPicker value={addSubject} onChange={setAddSubject} />
            <KindPicker value={addKind} onChange={setAddKind} />
            <SensitivityPicker value={addSensitivity} onChange={setAddSensitivity} />
            <TextInput
              style={styles.captureInput}
              value={addText}
              onChangeText={setAddText}
              placeholder={SUBJECT_PLACEHOLDERS[addSubject]}
              multiline
            />
            <S2ConfirmNote
              visible={addS2ConfirmPending}
              onConfirm={handleAddManual}
              onCancel={() => setAddS2ConfirmPending(false)}
            />
            {addError ? <Text style={styles.bannerWarningText}>{addError}</Text> : null}
            {!addS2ConfirmPending ? (
              <Pressable style={styles.smallButton} onPress={handleAddManual}>
                <Text style={styles.smallButtonText}>Add memory</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable style={styles.smallButton} onPress={onReflect} disabled={reflecting}>
            <Text style={styles.smallButtonText}>
              {reflecting ? "Reflecting…" : "Reflect on what you learned"}
            </Text>
          </Pressable>

          {proposals.map((proposal, index) => (
            <ProposalCard
              key={`proposal-${index}`}
              proposal={proposal}
              index={index}
              onKeep={saveFromProposal}
              onEditKeep={saveFromProposal}
              onSessionOnly={onSessionOnly}
              onForget={onDismissProposal}
            />
          ))}

          {memories.length > 0 ? (
            <View style={styles.checklist}>
              {clearConfirmPending ? (
                <>
                  <Text style={styles.bannerWarningText}>
                    Delete all persistent self-memories on this device? This cannot be undone.
                  </Text>
                  <View style={styles.splitRow}>
                    <Pressable
                      style={styles.smallButton}
                      onPress={() => {
                        onMemoriesChange([]);
                        setClearConfirmPending(false);
                      }}
                    >
                      <Text style={styles.smallButtonText}>Yes, clear all</Text>
                    </Pressable>
                    <Pressable
                      style={styles.smallButton}
                      onPress={() => setClearConfirmPending(false)}
                    >
                      <Text style={styles.smallButtonText}>Cancel</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable
                  style={styles.smallButton}
                  onPress={() => setClearConfirmPending(true)}
                >
                  <Text style={styles.smallButtonText}>Clear all self-memory</Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </>
  );

  if (embedded) {
    return <View style={styles.checklist}>{panelBody}</View>;
  }

  return (
    <View style={styles.checklist}>
      <View style={styles.bannerWarning}>
        <Text style={styles.bannerWarningText}>
          Saved on this device only — not board memory, not Memory Bank. Editable and deletable.
        </Text>
      </View>

      <Pressable onPress={() => setCollapsed((value) => !value)}>
        <Text style={styles.sectionTitle}>
          Signal notes {collapsed ? "▸" : "▾"}
        </Text>
      </Pressable>
      <Text style={styles.helpText}>
        Persistent notes for this sandbox. Clear chat does not clear this.
      </Text>

      {!collapsed ? panelBody : null}
    </View>
  );
}
