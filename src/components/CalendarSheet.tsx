import { CalendarDays, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "../lib/useDialogFocus";
import DateCalendar from "./DateCalendar";

interface CalendarSheetProps {
  selectedDay: string;
  todayDay: string;
  dietRecordDays: readonly string[];
  metabolismRecordDays: readonly string[];
  onSelectDay: (dayKey: string) => boolean | void;
  onClose: () => void;
}

export default function CalendarSheet({
  selectedDay,
  todayDay,
  dietRecordDays,
  metabolismRecordDays,
  onSelectDay,
  onClose
}: CalendarSheetProps) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose);

  return createPortal(
    <div
      className="modal-backdrop calendar-sheet-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bottom-sheet calendar-sheet"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-sheet-title"
      >
        <header className="bottom-sheet__header">
          <div className="calendar-sheet__title">
            <CalendarDays size={20} aria-hidden="true" />
            <div>
              <h2 id="calendar-sheet-title">날짜 찾기</h2>
              <p>기록이 있는 날을 한눈에 확인하세요.</p>
            </div>
          </div>
          <button
            className="icon-button icon-button--small"
            type="button"
            aria-label="달력 닫기"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <DateCalendar
          selectedDay={selectedDay}
          todayDay={todayDay}
          dietRecordDays={dietRecordDays}
          metabolismRecordDays={metabolismRecordDays}
          onSelectDay={(dayKey) => {
            if (onSelectDay(dayKey) !== false) onClose();
          }}
        />

        {selectedDay !== todayDay && (
          <button
            className="secondary-button calendar-sheet__today"
            type="button"
            onClick={() => {
              if (onSelectDay(todayDay) !== false) onClose();
            }}
          >
            오늘로 이동
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
