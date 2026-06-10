import type { ChatHarnessMode, ChatHarnessResponse } from "../../core/harnessContext";

export type ContextExportMode = "full" | "compact";

export type ChatThreadItem =
  | { id: string; kind: "user"; text: string; mode: ChatHarnessMode }
  | {
      id: string;
      kind: "assistant";
      userText: string;
      mode: ChatHarnessMode;
      response: ChatHarnessResponse;
      memorySaved: boolean;
      savedCandidateKeys: string[];
      showMemoryPreview: boolean;
      showConfidence: boolean;
      showMemoryTools: boolean;
    }
  | {
      id: string;
      kind: "error";
      text: string;
      contextMode: ContextExportMode;
      baseUrl: string;
      status?: number;
    };
