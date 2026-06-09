export function createId(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now()}-${suffix}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
