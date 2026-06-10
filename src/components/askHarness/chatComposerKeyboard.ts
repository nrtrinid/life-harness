export function shouldSubmitOnComposerKeyPress(args: {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}): boolean {
  if (args.isComposing) {
    return false;
  }

  if (args.key !== "Enter") {
    return false;
  }

  if (args.ctrlKey || args.metaKey) {
    return true;
  }

  return !args.shiftKey;
}
