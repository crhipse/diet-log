import Dexie from "dexie";
import { EMPTY_NUTRIENTS } from "../constants";
import { db, DietLogDatabase } from "./db";
import { deleteFavoriteFood, foodFromFavorite, listFavoriteFoods, saveFavoriteFood } from "./favorites";
import { createBackup, importBackup, parseBackup } from "./export";

const food = { name: "두유", amountText: "1팩", nutrients: { ...EMPTY_NUTRIENTS, energyKcal: 100, proteinG: 8 } };
beforeEach(async () => { await db.favoriteFoods.clear(); });

test("완전히 같은 즐겨찾기는 중복 저장하지 않고 다른 기준량은 별도로 저장한다", async () => {
  const [one, two] = await Promise.all([saveFavoriteFood(food), saveFavoriteFood(food)]);
  expect(one.id).toBe(two.id);
  await saveFavoriteFood({ ...food, amountText: "2팩" });
  expect(await listFavoriteFoods()).toHaveLength(2);
});

test("추가한 음식, 원본, 다른 사본은 독립적이다", async () => {
  const favorite = await saveFavoriteFood(food);
  const copy = foodFromFavorite(favorite);
  const copy2 = foodFromFavorite(favorite);
  copy.nutrients.energyKcal = 300;
  expect(copy.id).not.toBe(copy2.id);
  expect(copy2.nutrients.energyKcal).toBe(100);
  expect(favorite.nutrients.energyKcal).toBe(100);
  expect(copy.nutrients.fiberG).toBeNull();
  await saveFavoriteFood({ ...food, name: "수정한 두유" }, favorite.id);
  expect(copy.name).toBe("두유");
  await deleteFavoriteFood(favorite.id);
  expect(await listFavoriteFoods()).toHaveLength(0);
  expect(copy.name).toBe("두유");
});

test("빈 음식명, 미입력 영양성분과 잘못된 숫자를 저장하지 않는다", async () => {
  await expect(saveFavoriteFood({ ...food, name: " " })).rejects.toThrow("음식명");
  await expect(saveFavoriteFood({ ...food, nutrients: EMPTY_NUTRIENTS })).rejects.toThrow("하나 이상");
  await expect(saveFavoriteFood({ ...food, nutrients: { ...food.nutrients, proteinG: -1 } })).rejects.toThrow("0 이상");
  expect(await listFavoriteFoods()).toHaveLength(0);
});

test("가벼운 백업과 전체 백업에 포함되고 더 최신인 즐겨찾기는 병합 시 보존한다", async () => {
  const favorite = await saveFavoriteFood(food);
  const backup = await createBackup({ includePhotos: false });
  expect(backup.favoriteFoods).toEqual([favorite]);
  expect((await createBackup()).favoriteFoods).toEqual([favorite]);
  await db.favoriteFoods.put({ ...favorite, name: "최신 이름", updatedAt: "2099-01-01T00:00:00.000Z" });
  await importBackup(backup, "merge");
  expect((await db.favoriteFoods.get(favorite.id))?.name).toBe("최신 이름");
  await db.favoriteFoods.clear();
  const result = await importBackup(backup, "merge");
  expect(result.favoriteFoodsImported).toBe(1);
  expect(await listFavoriteFoods()).toEqual([favorite]);
});

test("즐겨찾기가 없는 옛 백업의 교체 복원은 보존하고 명시적 빈 목록은 비운다", async () => {
  await saveFavoriteFood(food);
  const backup = await createBackup({ includePhotos: false });
  delete backup.favoriteFoods;
  await importBackup(backup, "replace");
  expect(await listFavoriteFoods()).toHaveLength(1);
  await importBackup({ ...backup, favoriteFoods: [] }, "replace");
  expect(await listFavoriteFoods()).toHaveLength(0);
});

test("백업 즐겨찾기를 검증하고 중복 ID나 음수 데이터가 있으면 기록 변경 전에 거절한다", async () => {
  const favorite = await saveFavoriteFood(food);
  const backup = await createBackup({ includePhotos: false });
  expect(() => parseBackup({ ...backup, favoriteFoods: [favorite, favorite] })).toThrow("중복");
  await expect(importBackup({ ...backup, favoriteFoods: [{ ...favorite, nutrients: { ...food.nutrients, energyKcal: -5 } }] }, "replace"))
    .rejects.toThrow();
  expect(await listFavoriteFoods()).toEqual([favorite]);
});

test("버전 2 저장소에서 업그레이드해도 기존 기록과 설정이 유지된다", async () => {
  const name = `favorites-migration-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(2).stores({ records: "&id, consumedAt, updatedAt", photos: "&id, recordId, [recordId+createdAt], createdAt", settings: "&id",
    metabolismProfiles: "&id, updatedAt", dailyMetabolismEntries: "&id, date, updatedAt" });
  await old.table("records").put({ id: "keep", note: "기존 기록" });
  await old.table("settings").put({ id: "app", dayStartHour: 2 });
  old.close();
  const upgraded = new DietLogDatabase(name);
  try {
    await upgraded.open();
    expect((await upgraded.records.get("keep"))?.note).toBe("기존 기록");
    expect((await upgraded.settings.get("app"))?.dayStartHour).toBe(2);
    expect(await upgraded.favoriteFoods.count()).toBe(0);
  } finally { upgraded.close(); await Dexie.delete(name); }
});
