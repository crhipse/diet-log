import { getDayKey } from "./date";
import {
  composeDateTimeLocalValue,
  formatRecordDateTime,
  formatRecordTime,
  fromDateTimeLocalValue
} from "./format";

describe("시 단위 식사 기록", () => {
  it("날짜나 시를 바꿔도 화면에 숨긴 기존 분을 보존한다", () => {
    expect(
      composeDateTimeLocalValue("2026-07-27", "19", "37")
    ).toBe("2026-07-27T19:37");
  });

  it("홈과 상세 시각에는 분을 표시하지 않는다", () => {
    const consumedAt = "2026-07-26T10:37:00.000Z";

    expect(formatRecordTime(consumedAt, -540)).toBe("19시");
    expect(formatRecordDateTime(consumedAt, -540)).toContain("19시");
    expect(formatRecordDateTime(consumedAt, -540)).not.toContain(":37");
  });

  it("숨은 01:59는 새벽 2시 경계에서 전날로 유지한다", () => {
    const localValue = composeDateTimeLocalValue("2026-07-26", "01", "59");
    const consumedAt = fromDateTimeLocalValue(localValue, -540);

    expect(consumedAt.toISOString()).toBe("2026-07-25T16:59:00.000Z");
    expect(getDayKey(consumedAt, 2, -540)).toBe("2026-07-25");
  });

  it("02:00부터는 새벽 2시 경계에서 당일로 묶는다", () => {
    const localValue = composeDateTimeLocalValue("2026-07-26", "02", "00");
    const consumedAt = fromDateTimeLocalValue(localValue, -540);

    expect(consumedAt.toISOString()).toBe("2026-07-25T17:00:00.000Z");
    expect(getDayKey(consumedAt, 2, -540)).toBe("2026-07-26");
  });
});
