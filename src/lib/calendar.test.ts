import {
  addCalendarMonths,
  buildCalendarMonth,
  formatCalendarMonth,
  isFutureCalendarDay,
  monthKeyFromDay
} from "./calendar";

describe("월간 달력 날짜 계산", () => {
  it("일요일 시작 6주 달력에서 날짜를 올바른 칸에 배치한다", () => {
    const cells = buildCalendarMonth("2026-07");

    expect(cells).toHaveLength(42);
    expect(cells[3]).toEqual({
      dayKey: "2026-07-01",
      dayOfMonth: 1
    });
    expect(cells[33]).toEqual({
      dayKey: "2026-07-31",
      dayOfMonth: 31
    });
    expect(cells.filter(Boolean)).toHaveLength(31);
  });

  it("윤년 2월과 연도 경계의 월 이동을 처리한다", () => {
    expect(buildCalendarMonth("2028-02").filter(Boolean)).toHaveLength(29);
    expect(addCalendarMonths("2026-12", 1)).toBe("2027-01");
    expect(addCalendarMonths("2026-01", -1)).toBe("2025-12");
  });

  it("논리 날짜 키만 비교해 미래 날짜를 판정한다", () => {
    expect(isFutureCalendarDay("2026-07-26", "2026-07-26")).toBe(false);
    expect(isFutureCalendarDay("2026-07-27", "2026-07-26")).toBe(true);
    expect(isFutureCalendarDay("2026-07-25", "2026-07-26")).toBe(false);
  });

  it("날짜와 월 라벨을 일관된 형식으로 만든다", () => {
    expect(monthKeyFromDay("2026-07-26")).toBe("2026-07");
    expect(formatCalendarMonth("2026-07")).toBe("2026년 7월");
  });

  it("존재하지 않는 날짜와 월은 거부한다", () => {
    expect(() => monthKeyFromDay("2026-02-29")).toThrow(
      "유효하지 않은 날짜 키"
    );
    expect(() => buildCalendarMonth("2026-13")).toThrow(
      "유효하지 않은 월 키"
    );
  });
});
