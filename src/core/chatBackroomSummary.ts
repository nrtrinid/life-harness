import type { ReasoningDepth } from "./chatHarnessClient";
import type { ChatHarnessMode } from "./harnessContext";
import type { RawLabBudgetLevel } from "./rawLabContextBudget";
import type { RawLabThreadState } from "./rawLabThreadState";

export type ChatStateChipTone = "default" | "accent" | "warning";

export type ChatStateChipDescriptor = {
  id: string;
  label: string;
  tone?: ChatStateChipTone;
  sectionId?: string;
};

export type BudgetChipInput = {
  level?: RawLabBudgetLevel | null;
  promptOverBudget?: boolean;
  hasCompactionNotice?: boolean;
};

export function formatBudgetChipLabel(input: BudgetChipInput): string {
  if (input.promptOverBudget) {
    return "Budget warning";
  }
  if (input.hasCompactionNotice) {
    return "Compact soon";
  }
  const level = input.level;
  if (!level || level === "none") {
    return "Budget OK";
  }
  if (level === "trim_history") {
    return "Compact soon";
  }
  return "Budget warning";
}

export function countRawLabThreadMemoryItems(threadState: RawLabThreadState): number {
  let count = threadState.pinnedFacts.length;
  count += threadState.decisions.length;
  count += threadState.openLoops.length;
  count += threadState.userSteering.length;
  count += threadState.doNotRepeat.length;
  count += threadState.recurringTopics.length;
  count += threadState.provisionalStances.length;
  count += threadState.selfObservations.length;
  count += threadState.questionsToRevisit.length;
  if (threadState.recentDigest) {
    count += 1;
  }
  if (threadState.currentVibe) {
    count += 1;
  }
  return count;
}

export function countRawLabPersonalityItems(threadState: RawLabThreadState): number {
  const { personality } = threadState;
  let count =
    personality.voiceTraits.length +
    personality.conversationalInstincts.length +
    personality.recurringInterests.length +
    personality.userRespondsWellTo.length +
    personality.userDislikes.length +
    personality.growthNotes.length;
  if (personality.currentStance) {
    count += 1;
  }
  return count;
}

export function formatThreadMemoryChip(count: number): string {
  if (count === 0) {
    return "No thread memory";
  }
  if (count === 1) {
    return "1 thread memory";
  }
  return `${count} thread memories`;
}

export function formatSignalNotesChip(count: number): string {
  if (count === 0) {
    return "No signal notes";
  }
  if (count === 1) {
    return "1 signal note";
  }
  return `${count} signal notes`;
}

export function formatStyleLearningChip(count: number): string {
  if (count === 0) {
    return "Style neutral";
  }
  return "Style learning";
}

export function formatCompanionModeChip(
  mode: ChatHarnessMode,
  reasoningDepth: ReasoningDepth
): string {
  if (reasoningDepth === "deep") {
    return "Mode: Deep";
  }
  if (mode === "operator") {
    return "Mode: Operator";
  }
  if (mode === "reflection") {
    return "Mode: Reflection";
  }
  return "Mode: Fast";
}

export function formatCompanionMemoryChip(activeCount: number, totalCount: number): string {
  if (totalCount === 0) {
    return "No memories";
  }
  return `${activeCount} memories`;
}

export function buildRawLabStateChips(input: {
  threadMemoryCount: number;
  signalNotesCount: number;
  personalityCount: number;
  budget: BudgetChipInput;
}): ChatStateChipDescriptor[] {
  const budgetLabel = formatBudgetChipLabel(input.budget);
  const budgetTone: ChatStateChipTone =
    budgetLabel === "Budget warning"
      ? "warning"
      : budgetLabel === "Compact soon"
        ? "accent"
        : "default";

  return [
    { id: "grounding", label: "Ungrounded", tone: "accent" },
    {
      id: "memory",
      label: formatThreadMemoryChip(input.threadMemoryCount),
      sectionId: "memory"
    },
    {
      id: "signal",
      label: formatSignalNotesChip(input.signalNotesCount),
      sectionId: "signal"
    },
    {
      id: "style",
      label: formatStyleLearningChip(input.personalityCount),
      sectionId: "style"
    },
    {
      id: "budget",
      label: budgetLabel,
      tone: budgetTone,
      sectionId: "budget"
    },
    { id: "backroom", label: "Backroom" }
  ];
}

export function buildCompanionStateChips(input: {
  boardContextReady: boolean;
  activeMemoryCount: number;
  memoryItemCount: number;
  mode: ChatHarnessMode;
  reasoningDepth: ReasoningDepth;
  budget: BudgetChipInput;
}): ChatStateChipDescriptor[] {
  const budgetLabel = formatBudgetChipLabel(input.budget);
  const budgetTone: ChatStateChipTone =
    budgetLabel === "Budget warning"
      ? "warning"
      : budgetLabel === "Compact soon"
        ? "accent"
        : "default";

  return [
    { id: "grounding", label: "Grounded", tone: "accent" },
    {
      id: "board",
      label: input.boardContextReady ? "Board context ready" : "Board context loading",
      sectionId: "board"
    },
    {
      id: "memory",
      label: formatCompanionMemoryChip(input.activeMemoryCount, input.memoryItemCount),
      sectionId: "board"
    },
    {
      id: "mode",
      label: formatCompanionModeChip(input.mode, input.reasoningDepth),
      sectionId: "inspector"
    },
    {
      id: "budget",
      label: budgetLabel,
      tone: budgetTone,
      sectionId: "budget"
    },
    { id: "backroom", label: "Backroom" }
  ];
}
