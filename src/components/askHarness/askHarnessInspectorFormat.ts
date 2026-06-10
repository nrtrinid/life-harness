export function formatGatewayHost(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return "gateway";
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.host || "gateway";
  } catch {
    return trimmed.replace(/^https?:\/\//, "").split("/")[0] || "gateway";
  }
}

export function formatCompactChars(chars: number): string {
  if (chars < 1000) {
    return `${chars}`;
  }

  const thousands = chars / 1000;
  if (thousands < 10) {
    return `${thousands.toFixed(1).replace(/\.0$/, "")}k`;
  }

  return `${Math.round(thousands)}k`;
}
