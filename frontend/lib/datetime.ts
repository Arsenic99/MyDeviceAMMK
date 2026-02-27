export const ALMATY_TIME_ZONE = "Asia/Almaty";

type DateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function readPart(parts: Intl.DateTimeFormatPart[], type: string) {
  return parts.find((part) => part.type === type)?.value || "";
}

export function getDateTimePartsAlmaty(value: string | Date): DateParts | null {
  const raw = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(raw.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: ALMATY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(raw);
  return {
    year: readPart(parts, "year"),
    month: readPart(parts, "month"),
    day: readPart(parts, "day"),
    hour: readPart(parts, "hour"),
    minute: readPart(parts, "minute"),
  };
}

export function toDateKeyAlmaty(value: string | Date) {
  const parts = getDateTimePartsAlmaty(value);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDateAlmaty(value: string | Date) {
  const parts = getDateTimePartsAlmaty(value);
  if (!parts) return "—";
  return `${parts.day}.${parts.month}.${parts.year}`;
}

export function formatDateTimeAlmaty(value: string | Date) {
  const parts = getDateTimePartsAlmaty(value);
  if (!parts) return "—";
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}

export function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function formatDateKey(dateKey: string) {
  if (!dateKey) return "—";
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateKey;
  return `${match[3]}.${match[2]}.${match[1]}`;
}
