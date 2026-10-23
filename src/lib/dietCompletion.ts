import { liveQuery } from "dexie";
import { DEFAULT_SETTINGS } from "../constants";
import type { DailyCompletion, DailyMetabolismEntry, FoodRecord } from "../types";
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

/** Explicit changes after the closing time require a new manual confirmation.
 * Before closing, an ordinary in-progress day may still auto-close at 02:00. */
export function resolveDailyCompletion(date: string, stored: DailyCompletion | undefined,
  automatic: boolean, now = new Date()): DailyCompletion {
  if (stored?.dietComplete && !stored.automatic) return stored;
  if (stored && !stored.dietComplete && Date.parse(stored.updatedAt) >= dietCompletionClosesAt(date)) return stored;
  if (automatic) return stored?.dietComplete && stored.automatic ? stored
    : { id: date, dietComplete: true, automatic: true, updatedAt: now.toISOString() };
  if (stored?.automatic) return { id: date, dietComplete: false, updatedAt: now.toISOString() };
  return stored ?? { id: date, dietComplete: false, updatedAt: now.toISOString() };
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
  const [records, settings, stored] = await Promise.all([database.records.toArray(), database.settings.get("app"), database.dailyCompletions.get(entry.date)]);
  const eligible = automaticDietCompletionDates(records, settings?.dayStartHour ?? DEFAULT_SETTINGS.dayStartHour, now);
  const manualLegacyConfirmation = entry.metabolismComplete === undefined && entry.dietComplete && !entry.dietCompletedAutomatically;
  const fallback = manualLegacyConfirmation ? { id: entry.date, dietComplete: true, updatedAt: now.toISOString() }
    : stored ?? (entry.dietComplete ? { id: entry.date, dietComplete: true,
    automatic: entry.dietCompletedAutomatically, updatedAt: entry.updatedAt } : undefined);
  const completion = resolveDailyCompletion(entry.date, fallback, eligible.has(entry.date), now);
  if (!stored || stored.dietComplete !== completion.dietComplete || stored.automatic !== completion.automatic) {
    await database.dailyCompletions.put(completion);
  }
  const next = { ...entry, dietComplete: completion.dietComplete };
  if (completion.automatic) next.dietCompletedAutomatically = true;
  else delete next.dietCompletedAutomatically;
  return next;
}

export async function completePastDietEntries(database: DietLogDatabase, now = new Date()): Promise<number> {
  return database.transaction("rw", [database.records, database.settings, database.dailyMetabolismEntries, database.dailyCompletions], async () => {
    const [records, settings, entries, storedCompletions] = await Promise.all([
      database.records.toArray(), database.settings.get("app"), database.dailyMetabolismEntries.toArray(), database.dailyCompletions.toArray()
    ]);
    const eligible = automaticDietCompletionDates(records, settings?.dayStartHour ?? DEFAULT_SETTINGS.dayStartHour, now);
    const completions = new Map(storedCompletions.map((item) => [item.id, item]));
    const byDate = new Map(entries.map((entry) => [entry.date, entry]));
    for (const date of new Set([...eligible, ...completions.keys(), ...byDate.keys()])) {
      const stored = completions.get(date);
      const entry = byDate.get(date);
      const fallback = stored ?? (entry?.dietComplete ? { id: date, dietComplete: true,
        automatic: entry.dietCompletedAutomatically, updatedAt: entry.updatedAt } : undefined);
      const next = resolveDailyCompletion(date, fallback, eligible.has(date), now);
      if ((!stored && next.dietComplete) || (stored && (next.dietComplete !== stored.dietComplete || next.automatic !== stored.automatic))) {
        await database.dailyCompletions.put(next);
      }
      completions.set(date, next);
    }
    const changed = entries.flatMap(entry => {
      const completion = completions.get(entry.date)!;
      if (entry.dietComplete === completion.dietComplete && Boolean(entry.dietCompletedAutomatically) === Boolean(completion.automatic)) return [];
      const next = { ...entry, dietComplete: completion.dietComplete, updatedAt: now.toISOString() };
      if (completion.automatic) next.dietCompletedAutomatically = true;
      else delete next.dietCompletedAutomatically;
      return [next];
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
  const subscription = liveQuery(() => database.transaction("r", [database.records, database.settings, database.dailyMetabolismEntries, database.dailyCompletions],
    () => Promise.all([database.records.toArray(), database.settings.get("app"), database.dailyMetabolismEntries.toArray(), database.dailyCompletions.toArray()])
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
