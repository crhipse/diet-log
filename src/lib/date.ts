import type { FoodRecord } from "../types";

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export interface RecordDayGroup {
  dayKey: string;
  records: FoodRecord[];
}

function assertValidDate(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`유효하지 않은 날짜입니다: ${String(value)}`);
  }
  return date;
}

function normalizeDayStartHour(dayStartHour: number): number {
  if (!Number.isInteger(dayStartHour) || dayStartHour < 0 || dayStartHour > 23) {
    throw new RangeError("하루 시작 시각은 0부터 23 사이의 정수여야 합니다.");
  }
  return dayStartHour;
}

function normalizeTimezoneOffset(
  date: Date,
  timezoneOffsetMinutes?: number
): number {
  const offset = timezoneOffsetMinutes ?? date.getTimezoneOffset();
  if (!Number.isFinite(offset) || offset < -840 || offset > 840) {
    throw new RangeError("유효하지 않은 시간대 오프셋입니다.");
  }
  return offset;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Converts an instant into the wall-clock value at the supplied
 * `Date#getTimezoneOffset()` offset. UTC getters must be used on the result.
 */
export function toWallClockDate(
  value: string | Date,
  timezoneOffsetMinutes?: number
): Date {
  const date = assertValidDate(value);
  const offset = normalizeTimezoneOffset(date, timezoneOffsetMinutes);
  return new Date(date.getTime() - offset * 60_000);
}

/**
 * Returns the logical diet-log day (YYYY-MM-DD). For a 02:00 day boundary,
 * 01:59 belongs to the previous day.
 */
export function getDayKey(
  value: string | Date,
  dayStartHour = 2,
  timezoneOffsetMinutes?: number
): string {
  const hour = normalizeDayStartHour(dayStartHour);
  const wallClock = toWallClockDate(value, timezoneOffsetMinutes);
  wallClock.setUTCHours(wallClock.getUTCHours() - hour);
  return [
    wallClock.getUTCFullYear(),
    pad2(wallClock.getUTCMonth() + 1),
    pad2(wallClock.getUTCDate())
  ].join("-");
}

export function getRecordDayKey(
  record: Pick<FoodRecord, "consumedAt" | "timezoneOffsetMinutes">,
  dayStartHour = 2
): string {
  return getDayKey(
    record.consumedAt,
    dayStartHour,
    record.timezoneOffsetMinutes
  );
}

export function getTodayDayKey(dayStartHour = 2, now = new Date()): string {
  return getDayKey(now, dayStartHour, now.getTimezoneOffset());
}

export function parseDayKey(dayKey: string): Date {
  const match = DAY_KEY_PATTERN.exec(dayKey);
  if (!match) {
    throw new RangeError(`유효하지 않은 날짜 키입니다: ${dayKey}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`유효하지 않은 날짜 키입니다: ${dayKey}`);
  }
  return date;
}

export function addDays(dayKey: string, amount: number): string {
  if (!Number.isInteger(amount)) {
    throw new RangeError("더할 날짜 수는 정수여야 합니다.");
  }
  const date = parseDayKey(dayKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate())
  ].join("-");
}

export function formatDayLabel(dayKey: string, includeYear = false): string {
  const date = parseDayKey(dayKey);
  const year = includeYear ? `${date.getUTCFullYear()}년 ` : "";
  const weekday = KOREAN_WEEKDAYS[date.getUTCDay()];
  return `${year}${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${weekday})`;
}

export function formatDayKey(dayKey: string): string {
  const date = parseDayKey(dayKey);
  return `${date.getUTCFullYear()}.${pad2(date.getUTCMonth() + 1)}.${pad2(
    date.getUTCDate()
  )}`;
}

export function formatRecordTime(
  record: Pick<FoodRecord, "consumedAt" | "timezoneOffsetMinutes">
): string {
  const wallClock = toWallClockDate(
    record.consumedAt,
    record.timezoneOffsetMinutes
  );
  return `${wallClock.getUTCHours()}시`;
}

/**
 * Makes after-midnight records unambiguous when they are grouped under the
 * previous logical day.
 */
export function formatRecordTimeForDay(
  record: Pick<FoodRecord, "consumedAt" | "timezoneOffsetMinutes">,
  dayStartHour = 2
): string {
  const time = formatRecordTime(record);
  const wallClock = toWallClockDate(
    record.consumedAt,
    record.timezoneOffsetMinutes
  );
  const calendarDay = [
    wallClock.getUTCFullYear(),
    pad2(wallClock.getUTCMonth() + 1),
    pad2(wallClock.getUTCDate())
  ].join("-");
  return calendarDay === getRecordDayKey(record, dayStartHour)
    ? time
    : `다음 날 ${time}`;
}

export function groupRecordsByDay(
  records: readonly FoodRecord[],
  dayStartHour = 2,
  direction: "asc" | "desc" = "desc"
): RecordDayGroup[] {
  normalizeDayStartHour(dayStartHour);
  const groups = new Map<string, FoodRecord[]>();

  for (const record of records) {
    const key = getRecordDayKey(record, dayStartHour);
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }

  const multiplier = direction === "asc" ? 1 : -1;
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right) * multiplier)
    .map(([dayKey, dayRecords]) => ({
      dayKey,
      records: [...dayRecords].sort(
        (left, right) =>
          (Date.parse(left.consumedAt) - Date.parse(right.consumedAt)) *
          multiplier
      )
    }));
}

export function isDayKeyInRange(
  dayKey: string,
  startDayKey?: string,
  endDayKey?: string
): boolean {
  parseDayKey(dayKey);
  if (startDayKey) parseDayKey(startDayKey);
  if (endDayKey) parseDayKey(endDayKey);
  return (
    (!startDayKey || dayKey >= startDayKey) &&
    (!endDayKey || dayKey <= endDayKey)
  );
}
