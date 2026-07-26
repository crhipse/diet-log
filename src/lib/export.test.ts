import { EMPTY_NUTRIENTS } from "../constants";
import type {
  DailyMetabolismEntry,
  DietLogBackup,
  FoodRecord,
  MetabolismProfile
} from "../types";
import { db, saveRecord } from "./db";
import {
  buildCsv,
  buildMarkdown,
  createBackup,
  importBackup,
  parseBackup
} from "./export";
import {
  appendGoalTarget,
  goalTargetFromRecommendation
} from "./goalHistory";
import { calculateGoalRecommendation, type GoalPlan } from "./goals";

const fixture: FoodRecord = {
  id: "record-1",
  consumedAt: "2026-07-25T16:30:00.000Z",
  timezoneOffsetMinutes: -540,
  note: "야식",
  photoIds: [],
  foods: [
    {
      id: "food-1",
      name: "=위험한 음식명",
      amountText: "1인분",
      source: "ai",
      userEdited: true,
      nutrients: {
        ...EMPTY_NUTRIENTS,
        energyKcal: 420,
        carbsG: 36,
        proteinG: 31,
        fatG: 17
      }
    }
  ],
  analysis: {
    status: "complete",
    assumptions: ["1인분 300g으로 가정"],
    confidence: "medium",
    modelId: "claude-sonnet-5"
  },
  createdAt: "2026-07-25T16:30:00.000Z",
  updatedAt: "2026-07-25T16:30:00.000Z"
};

describe("기록 내보내기", () => {
  it("마크다운에 새벽 경계, 기록, 분석 요청을 포함한다", () => {
    const markdown = buildMarkdown([fixture], 2);

    expect(markdown).toContain("2026년 7월 25일");
    expect(markdown).toContain("다음 날 1시");
    expect(markdown).toContain("체중 감량과 단백질 섭취");
    expect(markdown).toContain("1인분 300g으로 가정");
  });

  it("CSV에 BOM을 넣고 사용자 텍스트의 수식 실행을 막는다", () => {
    const csv = buildCsv([fixture], 2);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=위험한 음식명");
    expect(csv).toContain("AI 분석");
  });

  it("분석 실패로 음식 항목이 없어도 CSV에서 기록 메모를 보존한다", () => {
    const csv = buildCsv([
      {
        ...fixture,
        id: "failed-record",
        note: "사진은 저장됐지만 분석 실패",
        foods: [],
        analysis: {
          status: "failed",
          assumptions: [],
          error: "네트워크 오류"
        }
      }
    ]);

    expect(csv).toContain("failed-record");
    expect(csv).toContain("사진은 저장됐지만 분석 실패");
    expect(csv).toContain("failed");
  });
});

describe("백업 병합", () => {
  beforeEach(async () => {
    await db.transaction(
      "rw",
      db.records,
      db.photos,
      db.settings,
      db.metabolismProfiles,
      db.dailyMetabolismEntries,
      async () => {
        await db.records.clear();
        await db.photos.clear();
        await db.settings.clear();
        await db.metabolismProfiles.clear();
        await db.dailyMetabolismEntries.clear();
      }
    );
  });

  it("오래된 백업이 현재 기기의 더 최신인 기록을 덮어쓰지 않는다", async () => {
    const currentRecord: FoodRecord = {
      ...fixture,
      foods: [
        {
          ...fixture.foods[0],
          name: "현재 기기에서 수정한 음식"
        }
      ],
      updatedAt: "2026-07-26T10:00:00.000Z"
    };
    await db.records.put(currentRecord);

    const result = await importBackup(
      backupWith({
        ...fixture,
        foods: [
          {
            ...fixture.foods[0],
            name: "오래된 백업의 음식"
          }
        ],
        updatedAt: "2026-07-25T10:00:00.000Z"
      }),
      "merge"
    );

    expect((await db.records.get(fixture.id))?.foods[0].name).toBe(
      "현재 기기에서 수정한 음식"
    );
    expect(result).toMatchObject({
      recordsImported: 0,
      recordsSkipped: 1,
      photosImported: 0
    });
  });

  it("더 최신인 백업 기록과 연결 사진은 함께 병합한다", async () => {
    await db.records.put({
      ...fixture,
      updatedAt: "2026-07-25T09:00:00.000Z"
    });
    const incomingRecord: FoodRecord = {
      ...fixture,
      photoIds: ["photo-1"],
      updatedAt: "2026-07-26T09:00:00.000Z"
    };
    const backup = backupWith(incomingRecord);
    backup.photos.push({
      id: "photo-1",
      recordId: incomingRecord.id,
      dataUrl: "data:image/webp;base64,AAECAwQ=",
      width: 10,
      height: 10,
      createdAt: "2026-07-26T09:00:00.000Z"
    });

    const result = await importBackup(backup, "merge");

    expect((await db.records.get(fixture.id))?.photoIds).toEqual(["photo-1"]);
    expect(await db.photos.toArray()).toEqual([
      expect.objectContaining({
        id: "photo-1",
        recordId: incomingRecord.id
      })
    ]);
    expect(result).toMatchObject({
      recordsImported: 1,
      recordsSkipped: 0,
      photosImported: 1
    });
  });

  it("사진 Blob이 없으면 사진을 참조하는 기록을 저장하지 않는다", async () => {
    await expect(
      saveRecord({
        ...fixture,
        photoIds: ["missing-photo"]
      })
    ).rejects.toThrow("일부 사진을 저장하지 못했습니다");

    expect(await db.records.get(fixture.id)).toBeUndefined();
  });

  it("사진을 제외한 가벼운 백업은 기록과 영양성분을 보존한다", async () => {
    await saveRecord(
      {
        ...fixture,
        photoIds: ["photo-compact"]
      },
      [
        {
          id: "photo-compact",
          recordId: fixture.id,
          blob: new Blob([new Uint8Array([1, 2, 3])], {
            type: "image/webp"
          }),
          width: 10,
          height: 10,
          createdAt: fixture.createdAt
        }
      ]
    );

    const backup = await createBackup({ includePhotos: false });

    expect(backup.photosIncluded).toBe(false);
    expect(backup.records[0].foods[0].nutrients.energyKcal).toBe(420);
    expect(backup.records[0].photoIds).toEqual([]);
    expect(backup.photos).toEqual([]);
  });

  it("기록 전용 백업을 병합해도 기존 사진을 지우지 않는다", async () => {
    const existingRecord: FoodRecord = {
      ...fixture,
      photoIds: ["photo-keep"],
      updatedAt: "2026-07-25T09:00:00.000Z"
    };
    await saveRecord(existingRecord, [
      {
        id: "photo-keep",
        recordId: fixture.id,
        blob: new Blob([new Uint8Array([1])], { type: "image/webp" }),
        width: 10,
        height: 10,
        createdAt: fixture.createdAt
      }
    ]);
    const compactBackup = backupWith({
      ...fixture,
      photoIds: [],
      updatedAt: "2026-07-26T09:00:00.000Z"
    });
    compactBackup.photosIncluded = false;

    await importBackup(compactBackup, "merge");

    expect((await db.records.get(fixture.id))?.photoIds).toEqual([
      "photo-keep"
    ]);
    expect(await db.photos.get("photo-keep")).toBeDefined();
  });

  it("대사량 프로필과 일일 기록을 백업하고 복원한다", async () => {
    await db.metabolismProfiles.put(metabolismProfileFixture);
    await db.dailyMetabolismEntries.put(metabolismEntryFixture);

    const backup = await createBackup({ includePhotos: false });

    expect(backup.schemaVersion).toBe(2);
    expect(backup.metabolismProfile?.jobTemplates).toHaveLength(2);
    expect(backup.metabolismEntries).toEqual([metabolismEntryFixture]);

    await db.metabolismProfiles.clear();
    await db.dailyMetabolismEntries.clear();
    const result = await importBackup(backup, "merge");

    expect(result.metabolismProfileImported).toBe(true);
    expect(result.metabolismEntriesImported).toBe(1);
    expect(await db.metabolismProfiles.get("metabolism")).toEqual(
      metabolismProfileFixture
    );
    expect(await db.dailyMetabolismEntries.get("2026-07-26")).toEqual(
      metabolismEntryFixture
    );
  });

  it("버전 1 백업은 빈 대사량 데이터가 있는 현재 형식으로 읽는다", () => {
    const legacy = {
      ...backupWith(fixture),
      schemaVersion: 1
    };
    delete (legacy as Partial<DietLogBackup>).metabolismProfile;
    delete (legacy as Partial<DietLogBackup>).metabolismEntries;

    const parsed = parseBackup(legacy);

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.metabolismProfile).toBeNull();
    expect(parsed.metabolismEntries).toEqual([]);
  });

  it("목표 이력과 적용일을 백업에서 그대로 복원한다", () => {
    const backup = backupWith(fixture);
    const plan: GoalPlan = {
      goalType: "lean_mass_gain",
      pace: "gentle",
      resistanceTrainingDaysPerWeek: 3,
      targetWeightKg: 76,
      targetDate: "2026-12-31"
    };
    const target = goalTargetFromRecommendation({
      id: "goal-1",
      effectiveFrom: "2026-07-26",
      plan,
      recommendation: calculateGoalRecommendation({
        tdeeKcal: 2400,
        weightKg: 72,
        plan
      }),
      tdeeSource: "detailed",
      createdAt: "2026-07-26T12:00:00.000Z"
    });
    backup.settings.goalSettings = appendGoalTarget(undefined, target);

    const parsed = parseBackup(backup);

    expect(parsed.settings.goalSettings?.targets).toEqual([target]);
    expect(parsed.settings.goalSettings?.targets[0].effectiveFrom).toBe(
      "2026-07-26"
    );
  });

  it("현재 앱 설정이 더 최신이어도 백업의 다른 목표 이력은 병합한다", async () => {
    const plan: GoalPlan = {
      goalType: "fat_loss",
      pace: "moderate",
      resistanceTrainingDaysPerWeek: 3
    };
    const makeTarget = (id: string, day: string) =>
      goalTargetFromRecommendation({
        id,
        effectiveFrom: day,
        plan,
        recommendation: calculateGoalRecommendation({
          tdeeKcal: 2400,
          weightKg: 72,
          plan
        }),
        tdeeSource: "detailed",
        createdAt: `${day}T00:00:00.000Z`
      });
    await db.settings.put({
      id: "app",
      dayStartHour: 4,
      modelId: "newer-model",
      goalSettings: appendGoalTarget(
        undefined,
        makeTarget("current-goal", "2026-07-20")
      ),
      updatedAt: "2026-07-30T00:00:00.000Z"
    });
    const backup = backupWith(fixture);
    backup.settings.goalSettings = appendGoalTarget(
      undefined,
      makeTarget("backup-goal", "2026-07-10")
    );

    await importBackup(backup, "merge");

    const settings = await db.settings.get("app");
    expect(settings?.modelId).toBe("newer-model");
    expect(settings?.goalSettings?.targets.map((item) => item.id)).toEqual([
      "backup-goal",
      "current-goal"
    ]);
  });
});

const metabolismProfileFixture: MetabolismProfile = {
  id: "metabolism",
  sex: "male",
  birthDate: "1990-05-04",
  heightCm: 175,
  jobTemplates: [
    {
      id: "job-office",
      name: "사무·재택",
      activityType: "standing",
      defaultHours: 8
    },
    {
      id: "job-sales",
      name: "외근·영업",
      activityType: "walking",
      defaultHours: 6
    }
  ],
  exerciseTemplates: [],
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z"
};

const metabolismEntryFixture: DailyMetabolismEntry = {
  id: "2026-07-26",
  date: "2026-07-26",
  weightKg: 72,
  steps: 8_500,
  dietComplete: true,
  jobActivities: [
    {
      id: "work-1",
      templateId: "job-office",
      name: "사무·재택",
      activityType: "standing",
      hours: 8
    }
  ],
  exercises: [],
  createdAt: "2026-07-26T01:00:00.000Z",
  updatedAt: "2026-07-26T01:00:00.000Z"
};

function backupWith(record: FoodRecord): DietLogBackup {
  return {
    app: "식단관리",
    schemaVersion: 2,
    photosIncluded: true,
    exportedAt: "2026-07-26T12:00:00.000Z",
    settings: {
      id: "app",
      dayStartHour: 2,
      modelId: "claude-sonnet-5",
      updatedAt: "2026-07-26T12:00:00.000Z"
    },
    records: [record],
    photos: [],
    metabolismProfile: null,
    metabolismEntries: []
  };
}
