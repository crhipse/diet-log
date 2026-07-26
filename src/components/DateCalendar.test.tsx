import { fireEvent, render, screen } from "@testing-library/react";
import CalendarSheet from "./CalendarSheet";
import DateCalendar from "./DateCalendar";

describe("DateCalendar", () => {
  it("오늘 이후 날짜는 선택할 수 없고 오늘과 선택일을 표시한다", () => {
    const onSelectDay = vi.fn();
    render(
      <DateCalendar
        selectedDay="2026-07-25"
        todayDay="2026-07-26"
        onSelectDay={onSelectDay}
      />
    );

    expect(
      screen.getByRole("button", {
        name: "2026년 7월 25일, 선택됨"
      })
    ).toHaveAttribute("aria-current", "date");
    expect(
      screen.getByRole("button", {
        name: "2026년 7월 26일, 오늘"
      })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "2026년 7월 27일, 미래 날짜, 선택할 수 없음"
      })
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "2026년 7월 26일, 오늘"
      })
    );
    expect(onSelectDay).toHaveBeenCalledWith("2026-07-26");
  });

  it("식단과 대사량 기록을 서로 다른 접근성 설명으로 표시한다", () => {
    render(
      <DateCalendar
        selectedDay="2026-07-26"
        todayDay="2026-07-26"
        dietRecordDays={["2026-07-24", "2026-07-26"]}
        metabolismRecordDays={["2026-07-25", "2026-07-26"]}
        onSelectDay={() => undefined}
      />
    );

    expect(
      screen.getByRole("button", {
        name: "2026년 7월 24일, 식단 기록 있음"
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "2026년 7월 25일, 대사량 기록 있음"
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "2026년 7월 26일, 오늘, 선택됨, 식단 기록 있음, 대사량 기록 있음"
      })
    ).toBeInTheDocument();
  });

  it("이전 달로 이동할 수 있고 오늘이 속한 달 이후 이동은 막는다", () => {
    render(
      <DateCalendar
        selectedDay="2026-07-26"
        todayDay="2026-07-26"
        onSelectDay={() => undefined}
      />
    );

    expect(
      screen.getByRole("button", { name: "2026년 8월 보기" })
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "2026년 6월 보기" })
    );
    expect(
      screen.getByRole("heading", { name: "2026년 6월" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "2026년 7월 보기" })
    ).toBeEnabled();
  });

  it("하단 메뉴에 가려지지 않도록 달력 시트를 최상위에 표시한다", () => {
    render(
      <CalendarSheet
        selectedDay="2026-07-25"
        todayDay="2026-07-26"
        dietRecordDays={[]}
        metabolismRecordDays={[]}
        onSelectDay={() => undefined}
        onClose={() => undefined}
      />
    );

    expect(
      screen.getByRole("dialog", { name: "날짜 찾기" }).parentElement
        ?.parentElement
    ).toBe(document.body);
    expect(
      screen.getByRole("button", { name: "오늘로 이동" })
    ).toBeInTheDocument();
  });
});
