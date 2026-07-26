import {
  AlertCircle,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
  Settings
} from "lucide-react";
import { useState } from "react";
import CalendarSheet from "../components/CalendarSheet";
import {
  formatKcal,
  formatMacroLine,
  formatRecordTime
} from "../lib/format";
import type { DailyTotals, FoodRecord } from "../types";

interface HomeScreenProps {
  selectedDay: string;
  todayDay: string;
  dateLabel: string;
  isToday: boolean;
  records: FoodRecord[];
  totals: DailyTotals;
  photoUrls: Record<string, string>;
  dietRecordDays: readonly string[];
  metabolismRecordDays: readonly string[];
  onPreviousDate: () => void;
  onNextDate: () => void;
  onSelectDate: (dayKey: string) => void;
  onOpenSettings: () => void;
  onAddRecord: () => void;
  onOpenRecord: (id: string) => void;
}

export default function HomeScreen({
  selectedDay,
  todayDay,
  dateLabel,
  isToday,
  records,
  totals,
  photoUrls,
  dietRecordDays,
  metabolismRecordDays,
  onPreviousDate,
  onNextDate,
  onSelectDate,
  onOpenSettings,
  onAddRecord,
  onOpenRecord
}: HomeScreenProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <main className="screen home-screen">
      <header className="topbar">
        <div>
          <p className="eyebrow">나만의 식단 기록</p>
          <h1>식단관리</h1>
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

      <section className="date-navigation" aria-label="기록 날짜 선택">
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
          disabled={isToday}
          onClick={onNextDate}
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </section>

      <section className="daily-summary" aria-label="오늘의 영양 합계">
        <div>
          <span className="daily-summary__value">
            {formatKcal(totals.energyKcal)}
          </span>
          {totals.hasMissingCoreValues && (
            <span className="daily-summary__partial">일부 미입력</span>
          )}
        </div>
        <p>{formatMacroLine(totals)}</p>
      </section>

      <section className="timeline" aria-labelledby="timeline-title">
        <div className="section-heading">
          <h2 id="timeline-title">시간별 기록</h2>
          <span>{records.length}건</span>
        </div>

        {records.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">
              <Camera size={25} aria-hidden="true" />
            </div>
            <h3>아직 기록이 없어요</h3>
            <p>
              사진, 짧은 설명, 또는 직접 입력으로
              <br />첫 식단을 남겨보세요.
            </p>
            <button
              className="secondary-button"
              type="button"
              onClick={onAddRecord}
            >
              <Plus size={18} aria-hidden="true" />
              첫 기록 추가
            </button>
          </div>
        ) : (
          <div className="timeline__list">
            {records.map((record) => (
              <button
                className="record-card"
                type="button"
                key={record.id}
                onClick={() => onOpenRecord(record.id)}
              >
                <RecordThumbnail
                  url={photoUrls[record.id]}
                  count={record.photoIds.length}
                />
                <span className="record-card__content">
                  <span className="record-card__heading">
                    <strong>{recordTitle(record)}</strong>
                    <b>{formatKcal(recordEnergy(record))}</b>
                  </span>
                  <span className="record-card__meta">
                    {formatRecordTime(
                      record.consumedAt,
                      record.timezoneOffsetMinutes
                    )}
                    {record.analysis.status === "pending" && (
                      <span className="status-chip status-chip--pending">
                        <LoaderCircle
                          className="spin"
                          size={13}
                          aria-hidden="true"
                        />
                        분석 중
                      </span>
                    )}
                    {record.analysis.status === "failed" && (
                      <span className="status-chip status-chip--error">
                        <AlertCircle size={13} aria-hidden="true" />
                        재시도 필요
                      </span>
                    )}
                  </span>
                  {record.foods.length > 0 && (
                    <span className="record-card__macros">
                      {formatMacroLine(recordNutrients(record))}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <button
        className="fab"
        type="button"
        aria-label="새 기록 추가"
        onClick={onAddRecord}
      >
        <Plus size={25} aria-hidden="true" />
      </button>

      {calendarOpen && (
        <CalendarSheet
          selectedDay={selectedDay}
          todayDay={todayDay}
          dietRecordDays={dietRecordDays}
          metabolismRecordDays={metabolismRecordDays}
          onSelectDay={onSelectDate}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </main>
  );
}

function RecordThumbnail({
  url,
  count
}: {
  url?: string;
  count: number;
}) {
  if (!url) {
    return (
      <span className="record-card__thumbnail record-card__thumbnail--empty">
        <Camera size={18} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="record-card__thumbnail">
      <img src={url} alt="" />
      {count > 1 && <small>+{count - 1}</small>}
    </span>
  );
}

function recordTitle(record: FoodRecord): string {
  if (record.foods.length > 0) {
    return record.foods.map((food) => food.name).filter(Boolean).join(", ");
  }
  return record.note.trim() || "내용 없는 기록";
}

function recordNutrients(record: FoodRecord) {
  const sum = (key: keyof FoodRecord["foods"][number]["nutrients"]) => {
    const values = record.foods
      .map((food) => food.nutrients[key])
      .filter((value): value is number => value != null);
    return values.length > 0
      ? values.reduce((total, value) => total + value, 0)
      : null;
  };
  return {
    energyKcal: sum("energyKcal"),
    carbsG: sum("carbsG"),
    proteinG: sum("proteinG"),
    fatG: sum("fatG"),
    sugarG: sum("sugarG"),
    sodiumMg: sum("sodiumMg"),
    fiberG: sum("fiberG"),
    saturatedFatG: sum("saturatedFatG")
  };
}

function recordEnergy(record: FoodRecord): number | null {
  return recordNutrients(record).energyKcal;
}
