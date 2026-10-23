import { EMPTY_NUTRIENTS } from "../constants";
import type { DailyCompletion, DailyMetabolismEntry, FoodRecord, MetabolismProfile } from "../types";
import { aggregateEnergy, dailyEnergyBalances, legacyEnergyData, periodStart } from "./energyBalance";

const now = "2026-10-23T12:00:00.000Z";
export const statisticsProfile: MetabolismProfile = { id: "metabolism", sex: "male", birthDate: "1990-01-01", heightCm: 175,
  jobTemplates: [], exerciseTemplates: [], createdAt: now, updatedAt: now };
export const statsRecord = (date: string, kcal: number | null = 2100): FoodRecord => ({ id: `food-${date}`,
  consumedAt: `${date}T03:00:00.000Z`, timezoneOffsetMinutes: -540, note: "식단", photoIds: [],
  foods: [{ id: "food", name: "식사", amountText: "1일", nutrients: { ...EMPTY_NUTRIENTS, energyKcal: kcal }, source: "manual", userEdited: false }],
  analysis: { status: "not_requested", assumptions: [] }, createdAt: now, updatedAt: now });
export const statsEntry = (date: string, kcal = 2500): DailyMetabolismEntry => ({ id: date, date, weightKg: 70,
  dietComplete: true, metabolismComplete: true, tdeeSnapshot: { kcal, calculatedAt: now, source: "detail" },
  jobActivities: [], exercises: [], createdAt: now, updatedAt: now });
const completion = (id: string): DailyCompletion => ({ id, dietComplete: true, updatedAt: now });

test("식단과 대사량이 모두 완료되고 모든 열량이 알려진 날짜만 계산한다", () => {
  const dates = Array.from({ length: 8 }, (_, index) => `2026-10-${String(index + 12).padStart(2, "0")}`);
  const records = dates.map((date) => statsRecord(date));
  records[3].foods[0].nutrients.energyKcal = null;
  records[4].analysis.status = "pending";
  records[5].analysis.status = "failed";
  const entries = dates.map((date) => statsEntry(date));
  entries[1].metabolismComplete = false;
  entries[2].tdeeSnapshot = undefined;
  const completions = dates.map(completion);
  completions[6].dietComplete = false;
  const result = dailyEnergyBalances(records, entries, completions, 2, "2026-10-18");
  expect(result).toEqual([{ date: "2026-10-12", end: "2026-10-12", intake: 2100, tdee: 2500, balance: -400 }]);
  expect(dailyEnergyBalances([], entries, completions, 2, "2026-10-23")).toEqual([]);
});

test("주간·월간은 완료된 5일 값만 합산하고 누락일을 0이나 평균으로 채우지 않는다", () => {
  const dates = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-16", "2026-10-18"];
  const daily = dailyEnergyBalances(dates.map((date) => statsRecord(date)), dates.map((date) => statsEntry(date)),
    dates.map(completion), 2, "2026-10-23");
  expect(aggregateEnergy(daily, "week")).toEqual([{ date: "2026-10-12", end: "2026-10-18", intake: 10500, tdee: 12500, balance: -2000 }]);
  expect(aggregateEnergy(daily, "month")[0]).toMatchObject({ date: "2026-10-01", end: "2026-10-31", balance: -2000 });
  expect(periodStart("2026-11-01", "week")).toBe("2026-10-26");
});

test("새벽 2시 이전 식단은 전날 수지에 포함한다", () => {
  const record = { ...statsRecord("2026-10-23"), consumedAt: "2026-10-22T16:00:00.000Z" };
  const points = dailyEnergyBalances([record], [statsEntry("2026-10-22")], [completion("2026-10-22")], 2, "2026-10-23");
  expect(points[0].date).toBe("2026-10-22");
});

test("과거 마이그레이션은 기록이 있는 날짜만 완료로 만들고 저장 TDEE를 유지한다", () => {
  const saved = statsEntry("2026-10-22", 2345);
  const old = { ...statsEntry("2026-10-21"), metabolismComplete: undefined, tdeeSnapshot: undefined };
  const records = [statsRecord("2026-10-21"), statsRecord("2026-10-22")];
  const migrated = legacyEnergyData(records, [old, saved, { ...old, date: "2026-10-20", id: "2026-10-20" }], statisticsProfile, 2);
  expect(migrated.dailyCompletions.map((item) => item.id)).toEqual(["2026-10-21", "2026-10-22"]);
  expect(migrated.metabolismEntries[0].metabolismComplete).toBe(true);
  expect(migrated.metabolismEntries[0].tdeeSnapshot!.kcal).toBeGreaterThan(0);
  const again = legacyEnergyData(records, migrated.metabolismEntries, { ...statisticsProfile, heightCm: 190 }, 2);
  expect(again.metabolismEntries.map((item) => item.tdeeSnapshot)).toEqual(migrated.metabolismEntries.map((item) => item.tdeeSnapshot));
  expect(dailyEnergyBalances(records, again.metabolismEntries, again.dailyCompletions, 2, "2026-10-23").find((item) => item.date === saved.date)?.tdee).toBe(2345);
});
