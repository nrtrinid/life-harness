const SECRET_ENV_KEYS = [
  "CURSOR_API_KEY",
  "FEATURE_SPRINT_RUNNER_TOKEN",
  "EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "CODEX_API_KEY"
] as const;

/** Redact known secret env values and common bearer/key patterns from diagnostic text. */
export function redactSecrets(
  text: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  let result = text;

  for (const key of SECRET_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value && value.length >= 4) {
      result = result.split(value).join(`[redacted:${key}]`);
    }
  }

  result = result.replace(
    /(Authorization:\s*Bearer\s+)(\S+)/gi,
    "$1[redacted:bearer]"
  );
  result = result.replace(
    /\b(CURSOR_API_KEY|FEATURE_SPRINT_RUNNER_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|CODEX_API_KEY)\s*=\s*([^\s"']+)/gi,
    "$1=[redacted]"
  );
  result = result.replace(
    /\b(sk-[A-Za-z0-9_-]{8,}|key_[A-Za-z0-9_-]{8,})\b/g,
    "[redacted:key]"
  );

  return result;
}

export function secretConfigured(key: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[key]?.trim());
}
