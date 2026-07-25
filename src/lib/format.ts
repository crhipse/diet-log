import type { Nutrients } from "../types";

const integerFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0
});

const decimalFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1
});

export function formatNumber(
  value: number | null | undefined,
  digits = 0
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return digits > 0
    ? decimalFormatter.format(value)
    : integerFormatter.format(value);
}

export function formatKcal(value: number | null | undefined): string {
  return value == null ? "— kcal" : `${formatNumber(value)} kcal`;
}

export function formatMacroLine(nutrients: Nutrients): string {
  return [
    `탄 ${formatNumber(nutrients.carbsG, 1)}`,
    `단 ${formatNumber(nutrients.proteinG, 1)}`,
    `지 ${formatNumber(nutrients.fatG, 1)}`
  ].join(" · ");
}

export function toDateTimeLocalValue(
  date: Date,
  timezoneOffsetMinutes = date.getTimezoneOffset()
): string {
  const offset = timezoneOffsetMinutes;
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromDateTimeLocalValue(
  value: string,
  timezoneOffsetMinutes?: number
): Date {
  if (!value.trim()) {
    throw new Error("먹은 시각을 확인해주세요.");
  }
  if (timezoneOffsetMinutes == null) {
    const localDate = new Date(value);
    if (Number.isNaN(localDate.getTime())) {
      throw new Error("먹은 시각을 확인해주세요.");
    }
    return localDate;
  }

  if (
    !Number.isInteger(timezoneOffsetMinutes) ||
    timezoneOffsetMinutes < -840 ||
    timezoneOffsetMinutes > 840
  ) {
    throw new Error("기록의 시간대 정보를 확인해주세요.");
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("먹은 시각을 확인해주세요.");
  const [, year, month, day, hour, minute] = match;
  const wallClockAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );
  const date = new Date(wallClockAsUtc + timezoneOffsetMinutes * 60_000);
  if (Number.isNaN(date.getTime())) {
    throw new Error("먹은 시각을 확인해주세요.");
  }
  return date;
}

export function toNullableNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function inputNumber(value: number | null): string {
  return value == null ? "" : String(value);
}

export function formatRecordTime(
  consumedAt: string,
  timezoneOffsetMinutes: number
): string {
  const utc = new Date(consumedAt).getTime();
  const wallClock = new Date(utc - timezoneOffsetMinutes * 60_000);
  return `${String(wallClock.getUTCHours()).padStart(2, "0")}:${String(
    wallClock.getUTCMinutes()
  ).padStart(2, "0")}`;
}

export function formatRecordDateTime(
  consumedAt: string,
  timezoneOffsetMinutes: number
): string {
  const utc = new Date(consumedAt).getTime();
  const wallClock = new Date(utc - timezoneOffsetMinutes * 60_000);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(wallClock);
}
