const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

export interface CalendarDay {
  dayKey: string;
  dayOfMonth: number;
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, monthIndex, day);
  return date;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseMonthKey(monthKey: string): {
  year: number;
  month: number;
} {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  if (!match) {
    throw new RangeError(`유효하지 않은 월 키입니다: ${monthKey}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || year > 9999 || month < 1 || month > 12) {
    throw new RangeError(`유효하지 않은 월 키입니다: ${monthKey}`);
  }
  return { year, month };
}

export function assertCalendarDayKey(dayKey: string): void {
  const match = DAY_KEY_PATTERN.exec(dayKey);
  if (!match) {
    throw new RangeError(`유효하지 않은 날짜 키입니다: ${dayKey}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = utcDate(year, month - 1, day);
  if (
    year < 1 ||
    year > 9999 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`유효하지 않은 날짜 키입니다: ${dayKey}`);
  }
}

export function monthKeyFromDay(dayKey: string): string {
  assertCalendarDayKey(dayKey);
  return dayKey.slice(0, 7);
}

export function addCalendarMonths(monthKey: string, amount: number): string {
  if (!Number.isInteger(amount)) {
    throw new RangeError("이동할 개월 수는 정수여야 합니다.");
  }
  const { year, month } = parseMonthKey(monthKey);
  const date = utcDate(year, month - 1 + amount, 1);
  const nextYear = date.getUTCFullYear();
  if (nextYear < 1 || nextYear > 9999) {
    throw new RangeError("표시할 수 있는 달력 범위를 벗어났습니다.");
  }
  return `${String(nextYear).padStart(4, "0")}-${pad2(
    date.getUTCMonth() + 1
  )}`;
}

export function formatCalendarMonth(monthKey: string): string {
  const { year, month } = parseMonthKey(monthKey);
  return `${year}년 ${month}월`;
}

/**
 * Returns six Sunday-first calendar rows. Empty leading/trailing cells are
 * represented by null so only dates in the requested month are selectable.
 */
export function buildCalendarMonth(
  monthKey: string
): Array<CalendarDay | null> {
  const { year, month } = parseMonthKey(monthKey);
  const firstDay = utcDate(year, month - 1, 1);
  const daysInMonth = utcDate(year, month, 0).getUTCDate();
  const cells: Array<CalendarDay | null> = Array.from(
    { length: 42 },
    () => null
  );

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells[firstDay.getUTCDay() + day - 1] = {
      dayKey: `${monthKey}-${pad2(day)}`,
      dayOfMonth: day
    };
  }
  return cells;
}

export function isFutureCalendarDay(
  dayKey: string,
  todayDayKey: string
): boolean {
  assertCalendarDayKey(dayKey);
  assertCalendarDayKey(todayDayKey);
  return dayKey > todayDayKey;
}
