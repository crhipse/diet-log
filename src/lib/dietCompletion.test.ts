import { DEFAULT_SETTINGS, EMPTY_NUTRIENTS } from "../constants";
import type { DailyMetabolismEntry, FoodRecord, MetabolismProfile } from "../types";
import { db, DietLogDatabase, saveDailyMetabolismEntry, saveMetabolismProfileAndEntry } from "./db";
import { automaticDietCompletionDates, completePastDietEntries, dietCompletionClosesAt, effectiveDietCompletion, millisecondsUntilNextDietClose, startDietAutoCompletion } from "./dietCompletion";
import { createBackup, importBackup, parseBackup } from "./export";
import { dietSnapshotDigest, projectDietSnapshot } from "./chronicleProjection";

const before = new Date("2026-09-13T01:59:59.999+09:00");
const close = new Date("2026-09-13T02:00:00.000+09:00");
const recordedAt = "2026-09-12T12:00:00+09:00";
function meal(date = "2026-09-12", foods = true): FoodRecord {
  return {
    id: `meal-${date}`, consumedAt: `${date}T12:00:00+09:00`, timezoneOffsetMinutes: -540,
    note: "keep note", photoIds: [],
    foods: foods ? [{ id: `food-${date}`, name: "keep food", amountText: "keep amount", nutrients: { ...EMPTY_NUTRIENTS }, source: "manual", userEdited: true }] : [],
    analysis: { status: "not_requested", assumptions: [] }, createdAt: recordedAt, updatedAt: recordedAt
  };
}
function day(date = "2026-09-12", extra: Partial<DailyMetabolismEntry> = {}): DailyMetabolismEntry {
  return { id: date, date, weightKg: 81.2, steps: 2500, bodyFatPercent: 20, dietComplete: false, jobActivities: [], exercises: [], createdAt: recordedAt, updatedAt: recordedAt, ...extra };
}
const profile: MetabolismProfile = { id: "metabolism", sex: "male", birthDate: "1990-01-01", heightCm: 180, jobTemplates: [], exerciseTemplates: [], createdAt: recordedAt, updatedAt: recordedAt };

describe("Korean 02:00 completion rule", () => {
  it("closes only at the next day's exact 02:00 regardless of runtime timezone", () => {
    expect(dietCompletionClosesAt("2026-09-12")).toBe(Date.parse("2026-09-12T17:00:00Z"));
    expect(automaticDietCompletionDates([meal()], 2, before).size).toBe(0);
    expect([...automaticDietCompletionDates([meal()], 2, close)]).toEqual(["2026-09-12"]);
    expect(automaticDietCompletionDates([meal("2026-09-13")], 2, close).size).toBe(0);
    expect(millisecondsUntilNextDietClose(before)).toBe(1);
    expect(millisecondsUntilNextDietClose(close)).toBe(86400000);
  });
  it("handles month/year/leap-day boundaries", () => {
    expect(new Date(dietCompletionClosesAt("2026-12-31")).toISOString()).toBe("2026-12-31T17:00:00.000Z");
    expect(new Date(dietCompletionClosesAt("2028-02-29")).toISOString()).toBe("2028-02-29T17:00:00.000Z");
    expect(() => dietCompletionClosesAt("2026-02-29")).toThrow();
  });
  it("keeps original meal dayStartHour and recorded timezone instead of regrouping to the completion clock", () => {
    const early = { ...meal(), consumedAt: "2026-09-13T03:00:00+09:00" };
    const current = new Date("2026-09-13T03:01:00+09:00");
    expect([...automaticDietCompletionDates([early], 4, current)]).toEqual(["2026-09-12"]);
    expect(automaticDietCompletionDates([early], 2, current).size).toBe(0);
    const overseas = { ...meal(), consumedAt: "2026-09-13T00:30:00Z", timezoneOffsetMinutes: 240 };
    expect([...automaticDietCompletionDates([overseas], 2, current)]).toEqual(["2026-09-12"]);
  });
  it("requires entered food, while retaining unknown nutrient values", () => {
    expect(automaticDietCompletionDates([meal("2026-09-12", false)], 2, close).size).toBe(0);
    expect(automaticDietCompletionDates([], 2, close).size).toBe(0);
    expect(automaticDietCompletionDates([meal()], 2, close).has("2026-09-12")).toBe(true);
    expect(meal().foods[0].nutrients.energyKcal).toBeNull();
  });
  it("preserves manual confirmation and only removes automatic flags when the day is no longer eligible", () => {
    const manual = day(undefined, { dietComplete: true });
    expect(effectiveDietCompletion(manual, true, close)).toBe(manual);
    expect(effectiveDietCompletion(manual, false, close)).toBe(manual);
    const auto = effectiveDietCompletion(day(), true, close);
    expect(auto.dietComplete).toBe(true); expect(auto.dietCompletedAutomatically).toBe(true);
    expect(effectiveDietCompletion(auto, true, new Date(close.getTime() + 86400000))).toBe(auto);
    const cleared = effectiveDietCompletion(auto, false, close);
    expect(cleared.dietComplete).toBe(false); expect(cleared.dietCompletedAutomatically).toBeUndefined();
  });
});

describe("automatic source completion storage", () => {
  let database: DietLogDatabase;
  const stops: (() => void)[] = [];
  beforeEach(async () => { database = new DietLogDatabase(`diet-completion-${crypto.randomUUID()}`); await database.open(); });
  afterEach(async () => { stops.splice(0).forEach(stop => stop()); await database.delete(); });
  it("updates existing rows once, preserves all original measurements, and creates no weight/food rows", async () => {
    const meals = [meal(), meal("2026-09-11")];
    await database.records.bulkPut(meals);
    await database.dailyMetabolismEntries.bulkPut([day(), day("2026-09-10")]);
    expect(await completePastDietEntries(database, before)).toBe(0);
    expect(await completePastDietEntries(database, close)).toBe(1);
    const saved = await database.dailyMetabolismEntries.get("2026-09-12");
    expect(saved).toEqual({ ...day(), dietComplete: true, dietCompletedAutomatically: true, updatedAt: close.toISOString() });
    expect(await database.dailyMetabolismEntries.get("2026-09-11")).toBeUndefined();
    expect((await database.dailyMetabolismEntries.get("2026-09-10"))?.dietComplete).toBe(false);
    expect(await database.dailyMetabolismEntries.count()).toBe(2);
    expect(await database.records.toArray()).toEqual([...meals].sort((a, b) => a.id.localeCompare(b.id)));
    expect(await completePastDietEntries(database, new Date(close.getTime() + 86400000))).toBe(0);
    expect((await database.dailyMetabolismEntries.get("2026-09-12"))?.updatedAt).toBe(close.toISOString());
  });
  it("clears automatic-only completion after the last food is deleted", async () => {
    await database.records.put(meal()); await database.dailyMetabolismEntries.put(day());
    await completePastDietEntries(database, close); await database.records.clear();
    expect(await completePastDietEntries(database, close)).toBe(1);
    expect((await database.dailyMetabolismEntries.get("2026-09-12"))?.dietComplete).toBe(false);
    expect((await database.dailyMetabolismEntries.get("2026-09-12"))?.weightKg).toBe(81.2);
  });
  it("does not turn source automatic completion into a manual sync confirmation or duplicate numeric digest", async () => {
    const original = projectDietSnapshot([meal()], DEFAULT_SETTINGS, [day()]);
    const automatic = projectDietSnapshot([meal()], DEFAULT_SETTINGS, [effectiveDietCompletion(day(), true, close)]);
    expect(automatic.metabolismEntries[0].dietComplete).toBe(false);
    expect(automatic.metabolismEntries[0]).not.toHaveProperty("dietCompletedAutomatically");
    expect(await dietSnapshotDigest(automatic)).toBe(await dietSnapshotDigest(original));
    const manual = projectDietSnapshot([meal()], DEFAULT_SETTINGS, [day(undefined, { dietComplete: true })]);
    expect(manual.metabolismEntries[0].dietComplete).toBe(true);
  });
  it("catches up when resumed through pageshow and when restarted after being closed", async () => {
    let clock = before;
    await database.records.put(meal()); await database.dailyMetabolismEntries.put(day());
    const checked = vi.fn();
    const stop = startDietAutoCompletion(database, { now: () => clock, onCheck: checked }); stops.push(stop);
    await vi.waitFor(() => expect(checked).toHaveBeenCalled());
    expect((await database.dailyMetabolismEntries.get("2026-09-12"))?.dietComplete).toBe(false);
    clock = close; window.dispatchEvent(new Event("pageshow"));
    await vi.waitFor(async () => expect((await database.dailyMetabolismEntries.get("2026-09-12"))?.dietComplete).toBe(true));
    stop();
    await database.records.put(meal("2026-09-11")); await database.dailyMetabolismEntries.put(day("2026-09-11"));
    stops.push(startDietAutoCompletion(database, { now: () => clock }));
    await vi.waitFor(async () => expect((await database.dailyMetabolismEntries.get("2026-09-11"))?.dietComplete).toBe(true));
  });
  it("checks the open-app interval and committed backdated food changes", async () => {
    let clock = new Date("2026-09-12T23:00:00+09:00");
    await database.records.put(meal()); await database.dailyMetabolismEntries.put(day());
    stops.push(startDietAutoCompletion(database, { now: () => clock, intervalMs: 10 }));
    clock = close;
    await vi.waitFor(async () => expect((await database.dailyMetabolismEntries.get("2026-09-12"))?.dietComplete).toBe(true));
    await database.dailyMetabolismEntries.put(day("2026-09-11"));
    expect((await database.dailyMetabolismEntries.get("2026-09-11"))?.dietComplete).toBe(false);
    await database.records.put(meal("2026-09-11"));
    await vi.waitFor(async () => expect((await database.dailyMetabolismEntries.get("2026-09-11"))?.dietComplete).toBe(true));
  });
});

describe("save and backup compatibility", () => {
  beforeEach(async () => { await db.delete(); await db.open(); await db.records.put(meal()); });
  afterEach(async () => { await db.delete(); });
  it("normalizes unchecked past dates in both entry save paths without inventing measurements", async () => {
    // A past calendar year makes this regression independent of the test host's timezone.
    const oldMeal = meal("2000-01-01"); const oldDay = day("2000-01-01");
    await db.records.put(oldMeal);
    const saved = await saveDailyMetabolismEntry(oldDay);
    expect(saved.dietComplete).toBe(true); expect(saved.dietCompletedAutomatically).toBe(true); expect(saved.weightKg).toBe(oldDay.weightKg);
    await saveMetabolismProfileAndEntry(profile, { ...oldDay, steps: 4000, dietComplete: false });
    expect(await db.dailyMetabolismEntries.get(oldDay.date)).toMatchObject({ dietComplete: true, dietCompletedAutomatically: true, steps: 4000, weightKg: oldDay.weightKg });
    expect(await db.metabolismProfiles.get("metabolism")).toEqual(profile);
  });
  it("round-trips automatic provenance while accepting old backups and rejecting malformed metadata", async () => {
    await db.dailyMetabolismEntries.put(effectiveDietCompletion(day(), true, close));
    const backup = await createBackup({ includePhotos: false });
    expect(parseBackup(backup).metabolismEntries[0].dietCompletedAutomatically).toBe(true);
    await importBackup(backup, "replace");
    expect((await db.dailyMetabolismEntries.get("2026-09-12"))?.dietCompletedAutomatically).toBe(true);
    const legacy = { ...backup, metabolismEntries: [day()] };
    expect(parseBackup(legacy).metabolismEntries[0]).not.toHaveProperty("dietCompletedAutomatically");
    expect(() => parseBackup({ ...backup, metabolismEntries: [{ ...day(), dietCompletedAutomatically: "yes" }] })).toThrow();
  });
});
