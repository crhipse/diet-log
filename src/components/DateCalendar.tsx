import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  addCalendarMonths,
  buildCalendarMonth,
  formatCalendarMonth,
  isFutureCalendarDay,
  monthKeyFromDay
} from "../lib/calendar";
import "./DateCalendar.css";

const WEEKDAYS = [
  { short: "일", full: "일요일" },
  { short: "월", full: "월요일" },
  { short: "화", full: "화요일" },
  { short: "수", full: "수요일" },
  { short: "목", full: "목요일" },
  { short: "금", full: "금요일" },
  { short: "토", full: "토요일" }
] as const;

export interface DateCalendarProps {
  selectedDay: string;
  todayDay: string;
  dietRecordDays?: readonly string[];
  metabolismRecordDays?: readonly string[];
  onSelectDay: (dayKey: string) => void;
  className?: string;
}

export default function DateCalendar({
  selectedDay,
  todayDay,
  dietRecordDays = [],
  metabolismRecordDays = [],
  onSelectDay,
  className
}: DateCalendarProps) {
  const selectedOrToday = selectedDay <= todayDay ? selectedDay : todayDay;
  const selectedMonth = monthKeyFromDay(selectedOrToday);
  const todayMonth = monthKeyFromDay(todayDay);
  const [visibleMonth, setVisibleMonth] = useState(selectedMonth);

  useEffect(() => {
    setVisibleMonth(selectedMonth);
  }, [selectedMonth]);

  const cells = useMemo(
    () => buildCalendarMonth(visibleMonth),
    [visibleMonth]
  );
  const dietDays = useMemo(() => new Set(dietRecordDays), [dietRecordDays]);
  const metabolismDays = useMemo(
    () => new Set(metabolismRecordDays),
    [metabolismRecordDays]
  );
  const previousMonth = addCalendarMonths(visibleMonth, -1);
  const nextMonth = addCalendarMonths(visibleMonth, 1);
  const nextMonthDisabled = nextMonth > todayMonth;
  const classes = ["date-calendar", className].filter(Boolean).join(" ");

  return (
    <section className={classes} aria-label="날짜 선택 달력">
      <header className="date-calendar__header">
        <button
          className="date-calendar__month-button"
          type="button"
          aria-label={`${formatCalendarMonth(previousMonth)} 보기`}
          onClick={() => setVisibleMonth(previousMonth)}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h2 aria-live="polite">{formatCalendarMonth(visibleMonth)}</h2>
        <button
          className="date-calendar__month-button"
          type="button"
          aria-label={`${formatCalendarMonth(nextMonth)} 보기`}
          disabled={nextMonthDisabled}
          onClick={() => {
            if (!nextMonthDisabled) setVisibleMonth(nextMonth);
          }}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </header>

      <table className="date-calendar__grid">
        <caption className="date-calendar__sr-only">
          {formatCalendarMonth(visibleMonth)} 기록 날짜 선택
        </caption>
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th scope="col" aria-label={weekday.full} key={weekday.full}>
                {weekday.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, weekIndex) => (
            <tr key={weekIndex}>
              {cells
                .slice(weekIndex * 7, weekIndex * 7 + 7)
                .map((cell, weekdayIndex) => {
                  if (!cell) {
                    return (
                      <td
                        className="date-calendar__empty"
                        aria-hidden="true"
                        key={`empty-${weekIndex}-${weekdayIndex}`}
                      />
                    );
                  }

                  const isFuture = isFutureCalendarDay(
                    cell.dayKey,
                    todayDay
                  );
                  const isToday = cell.dayKey === todayDay;
                  const isSelected =
                    !isFuture && cell.dayKey === selectedDay;
                  const hasDiet = dietDays.has(cell.dayKey);
                  const hasMetabolism = metabolismDays.has(cell.dayKey);

                  return (
                    <td key={cell.dayKey}>
                      <button
                        className={[
                          "date-calendar__day",
                          isToday ? "is-today" : "",
                          isSelected ? "is-selected" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        type="button"
                        aria-label={dayAriaLabel(
                          cell.dayKey,
                          isToday,
                          isSelected,
                          isFuture,
                          hasDiet,
                          hasMetabolism
                        )}
                        aria-current={isSelected ? "date" : undefined}
                        disabled={isFuture}
                        onClick={() => {
                          if (!isFuture) onSelectDay(cell.dayKey);
                        }}
                      >
                        <span className="date-calendar__day-number">
                          {cell.dayOfMonth}
                        </span>
                        <span
                          className="date-calendar__markers"
                          aria-hidden="true"
                        >
                          {hasDiet && (
                            <span className="date-calendar__marker date-calendar__marker--diet" />
                          )}
                          {hasMetabolism && (
                            <span className="date-calendar__marker date-calendar__marker--metabolism" />
                          )}
                        </span>
                      </button>
                    </td>
                  );
                })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="date-calendar__legend" aria-label="기록 표시 안내">
        <span>
          <i className="date-calendar__marker date-calendar__marker--diet" />
          식단 기록
        </span>
        <span>
          <i className="date-calendar__marker date-calendar__marker--metabolism" />
          대사량 기록
        </span>
      </div>
    </section>
  );
}

function dayAriaLabel(
  dayKey: string,
  isToday: boolean,
  isSelected: boolean,
  isFuture: boolean,
  hasDiet: boolean,
  hasMetabolism: boolean
): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const details = [
    `${year}년 ${month}월 ${day}일`,
    isToday ? "오늘" : "",
    isSelected ? "선택됨" : "",
    hasDiet ? "식단 기록 있음" : "",
    hasMetabolism ? "대사량 기록 있음" : "",
    isFuture ? "미래 날짜, 선택할 수 없음" : ""
  ].filter(Boolean);
  return details.join(", ");
}
