import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Settings
} from "lucide-react";
import { useState } from "react";
import CalendarSheet from "../components/CalendarSheet";
import GoalDashboard, {
  type GoalBasis,
  type SaveGoalInput
} from "../components/GoalDashboard";
import type { GoalSettings } from "../lib/goalHistory";
import type { TdeeRecommendationChange } from "../lib/goals";
import type { DailyTotals } from "../types";
import "./GoalScreen.css";

export interface GoalScreenProps {
  selectedDay: string;
  todayDay: string;
  dateLabel: string;
  isToday: boolean;
  dietRecordDays: readonly string[];
  metabolismRecordDays: readonly string[];
  totals: DailyTotals;
  totalsByDate: Readonly<Record<string, DailyTotals>>;
  goalSettings?: GoalSettings;
  goalBasis?: GoalBasis;
  recommendationChange?: TdeeRecommendationChange;
  onPreviousDate: () => void;
  onNextDate: () => void;
  onSelectDate: (dayKey: string) => void;
  onSaveGoal: (input: SaveGoalInput) => void | Promise<void>;
  onOpenMetabolism: () => void;
  onOpenSettings: () => void;
}

export default function GoalScreen({
  selectedDay,
  todayDay,
  dateLabel,
  isToday,
  dietRecordDays,
  metabolismRecordDays,
  totals,
  totalsByDate,
  goalSettings,
  goalBasis,
  recommendationChange,
  onPreviousDate,
  onNextDate,
  onSelectDate,
  onSaveGoal,
  onOpenMetabolism,
  onOpenSettings
}: GoalScreenProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const atLatestDay = isToday || selectedDay >= todayDay;

  const selectDate = (dayKey: string) => {
    if (dayKey > todayDay) return false;
    onSelectDate(dayKey);
    return true;
  };

  return (
    <main className="screen goal-screen">
      <header className="topbar">
        <div>
          <p className="eyebrow">섭취 목표와 달성 현황</p>
          <h1>목표</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="설정 열기"
          onClick={onOpenSettings}
        >
          <Settings size={21} aria-hidden="true" />
        </button>
      </header>

      <section className="date-navigation" aria-label="목표 날짜 선택">
        <button
          className="icon-button icon-button--ghost"
          type="button"
          aria-label="이전 날짜"
          onClick={onPreviousDate}
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <button
          className="date-navigation__label"
          type="button"
          aria-label={`${dateLabel}, 달력 열기`}
          onClick={() => setCalendarOpen(true)}
        >
          <span>{dateLabel}</span>
          <small>
            <CalendarDays size={12} aria-hidden="true" />
            달력에서 찾기
          </small>
        </button>
        <button
          className="icon-button icon-button--ghost"
          type="button"
          aria-label="다음 날짜"
          disabled={atLatestDay}
          onClick={() => {
            if (!atLatestDay) onNextDate();
          }}
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </section>

      <GoalDashboard
        selectedDay={selectedDay}
        todayDay={todayDay}
        selectedTotals={totals}
        totalsByDate={totalsByDate}
        goalSettings={goalSettings}
        currentBasis={goalBasis}
        recommendationChange={recommendationChange}
        onSaveGoal={onSaveGoal}
        onOpenMetabolism={onOpenMetabolism}
      />

      {calendarOpen && (
        <CalendarSheet
          selectedDay={selectedDay}
          todayDay={todayDay}
          dietRecordDays={dietRecordDays}
          metabolismRecordDays={metabolismRecordDays}
          onSelectDay={selectDate}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </main>
  );
}
