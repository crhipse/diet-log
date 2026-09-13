import { liveQuery } from "dexie";
import { DEFAULT_SETTINGS } from "../constants";
import type { DailyMetabolismEntry, FoodRecord } from "../types";
import type { DietLogDatabase } from "./db";
import { addDays, getDayKey, getRecordDayKey } from "./date";

/** Fixed Korean-time closing rule; logical meal dates still use the user's dayStartHour. */
export function dietCompletionClosesAt(date: string): number {
  return Date.parse(`${addDays(date, 1)}T02:00:00+09:00`);
}

export function automaticDietCompletionDates(records: readonly FoodRecord[], dayStartHour: number, now = new Date()): Set<string> {
  const days = new Set<string>();
  for (const record of records) {
    // A note, photo awaiting analysis or weight-only entry is not an entered meal.
    // Foods with unknown nutrients count as input; their missing numbers remain null.
    if (!record.foods.length) continue;
    const date = getRecordDayKey(record, dayStartHour);
    if (now.getTime() >= dietCompletionClosesAt(date)) days.add(date);
  }
  return days;
}

/** Preserve manual confirmation and every measurement. Automatic flags can be
 * removed if all food is deleted or a date-boundary setting moves its meals away.
 */
export function effectiveDietCompletion(entry: DailyMetabolismEntry, automatic: boolean, now = new Date()): DailyMetabolismEntry {
  if (automatic && !entry.dietComplete) {
    return { ...entry, dietComplete: true, dietCompletedAutomatically: true, updatedAt: now.toISOString() };
  }
  if (!automatic && entry.dietCompletedAutomatically) {
    const next = { ...entry, dietComplete: false, updatedAt: now.toISOString() };
    delete next.dietCompletedAutomatically;
    return next;
  }
  return entry;
}

/** Caller includes records/settings in its transaction to normalize a past-day save atomically. */
export async function completionForSavedEntry(database: DietLogDatabase, entry: DailyMetabolismEntry, now = new Date()): Promise<DailyMetabolismEntry> {
  const [records, settings] = await Promise.all([database.records.toArray(), database.settings.get("app")]);
  const eligible = automaticDietCompletionDates(records, settings?.dayStartHour ?? DEFAULT_SETTINGS.dayStartHour, now);
  return effectiveDietCompletion(entry, eligible.has(entry.date), now);
}

export async function completePastDietEntries(database: DietLogDatabase, now = new Date()): Promise<number> {
  return database.transaction("rw", [database.records, database.settings, database.dailyMetabolismEntries], async () => {
    const [records, settings, entries] = await Promise.all([
      database.records.toArray(), database.settings.get("app"), database.dailyMetabolismEntries.toArray()
    ]);
    const eligible = automaticDietCompletionDates(records, settings?.dayStartHour ?? DEFAULT_SETTINGS.dayStartHour, now);
    const changed = entries.flatMap(entry => {
      const next = effectiveDietCompletion(entry, eligible.has(entry.date), now);
      return next === entry ? [] : [next];
    });
    if (changed.length) await database.dailyMetabolismEntries.bulkPut(changed);
    // Never manufacture a metabolism entry for a food-only date: weight is required.
    return changed.length;
  });
}

export function millisecondsUntilNextDietClose(now = new Date()): number {
  const koreanDate = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayClose = Date.parse(`${koreanDate}T02:00:00+09:00`);
  return (todayClose > now.getTime() ? todayClose : todayClose + 86400000) - now.getTime();
}

/** Open-app timer plus iOS resume/bfcache recovery. Does not assume background execution. */
export function startDietAutoCompletion(database: DietLogDatabase, options: {
  now?: () => Date;
  onCheck?: (now: Date) => void;
  onError?: () => void;
  intervalMs?: number;
} = {}): () => void {
  const now = options.now ?? (() => new Date());
  let active = true;
  let running = false;
  let repeat = false;
  let lastCheckedBoundary: string | undefined;
  let boundaryTimer: ReturnType<typeof setTimeout>;
  const check = async () => {
    if (!active) return;
    if (running) { repeat = true; return; }
    running = true;
    try {
      do {
        repeat = false;
        const checkedAt = now();
        await completePastDietEntries(database, checkedAt);
        const boundary = getDayKey(checkedAt, 2, -540);
        if (active && boundary !== lastCheckedBoundary) options.onCheck?.(checkedAt);
        lastCheckedBoundary = boundary;
      } while (active && repeat);
    } catch { if (active) options.onError?.(); }
    finally { running = false; }
  };
  const scheduleBoundary = () => {
    clearTimeout(boundaryTimer);
    if (!active) return;
    boundaryTimer = setTimeout(() => {
      if (document.visibilityState !== "hidden") void check();
      scheduleBoundary();
    }, millisecondsUntilNextDietClose(now()));
  };
  const resume = () => { if (document.visibilityState !== "hidden") { void check(); scheduleBoundary(); } };
  const subscription = liveQuery(() => database.transaction("r", [database.records, database.settings, database.dailyMetabolismEntries],
    () => Promise.all([database.records.toArray(), database.settings.get("app"), database.dailyMetabolismEntries.toArray()])
  )).subscribe({ next: () => { void check(); }, error: () => { if (active) options.onError?.(); } });
  // The fallback timer handles clock changes without rescanning years of data each minute.
  // Committed input, exact 02:00 and resume events already handle ordinary updates.
  const interval = setInterval(() => {
    if (document.visibilityState !== "hidden" && getDayKey(now(), 2, -540) !== lastCheckedBoundary) void check();
  }, options.intervalMs ?? 60000);
  window.addEventListener("pageshow", resume);
  window.addEventListener("focus", resume);
  document.addEventListener("visibilitychange", resume);
  scheduleBoundary();
  void check();
  return () => {
    active = false;
    clearTimeout(boundaryTimer);
    clearInterval(interval);
    subscription.unsubscribe();
    window.removeEventListener("pageshow", resume);
    window.removeEventListener("focus", resume);
    document.removeEventListener("visibilitychange", resume);
  };
}
