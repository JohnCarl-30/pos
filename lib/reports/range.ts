import { nextDay, zonedDayStart } from "@/lib/orders/list";

export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "this-month" | "last-month" | "custom";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "custom", label: "Custom" },
];

export type ReportRange = { preset: RangePreset; fromDate: string; toDate: string; from: Date; to: Date; bucket: "hour" | "day"; label: string };

const MAX_DAYS = 366;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function daysInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export function localToday(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function build(preset: RangePreset, fromDate: string, toDate: string, timeZone: string): ReportRange {
  const label =
    preset === "custom"
      ? fromDate === toDate
        ? formatDay(fromDate)
        : `${formatDay(fromDate)} – ${formatDay(toDate)}`
      : (RANGE_PRESETS.find((entry) => entry.value === preset)?.label ?? "Today");
  return {
    preset,
    fromDate,
    toDate,
    from: zonedDayStart(fromDate, timeZone),
    to: zonedDayStart(nextDay(toDate), timeZone),
    bucket: fromDate === toDate ? "hour" : "day",
    label,
  };
}

export function resolveRange(
  params: Record<string, string | string[] | undefined>,
  timeZone: string,
  now: Date,
): { range: ReportRange; error: string | null } {
  const today = localToday(now, timeZone);
  const fallback = build("today", today, today, timeZone);
  switch (first(params.range)) {
    case "yesterday":
      return { range: build("yesterday", addDays(today, -1), addDays(today, -1), timeZone), error: null };
    case "7d":
      return { range: build("7d", addDays(today, -6), today, timeZone), error: null };
    case "30d":
      return { range: build("30d", addDays(today, -29), today, timeZone), error: null };
    case "this-month":
      return { range: build("this-month", `${today.slice(0, 7)}-01`, today, timeZone), error: null };
    case "last-month": {
      const lastOfPrevious = addDays(`${today.slice(0, 7)}-01`, -1);
      return { range: build("last-month", `${lastOfPrevious.slice(0, 7)}-01`, lastOfPrevious, timeZone), error: null };
    }
    case "custom": {
      const from = first(params.from);
      const to = first(params.to);
      if (!isDate(from) || !isDate(to)) return { range: fallback, error: null };
      if (from > to) return { range: fallback, error: "The start date is after the end date." };
      if (daysInclusive(from, to) > MAX_DAYS) return { range: fallback, error: "Pick a range of up to 366 days." };
      return { range: build("custom", from, to, timeZone), error: null };
    }
    default:
      return { range: fallback, error: null };
  }
}
