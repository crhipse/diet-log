import Dexie, { type Table } from "dexie";

import { DEFAULT_SETTINGS } from "../constants";
import type {
  AppSettings,
  DailyMetabolismEntry,
  FoodRecord,
  MetabolismProfile,
  PhotoAsset
} from "../types";
import {
  validateDailyMetabolismEntry,
  validateDateKey,
  validateMetabolismProfile
} from "./metabolism";

export const DATABASE_NAME = "diet-log";

export class DietLogDatabase extends Dexie {
  records!: Table<FoodRecord, string>;
  photos!: Table<PhotoAsset, string>;
  settings!: Table<AppSettings, "app">;
  metabolismProfiles!: Table<MetabolismProfile, "metabolism">;
  dailyMetabolismEntries!: Table<DailyMetabolismEntry, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      records: "&id, consumedAt, updatedAt",
      photos: "&id, recordId, [recordId+createdAt], createdAt",
      settings: "&id"
    });
    this.version(2).stores({
      records: "&id, consumedAt, updatedAt",
      photos: "&id, recordId, [recordId+createdAt], createdAt",
      settings: "&id",
      metabolismProfiles: "&id, updatedAt",
      dailyMetabolismEntries: "&id, date, updatedAt"
    });
  }
}

export const db = new DietLogDatabase();

function validDayStartHour(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 23;
}

function assertRecordIdentity(record: FoodRecord): void {
  if (!record.id.trim()) throw new Error("기록 ID가 비어 있습니다.");
  if (Number.isNaN(Date.parse(record.consumedAt))) {
    throw new Error("섭취 시각이 올바르지 않습니다.");
  }
  if (new Set(record.photoIds).size !== record.photoIds.length) {
    throw new Error("기록에 중복된 사진 ID가 있습니다.");
  }
}

export async function listRecords(): Promise<FoodRecord[]> {
  return db.records.orderBy("consumedAt").reverse().toArray();
}

export async function getRecord(
  id: string
): Promise<FoodRecord | undefined> {
  return db.records.get(id);
}

/**
 * Stores a record and any supplied photos in one transaction. Photos removed
 * from `record.photoIds` are cleaned up automatically.
 */
export async function saveRecord(
  record: FoodRecord,
  photoAssets: readonly PhotoAsset[] = []
): Promise<FoodRecord> {
  assertRecordIdentity(record);
  const allowedPhotoIds = new Set(record.photoIds);

  for (const photo of photoAssets) {
    if (photo.recordId !== record.id) {
      throw new Error("사진의 기록 ID가 저장할 기록과 일치하지 않습니다.");
    }
    if (!allowedPhotoIds.has(photo.id)) {
      throw new Error("기록의 사진 목록에 없는 사진이 포함되어 있습니다.");
    }
  }

  await db.transaction("rw", db.records, db.photos, async () => {
    await db.records.put(record);
    if (photoAssets.length > 0) {
      await db.photos.bulkPut([...photoAssets]);
    }

    const storedPhotos = await db.photos
      .where("recordId")
      .equals(record.id)
      .toArray();
    const storedPhotosById = new Map(
      storedPhotos.map((photo) => [photo.id, photo])
    );
    for (const photoId of record.photoIds) {
      const storedPhoto = storedPhotosById.get(photoId);
      if (!storedPhoto || storedPhoto.recordId !== record.id) {
        throw new Error(
          "일부 사진을 저장하지 못했습니다. 기록은 변경되지 않았습니다."
        );
      }
    }
    const staleIds = storedPhotos
      .filter((photo) => !allowedPhotoIds.has(photo.id))
      .map((photo) => photo.id);
    if (staleIds.length > 0) await db.photos.bulkDelete(staleIds);
  });

  return record;
}

export async function savePhotos(
  photoAssets: readonly PhotoAsset[]
): Promise<void> {
  if (photoAssets.length === 0) return;

  const grouped = new Map<string, PhotoAsset[]>();
  for (const photo of photoAssets) {
    const group = grouped.get(photo.recordId);
    if (group) group.push(photo);
    else grouped.set(photo.recordId, [photo]);
  }

  await db.transaction("rw", db.records, db.photos, async () => {
    for (const [recordId, photos] of grouped) {
      const record = await db.records.get(recordId);
      if (!record) {
        throw new Error(`사진이 참조하는 기록을 찾을 수 없습니다: ${recordId}`);
      }
      const allowedIds = new Set(record.photoIds);
      if (photos.some((photo) => !allowedIds.has(photo.id))) {
        throw new Error("기록의 사진 목록에 없는 사진이 포함되어 있습니다.");
      }
    }
    await db.photos.bulkPut([...photoAssets]);
  });
}

export async function getPhotosForRecord(
  recordId: string
): Promise<PhotoAsset[]> {
  const [record, photos] = await Promise.all([
    db.records.get(recordId),
    db.photos.where("recordId").equals(recordId).toArray()
  ]);
  if (!record) return photos.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const position = new Map(record.photoIds.map((id, index) => [id, index]));
  return photos.sort((left, right) => {
    const leftPosition = position.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = position.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return (
      leftPosition - rightPosition ||
      left.createdAt.localeCompare(right.createdAt)
    );
  });
}

export async function deleteRecordWithPhotos(recordId: string): Promise<void> {
  await db.transaction("rw", db.records, db.photos, async () => {
    await db.photos.where("recordId").equals(recordId).delete();
    await db.records.delete(recordId);
  });
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get("app");
  if (
    stored &&
    validDayStartHour(stored.dayStartHour) &&
    stored.modelId.trim()
  ) {
    return stored;
  }

  const defaults: AppSettings = { ...DEFAULT_SETTINGS };
  await db.settings.put(defaults);
  return defaults;
}

export type SettingsUpdate = Partial<
  Pick<AppSettings, "dayStartHour" | "modelId">
>;

export async function saveSettings(
  update: SettingsUpdate | AppSettings
): Promise<AppSettings> {
  const current = await getSettings();
  const dayStartHour = update.dayStartHour ?? current.dayStartHour;
  const modelId = update.modelId?.trim() || current.modelId;

  if (!validDayStartHour(dayStartHour)) {
    throw new RangeError("하루 시작 시각은 0부터 23 사이의 정수여야 합니다.");
  }
  if (modelId.length > 200) {
    throw new RangeError("모델 ID가 너무 깁니다.");
  }

  const next: AppSettings = {
    id: "app",
    dayStartHour,
    modelId,
    updatedAt: new Date().toISOString()
  };
  await db.settings.put(next);
  return next;
}

export async function getMetabolismProfile(): Promise<
  MetabolismProfile | undefined
> {
  return db.metabolismProfiles.get("metabolism");
}

/**
 * There is intentionally only one profile per browser. The literal ID and
 * primary key keep this invariant true even if save is called repeatedly.
 */
export async function saveMetabolismProfile(
  profile: MetabolismProfile
): Promise<MetabolismProfile> {
  validateMetabolismProfile(profile);
  await db.metabolismProfiles.put(profile);
  return profile;
}

export async function getDailyMetabolismEntry(
  date: string
): Promise<DailyMetabolismEntry | undefined> {
  validateDateKey(date);
  return db.dailyMetabolismEntries.get(date);
}

export async function saveDailyMetabolismEntry(
  entry: DailyMetabolismEntry
): Promise<DailyMetabolismEntry> {
  validateDailyMetabolismEntry(entry);
  await db.dailyMetabolismEntries.put(entry);
  return entry;
}

/**
 * Saves the current profile/templates together with the day's entry. This
 * prevents a successful day save from discarding unsaved profile edits when
 * the screen reloads its IndexedDB state.
 */
export async function saveMetabolismProfileAndEntry(
  profile: MetabolismProfile,
  entry: DailyMetabolismEntry
): Promise<void> {
  validateMetabolismProfile(profile);
  validateDailyMetabolismEntry(entry);
  await db.transaction(
    "rw",
    db.metabolismProfiles,
    db.dailyMetabolismEntries,
    async () => {
      await db.metabolismProfiles.put(profile);
      await db.dailyMetabolismEntries.put(entry);
    }
  );
}

/**
 * Lists entries in chronological order. Both optional date bounds are
 * inclusive.
 */
export async function listDailyMetabolismEntries(
  fromDate?: string,
  toDate?: string
): Promise<DailyMetabolismEntry[]> {
  if (fromDate !== undefined) validateDateKey(fromDate, "시작 날짜");
  if (toDate !== undefined) validateDateKey(toDate, "종료 날짜");
  if (fromDate && toDate && fromDate > toDate) {
    throw new RangeError("시작 날짜는 종료 날짜보다 늦을 수 없습니다.");
  }

  if (fromDate && toDate) {
    return db.dailyMetabolismEntries
      .where("date")
      .between(fromDate, toDate, true, true)
      .sortBy("date");
  }
  if (fromDate) {
    return db.dailyMetabolismEntries
      .where("date")
      .aboveOrEqual(fromDate)
      .sortBy("date");
  }
  if (toDate) {
    return db.dailyMetabolismEntries
      .where("date")
      .belowOrEqual(toDate)
      .sortBy("date");
  }
  return db.dailyMetabolismEntries.orderBy("date").toArray();
}

export async function deleteDailyMetabolismEntry(date: string): Promise<void> {
  validateDateKey(date);
  await db.dailyMetabolismEntries.delete(date);
}

/**
 * Asks the browser not to evict local IndexedDB data under storage pressure.
 * Browsers may decline the request; unsupported/private modes return false.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    !navigator.storage ||
    typeof navigator.storage.persist !== "function"
  ) {
    return false;
  }

  try {
    if (
      typeof navigator.storage.persisted === "function" &&
      (await navigator.storage.persisted())
    ) {
      return true;
    }
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
