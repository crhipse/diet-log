import type { DailyCompletion, DailyMetabolismEntry, FoodRecord, MetabolismProfile } from "../types";
import { addDays, getRecordDayKey, parseDayKey } from "./date";
import { estimateDailyEnergy } from "./metabolism";
import { completeEnergyTotal } from "./nutrition";

export type StatisticsUnit = "day" | "week" | "month";
export interface EnergyPoint {
  date: string;
  end: string;
  intake: number;
  tdee: number;
  balance: number;
}

export function completeIntake(records: readonly FoodRecord[]): number | null {
  if (records.some((record) => record.analysis.status === "pending" || record.analysis.status === "failed")) return null;
  return completeEnergyTotal(records);
}

/** Only used for data created before explicit completion controls existed. */
export function legacyEnergyData(records: readonly FoodRecord[], entries: readonly DailyMetabolismEntry[],
  profile: MetabolismProfile | null | undefined, dayStartHour: number) {
  const dates = new Set(records.flatMap((record) => {
    try { return [getRecordDayKey(record, dayStartHour)]; } catch { return []; }
  }));
  const now = new Date().toISOString();
  const dailyCompletions: DailyCompletion[] = [...dates].map((id) => ({ id, dietComplete: true, updatedAt: now }));
  const metabolismEntries = entries.map((entry) => {
    if (entry.metabolismComplete !== undefined) return entry;
    const migrated: DailyMetabolismEntry = { ...entry, metabolismComplete: true,
      dietComplete: dates.has(entry.date), exercises: entry.exercises.map((exercise) => ({ ...exercise,
        includedInSteps: exercise.includedInSteps ?? (entry.steps !== undefined &&
          (exercise.category === "walking" || exercise.category === "running")) })) };
    if (profile && !migrated.tdeeSnapshot) {
      try { migrated.tdeeSnapshot = { kcal: estimateDailyEnergy(profile, migrated).tdeeKcal,
        calculatedAt: now, source: "detail" }; } catch { /* Invalid legacy data stays out of statistics. */ }
    }
    return migrated;
  });
  return { dailyCompletions, metabolismEntries };
}

export function dailyEnergyBalances(records: readonly FoodRecord[], entries: readonly DailyMetabolismEntry[],
  completions: readonly DailyCompletion[], dayStartHour: number, today: string): EnergyPoint[] {
  const completed = new Set(completions.filter((item) => item.dietComplete).map((item) => item.id));
  const grouped = new Map<string, FoodRecord[]>();
  for (const record of records) {
    const day = getRecordDayKey(record, dayStartHour);
    const list = grouped.get(day) ?? [];
    list.push(record); grouped.set(day, list);
  }
  return entries.flatMap((entry) => {
    if (entry.date > today || !entry.metabolismComplete || !completed.has(entry.date)) return [];
    const intake = completeIntake(grouped.get(entry.date) ?? []);
    const tdee = entry.tdeeSnapshot?.kcal;
    if (intake === null || tdee === undefined || !Number.isFinite(tdee) || tdee <= 0) return [];
    return [{ date: entry.date, end: entry.date, intake, tdee, balance: intake - tdee }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function periodStart(date: string, unit: StatisticsUnit): string {
  const parsed = parseDayKey(date);
  if (unit === "month") return `${date.slice(0, 7)}-01`;
  if (unit === "week") return addDays(date, -((parsed.getUTCDay() + 6) % 7));
  return date;
}

export function movePeriod(date: string, amount: number, unit: StatisticsUnit): string {
  if (unit !== "month") return addDays(date, amount * (unit === "week" ? 7 : 1));
  const parsed = parseDayKey(periodStart(date, unit));
  parsed.setUTCMonth(parsed.getUTCMonth() + amount);
  return parsed.toISOString().slice(0, 10);
}

export function aggregateEnergy(points: readonly EnergyPoint[], unit: StatisticsUnit): EnergyPoint[] {
  const groups = new Map<string, EnergyPoint>();
  for (const point of points) {
    const start = periodStart(point.date, unit);
    const current = groups.get(start) ?? { date: start, end: addDays(movePeriod(start, 1, unit), -1), intake: 0, tdee: 0, balance: 0 };
    current.intake += point.intake; current.tdee += point.tdee;
    current.balance = current.intake - current.tdee;
    groups.set(start, current);
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
}
