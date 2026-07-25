import type { FoodRecord } from "../types";
import { addDays, formatDayLabel, getRecordDayKey } from "./date";
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue
} from "./format";

function recordAt(iso: string): FoodRecord {
  return {
    id: "record-1",
    consumedAt: iso,
    timezoneOffsetMinutes: -540,
    note: "",
    photoIds: [],
    foods: [],
    analysis: { status: "not_requested", assumptions: [] },
    createdAt: iso,
    updatedAt: iso
  };
}

describe("새벽 2시 하루 경계", () => {
  it("01:59 기록을 전날로 묶는다", () => {
    expect(
      getRecordDayKey(recordAt("2026-07-25T16:59:00.000Z"), 2)
    ).toBe("2026-07-25");
  });

  it("02:00 기록부터 당일로 묶는다", () => {
    expect(
      getRecordDayKey(recordAt("2026-07-25T17:00:00.000Z"), 2)
    ).toBe("2026-07-26");
  });

  it("달이 바뀌는 날짜 이동도 처리한다", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(formatDayLabel("2026-07-26")).toBe("7월 26일 (일)");
  });

  it("비어 있거나 잘못된 입력 시각을 현재 시각으로 바꾸지 않는다", () => {
    expect(() => fromDateTimeLocalValue("")).toThrow("먹은 시각");
    expect(() => fromDateTimeLocalValue("not-a-date")).toThrow("먹은 시각");
  });

  it("다른 지역에서 편집해도 기록 당시의 벽시계 시각을 보존한다", () => {
    const instant = new Date("2026-07-25T16:30:00.000Z");
    const inputValue = toDateTimeLocalValue(instant, -540);

    expect(inputValue).toBe("2026-07-26T01:30");
    expect(fromDateTimeLocalValue(inputValue, -540).toISOString()).toBe(
      instant.toISOString()
    );
  });
});
