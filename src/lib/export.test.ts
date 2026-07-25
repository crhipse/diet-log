import { EMPTY_NUTRIENTS } from "../constants";
import type { DietLogBackup, FoodRecord } from "../types";
import { db, saveRecord } from "./db";
import {
  buildCsv,
  buildMarkdown,
  createBackup,
  importBackup
} from "./export";

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
    expect(markdown).toContain("다음 날 01:30");
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
    await db.transaction("rw", db.records, db.photos, db.settings, async () => {
      await db.records.clear();
      await db.photos.clear();
      await db.settings.clear();
    });
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
});

function backupWith(record: FoodRecord): DietLogBackup {
  return {
    app: "식단관리",
    schemaVersion: 1,
    photosIncluded: true,
    exportedAt: "2026-07-26T12:00:00.000Z",
    settings: {
      id: "app",
      dayStartHour: 2,
      modelId: "claude-sonnet-5",
      updatedAt: "2026-07-26T12:00:00.000Z"
    },
    records: [record],
    photos: []
  };
}
