import Dexie from "dexie";

import type {
  DailyMetabolismEntry,
  FoodRecord,
  MetabolismProfile
} from "../types";
import {
  db,
  deleteDailyMetabolismEntry,
  DietLogDatabase,
  getDailyMetabolismEntry,
  getMetabolismProfile,
  listDailyMetabolismEntries,
  saveDailyMetabolismEntry,
  saveMetabolismProfileAndEntry,
  saveMetabolismProfile
} from "./db";

const NOW = "2026-07-26T00:00:00.000Z";

function profile(heightCm = 180): MetabolismProfile {
  return {
    id: "metabolism",
    sex: "male",
    birthDate: "1990-01-01",
    heightCm,
    jobTemplates: [],
    exerciseTemplates: [],
    createdAt: NOW,
    updatedAt: NOW
  };
}

function daily(date: string): DailyMetabolismEntry {
  return {
    id: date,
    date,
    weightKg: 80,
    dietComplete: false,
    jobActivities: [],
    exercises: [],
    createdAt: NOW,
    updatedAt: NOW
  };
}

describe("대사량 IndexedDB 저장", () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  afterAll(async () => {
    db.close();
    await db.delete();
  });

  it("단일 프로필을 같은 키로 갱신한다", async () => {
    await saveMetabolismProfile(profile(180));
    await saveMetabolismProfile(profile(175));

    expect(await db.metabolismProfiles.count()).toBe(1);
    expect((await getMetabolismProfile())?.heightCm).toBe(175);
  });

  it("날짜 범위로 일일 기록을 오름차순 조회하고 삭제한다", async () => {
    await saveDailyMetabolismEntry(daily("2026-07-28"));
    await saveDailyMetabolismEntry(daily("2026-07-26"));
    await saveDailyMetabolismEntry(daily("2026-07-27"));

    expect(
      (await listDailyMetabolismEntries("2026-07-27", "2026-07-28")).map(
        (item) => item.date
      )
    ).toEqual(["2026-07-27", "2026-07-28"]);

    await deleteDailyMetabolismEntry("2026-07-27");
    expect(await getDailyMetabolismEntry("2026-07-27")).toBeUndefined();
  });

  it("프로필과 일일 기록을 한 번에 저장한다", async () => {
    const currentProfile = profile(178);
    const currentDay = daily("2026-07-26");

    await saveMetabolismProfileAndEntry(currentProfile, currentDay);

    expect(await getMetabolismProfile()).toEqual(currentProfile);
    expect(await getDailyMetabolismEntry(currentDay.date)).toEqual(currentDay);
  });

  it("조회 범위가 뒤집히면 저장소를 읽기 전에 거부한다", async () => {
    await expect(
      listDailyMetabolismEntries("2026-07-28", "2026-07-26")
    ).rejects.toThrow("시작 날짜");
  });
});

describe("IndexedDB v1 → v2 마이그레이션", () => {
  it("기존 식단 기록을 보존하면서 대사량 테이블을 추가한다", async () => {
    const databaseName = `diet-log-v1-upgrade-${Date.now()}-${Math.random()}`;
    const legacy = new Dexie(databaseName);
    legacy.version(1).stores({
      records: "&id, consumedAt, updatedAt",
      photos: "&id, recordId, [recordId+createdAt], createdAt",
      settings: "&id"
    });

    const oldRecord: FoodRecord = {
      id: "old-record",
      consumedAt: NOW,
      timezoneOffsetMinutes: -540,
      note: "기존 기록",
      photoIds: [],
      foods: [],
      analysis: { status: "not_requested", assumptions: [] },
      createdAt: NOW,
      updatedAt: NOW
    };
    await legacy.open();
    await legacy.table("records").put(oldRecord);
    legacy.close();

    const upgraded = new DietLogDatabase(databaseName);
    try {
      await upgraded.open();
      expect(await upgraded.records.get("old-record")).toEqual(oldRecord);
      await upgraded.metabolismProfiles.put(profile());
      await upgraded.dailyMetabolismEntries.put(daily("2026-07-26"));
      expect(await upgraded.metabolismProfiles.count()).toBe(1);
      expect(await upgraded.dailyMetabolismEntries.count()).toBe(1);
    } finally {
      upgraded.close();
      await Dexie.delete(databaseName);
    }
  });
});
