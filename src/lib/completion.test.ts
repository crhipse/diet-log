import Dexie from "dexie";
import { db, DietLogDatabase, saveRecord, setDietCompletion, deleteRecordWithPhotos, saveMetabolismProfileAndEntry } from "./db";
import { createBackup, importBackup } from "./export";
import { estimateDailyEnergy } from "./metabolism";
import { EMPTY_NUTRIENTS } from "../constants";
import type { DailyMetabolismEntry, FoodRecord, MetabolismProfile } from "../types";

const date = "2026-10-20";
const now = "2026-10-20T12:00:00.000Z";
const profile: MetabolismProfile = { id: "metabolism", sex: "male", birthDate: "1990-01-01", heightCm: 175,
  jobTemplates: [], exerciseTemplates: [], createdAt: now, updatedAt: now };
const record: FoodRecord = { id: "r1", consumedAt: `${date}T03:00:00.000Z`, timezoneOffsetMinutes: -540, note: "기록", photoIds: [],
  foods: [{ id: "f1", name: "식사", amountText: "1끼", nutrients: { ...EMPTY_NUTRIENTS, energyKcal: 2000 }, source: "manual", userEdited: false }],
  analysis: { status: "not_requested", assumptions: [] }, createdAt: now, updatedAt: now };
const entry: DailyMetabolismEntry = { id: date, date, weightKg: 70, dietComplete: false, metabolismComplete: true,
  tdeeSnapshot: { kcal: 2500, calculatedAt: now, source: "detail" }, jobActivities: [], exercises: [], createdAt: now, updatedAt: now };
beforeEach(async () => { db.close(); await db.delete(); await db.open(); });
afterAll(async () => { db.close(); await db.delete(); });

test("식단 완료 후 추가·수정·날짜 이동·삭제하면 영향을 받은 날짜의 완료만 취소한다", async () => {
  await saveRecord(record);
  await saveMetabolismProfileAndEntry(profile, entry);
  await setDietCompletion(date, true);
  expect((await db.dailyCompletions.get(date))?.dietComplete).toBe(true);
  await saveRecord({ ...record, id: "r2" });
  expect((await db.dailyCompletions.get(date))?.dietComplete).toBe(false);
  expect((await db.dailyMetabolismEntries.get(date))?.metabolismComplete).toBe(true);
  await setDietCompletion(date, true);
  await saveRecord({ ...record, consumedAt: "2026-10-21T03:00:00.000Z" });
  expect((await db.dailyCompletions.get(date))?.dietComplete).toBe(false);
  expect((await db.dailyCompletions.get("2026-10-21"))?.dietComplete).toBe(false);
  await setDietCompletion("2026-10-21", true);
  await deleteRecordWithPhotos(record.id);
  expect((await db.dailyCompletions.get("2026-10-21"))?.dietComplete).toBe(false);
});

test("기록이나 열량이 없으면 식단 완료할 수 없고 저장 실패 시 기존 완료를 유지한다", async () => {
  await expect(setDietCompletion(date, true)).rejects.toThrow("칼로리");
  await saveRecord(record); await setDietCompletion(date, true);
  await expect(saveRecord({ ...record, photoIds: ["missing"] })).rejects.toThrow();
  expect((await db.dailyCompletions.get(date))?.dietComplete).toBe(true);
});

test("중간저장은 통계용 TDEE를 완료 처리하지 않고 완료 시점 TDEE와 입력 운동값은 백업 복원한다", async () => {
  await saveRecord(record); await setDietCompletion(date, true);
  await saveMetabolismProfileAndEntry(profile, { ...entry, metabolismComplete: false, tdeeSnapshot: undefined });
  expect((await db.dailyMetabolismEntries.get(date))?.metabolismComplete).toBe(false);
  await saveMetabolismProfileAndEntry(profile, { ...entry, exercises: [{ id: "bike", name: "실내자전거", category: "cycling", intensity: "moderate", durationMinutes: 40, caloriesKcal: 350, includedInSteps: false }] });
  const backup = await createBackup({ includePhotos: false });
  await importBackup(backup, "replace");
  const restored = await db.dailyMetabolismEntries.get(date);
  expect(restored?.tdeeSnapshot?.kcal).toBe(2500);
  expect(restored?.exercises[0].caloriesKcal).toBe(350);
  expect(restored?.metabolismComplete).toBe(true);
  expect((await db.dailyCompletions.get(date))?.dietComplete).toBe(true);
});

test("새로 추가한 식사가 있는 상태에서 옛 백업을 병합해도 다시 완료 처리하지 않는다", async () => {
  await saveRecord(record); await setDietCompletion(date, true);
  const backup = await createBackup({ includePhotos: false });
  await saveRecord({ ...record, id: "new-meal", updatedAt: "2026-10-23T00:00:00.000Z" });
  await importBackup(backup, "merge");
  expect((await db.dailyCompletions.get(date))?.dietComplete).toBe(false);
});

test("옛 백업을 병합해도 더 최신 식사와 그 완료 상태는 보존한다", async () => {
  await saveRecord(record); await setDietCompletion(date, true);
  const backup = await createBackup({ includePhotos: false });
  await saveRecord({ ...record, note: "최신 수정", updatedAt: "2099-01-01T00:00:00.000Z" });
  await setDietCompletion(date, true);
  await importBackup(backup, "merge");
  expect((await db.records.get(record.id))?.note).toBe("최신 수정");
  expect((await db.dailyCompletions.get(date))?.dietComplete).toBe(true);
});

test("옛 백업의 완료 정보가 없어도 존재하는 과거 기록을 완료로 복원한다", async () => {
  await saveRecord(record); await saveMetabolismProfileAndEntry(profile, entry);
  const backup = await createBackup({ includePhotos: false });
  delete backup.dailyCompletions;
  backup.metabolismEntries = [{ ...entry, metabolismComplete: undefined, tdeeSnapshot: undefined }];
  await importBackup(backup, "replace");
  expect((await db.dailyCompletions.get(date))?.dietComplete).toBe(true);
  expect((await db.dailyMetabolismEntries.get(date))?.tdeeSnapshot?.kcal).toBeGreaterThan(0);
});

test("v3 기기의 과거 식단·대사량을 보존하고 완료와 TDEE를 한 번만 전환한다", async () => {
  const name = `complete-upgrade-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(3).stores({ records: "&id, consumedAt, updatedAt", photos: "&id, recordId, [recordId+createdAt], createdAt", settings: "&id",
    metabolismProfiles: "&id, updatedAt", dailyMetabolismEntries: "&id, date, updatedAt", favoriteFoods: "&id, name, updatedAt" });
  await old.table("records").put(record);
  await old.table("metabolismProfiles").put(profile);
  await old.table("dailyMetabolismEntries").put({ ...entry, metabolismComplete: undefined, tdeeSnapshot: undefined });
  old.close();
  const upgraded = new DietLogDatabase(name);
  try {
    await upgraded.open();
    expect(await upgraded.records.get(record.id)).toEqual(record);
    expect((await upgraded.dailyCompletions.get(date))?.dietComplete).toBe(true);
    expect((await upgraded.dailyMetabolismEntries.get(date))?.tdeeSnapshot?.kcal).toBe(estimateDailyEnergy(profile, entry).tdeeKcal);
    expect(await upgraded.dailyCompletions.get("2026-10-19")).toBeUndefined();
    await upgraded.dailyCompletions.update(date, { dietComplete: false });
    upgraded.close(); await upgraded.open();
    expect((await upgraded.dailyCompletions.get(date))?.dietComplete).toBe(false);
  } finally { upgraded.close(); await Dexie.delete(name); }
});
