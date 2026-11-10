import type { DailyCompletion, FoodRecord } from "../types";
import { getRecordDayKey } from "./date";
import { periodStart, type StatisticsUnit } from "./energyBalance";
import { completeNutrientTotal } from "./nutrition";

export type IntakeNutrient = "proteinG" | "fatG";
export type DailyNutrientIntake = { date: string } & Record<IntakeNutrient, number | null>;

export function dailyNutrientIntake(records: readonly FoodRecord[], completions: readonly DailyCompletion[],
  dayStartHour: number, today: string): DailyNutrientIntake[] {
  const completed = new Set(completions.filter((item) => item.dietComplete && item.id <= today).map((item) => item.id));
  const days = new Map<string, FoodRecord[]>();
  for (const record of records) {
    const date = getRecordDayKey(record, dayStartHour);
    if (!completed.has(date)) continue;
    const day = days.get(date) ?? [];
    day.push(record);
    days.set(date, day);
  }
  return [...days].flatMap(([date, day]) => {
    if (day.some(({ analysis }) => analysis.status === "pending" || analysis.status === "failed")) return [];
    return [{ date, proteinG: completeNutrientTotal(day, "proteinG"), fatG: completeNutrientTotal(day, "fatG") }];
  });
}

export function aggregateNutrientIntake(points: readonly DailyNutrientIntake[], nutrient: IntakeNutrient, unit: StatisticsUnit) {
  const periods = new Map<string, number>();
  for (const point of points) {
    const value = point[nutrient];
    if (value === null) continue;
    const date = periodStart(point.date, unit);
    periods.set(date, (periods.get(date) ?? 0) + value);
  }
  return [...periods].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}
