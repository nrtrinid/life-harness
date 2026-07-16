import path from "node:path";

const WINDOWS_CMD_EXTENSIONS = new Set([".cmd", ".bat"]);
const WINDOWS_PS_EXTENSIONS = new Set([".ps1"]);

export function needsWindowsAgentSpawnShim(
  bin: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  if (platform !== "win32") {
    return false;
  }
  const ext = path.extname(bin).toLowerCase();
  return WINDOWS_CMD_EXTENSIONS.has(ext) || WINDOWS_PS_EXTENSIONS.has(ext);
}

export type AgentSpawnSpec = {
  file: string;
  args: string[];
  /**
   * When true, Node must not re-quote argv on Windows (cmd /s /c needs our exact cmdline).
   */
  windowsVerbatimArguments?: boolean;
};

/**
 * Quote a single argument for `cmd.exe /d /s /c` command lines.
 * Always wraps in quotes so metacharacters (`& | < > ^`) cannot split the /c line,
 * doubles embedded quotes, and caret-escapes `%` / `^` so env-var expansion cannot rewrite args.
 */
export function quoteWindowsCmdArg(arg: string): string {
  const escaped = arg
    .replace(/\^/g, "^^")
    .replace(/%/g, "^%")
    .replace(/"/g, '""');
  return `"${escaped}"`;
}

function resolvePowerShellExe(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.windir;
  if (systemRoot) {
    return path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  }
  return "powershell.exe";
}

export function buildAgentSpawnSpec(
  bin: string,
  args: string[],
  platform: NodeJS.Platform = process.platform
): AgentSpawnSpec {
  if (platform !== "win32") {
    return { file: bin, args };
  }

  const ext = path.extname(bin).toLowerCase();

  if (WINDOWS_PS_EXTENSIONS.has(ext)) {
    return {
      file: resolvePowerShellExe(),
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", bin, ...args]
    };
  }

  if (WINDOWS_CMD_EXTENSIONS.has(ext)) {
    // Each arg is quoted; the whole cmdline is wrapped once more so cmd.exe /s /c
    // strips only the outer quotes and leaves per-arg quotes intact.
    // windowsVerbatimArguments prevents Node from escaping those quotes again.
    const cmdline = [bin, ...args].map(quoteWindowsCmdArg).join(" ");
    return {
      file: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", `"${cmdline}"`],
      windowsVerbatimArguments: true
    };
  }

  return { file: bin, args };
}
