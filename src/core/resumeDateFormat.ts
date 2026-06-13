const MONTH_NAMES: Record<string, string> = {
  january: "January",
  jan: "January",
  february: "February",
  feb: "February",
  march: "March",
  mar: "March",
  april: "April",
  apr: "April",
  may: "May",
  june: "June",
  jun: "June",
  july: "July",
  jul: "July",
  august: "August",
  aug: "August",
  september: "September",
  sept: "September",
  sep: "September",
  october: "October",
  oct: "October",
  november: "November",
  nov: "November",
  december: "December",
  dec: "December"
};

const SEASON_NAMES = new Set(["fall", "spring", "summer", "winter"]);

function capitalizeSeason(text: string): string {
  const match = /^(fall|spring|summer|winter)\b/i.exec(text);
  if (!match) {
    return text;
  }
  const season = match[1];
  return `${season.charAt(0).toUpperCase()}${season.slice(1).toLowerCase()}${text.slice(season.length)}`;
}

function normalizeMonthToken(token: string): string {
  const key = token.toLowerCase();
  return MONTH_NAMES[key] ?? token;
}

function normalizeDatePart(part: string): string {
  const trimmed = part.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^present$/i.test(trimmed)) {
    return "Present";
  }

  const expectedMatch = /^expected\s+(.+)$/i.exec(trimmed);
  if (expectedMatch) {
    return `Expected ${normalizeDatePart(expectedMatch[1])}`;
  }

  const seasonMatch = /^(fall|spring|summer|winter)\s+(\d{4})$/i.exec(trimmed);
  if (seasonMatch) {
    return capitalizeSeason(trimmed);
  }

  const monthYearMatch = /^([A-Za-z]+)\s+(\d{4})$/i.exec(trimmed);
  if (monthYearMatch) {
    const month = normalizeMonthToken(monthYearMatch[1]);
    if (SEASON_NAMES.has(monthYearMatch[1].toLowerCase())) {
      return capitalizeSeason(trimmed);
    }
    return `${month} ${monthYearMatch[2]}`;
  }

  const monthOnlyMatch = /^([A-Za-z]+)$/i.exec(trimmed);
  if (monthOnlyMatch && MONTH_NAMES[monthOnlyMatch[1].toLowerCase()]) {
    return normalizeMonthToken(monthOnlyMatch[1]);
  }

  return trimmed;
}

export function normalizeResumeDate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }

  const parts = trimmed.split(/\s*[-–—]\s*/).filter((part) => part.length > 0);
  if (parts.length <= 1) {
    return normalizeDatePart(trimmed);
  }

  return parts.map(normalizeDatePart).join(" – ");
}
