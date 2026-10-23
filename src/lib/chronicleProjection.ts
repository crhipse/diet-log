import type { AppSettings, DailyMetabolismEntry, FoodRecord, Nutrients } from "../types";

const nutrientKeys = ["energyKcal", "carbsG", "proteinG", "fatG", "sugarG", "sodiumMg", "fiberG", "saturatedFatG"] as const;
const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id, "en");

/** Explicit allowlist: source backups, photos and AI inputs never enter the sync queue. */
export function projectDietSnapshot(records: FoodRecord[], settings: AppSettings, entries: DailyMetabolismEntry[], exportedAt = new Date().toISOString()) {
  return {
    app: "식단관리" as const,
    schemaVersion: 2 as const,
    exportedAt,
    photosIncluded: false,
    photos: [],
    settings: {
      dayStartHour: settings.dayStartHour,
      goalSettings: {
        targets: (settings.goalSettings?.targets ?? []).map(target => ({
          id: target.id,
          effectiveFrom: target.effectiveFrom,
          createdAt: target.createdAt,
          weightKg: target.weightKg,
          dailyCalories: {
            minKcal: target.dailyCalories.minKcal,
            targetKcal: target.dailyCalories.targetKcal,
            maxKcal: target.dailyCalories.maxKcal
          },
          proteinMinimumG: target.proteinMinimumG
        })).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt) || byId(a, b))
      }
    },
    records: records.map(record => ({
      id: record.id,
      consumedAt: record.consumedAt,
      timezoneOffsetMinutes: record.timezoneOffsetMinutes,
      updatedAt: record.updatedAt,
      foods: record.foods.map(food => ({
        id: food.id,
        nutrients: Object.fromEntries(nutrientKeys.map(key => [key, food.nutrients[key] ?? null])) as unknown as Nutrients
      })).sort(byId)
    })).sort(byId),
    metabolismEntries: entries.map(entry => ({
      id: entry.id,
      date: entry.date,
      weightKg: entry.weightKg,
      // Server applies its clock to automatic closure; keep manual intent unchanged.
      dietComplete: entry.dietComplete && !entry.dietCompletedAutomatically,
      updatedAt: entry.updatedAt
    })).sort(byId)
  };
}

export type DietSyncPayload = ReturnType<typeof projectDietSnapshot>;

/** A note/photo/analysis-only edit changes updatedAt, but does not change scoring input. */
export async function dietSnapshotDigest(payload: DietSyncPayload): Promise<string> {
  const identity = {
    settings: payload.settings,
    records: payload.records.map(({ updatedAt: _updatedAt, ...record }) => record),
    metabolismEntries: payload.metabolismEntries.map(({ updatedAt: _updatedAt, ...entry }) => entry)
  };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(identity)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
