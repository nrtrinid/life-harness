import { describe, expect, it } from "vitest";

import { shouldSubmitOnComposerKeyPress } from "./chatComposerKeyboard";

describe("shouldSubmitOnComposerKeyPress", () => {
  it("submits on Enter without shift", () => {
    expect(shouldSubmitOnComposerKeyPress({ key: "Enter" })).toBe(true);
    expect(shouldSubmitOnComposerKeyPress({ key: "Enter", shiftKey: false })).toBe(true);
  });

  it("does not submit on Shift+Enter", () => {
    expect(shouldSubmitOnComposerKeyPress({ key: "Enter", shiftKey: true })).toBe(false);
  });

  it("submits on Ctrl+Enter and Cmd+Enter", () => {
    expect(shouldSubmitOnComposerKeyPress({ key: "Enter", shiftKey: true, ctrlKey: true })).toBe(
      true
    );
    expect(shouldSubmitOnComposerKeyPress({ key: "Enter", shiftKey: true, metaKey: true })).toBe(
      true
    );
  });

  it("does not submit while IME composing", () => {
    expect(shouldSubmitOnComposerKeyPress({ key: "Enter", isComposing: true })).toBe(false);
  });

  it("ignores non-Enter keys", () => {
    expect(shouldSubmitOnComposerKeyPress({ key: "a" })).toBe(false);
    expect(shouldSubmitOnComposerKeyPress({ key: "Backspace" })).toBe(false);
  });
});
