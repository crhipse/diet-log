import type {
  DailyMetabolismEntry,
  MetabolismProfile
} from "../types";
import {
  calculateBmr,
  calculateSimpleTdee,
  calculateTdeeConfidenceRange,
  estimateDailyEnergy,
  estimatePersonalizedTdee,
  SIMPLE_ACTIVITY_FACTORS,
  validateDailyMetabolismEntry,
  validateMetabolismProfile
} from "./metabolism";

const NOW = "2026-07-26T00:00:00.000Z";

function profile(
  update: Partial<MetabolismProfile> = {}
): MetabolismProfile {
  return {
    id: "metabolism",
    sex: "male",
    birthDate: "1990-07-26",
    heightCm: 180,
    jobTemplates: [
      {
        id: "doctor",
        name: "피부과 진료",
        activityType: "standing",
        defaultHours: 8
      },
      {
        id: "investor",
        name: "외부 탐방",
        activityType: "walking",
        defaultHours: 5
      }
    ],
    exerciseTemplates: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...update
  };
}

function entry(
  date = "2026-07-26",
  update: Partial<DailyMetabolismEntry> = {}
): DailyMetabolismEntry {
  return {
    id: date,
    date,
    weightKg: 80,
    dietComplete: false,
    jobActivities: [],
    exercises: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...update
  };
}

function trendEntries(
  days: number,
  weightAtDay: (day: number) => number,
  intake = 2_000
): {
  entries: DailyMetabolismEntry[];
  intakeByDate: Record<string, number>;
} {
  const firstDay = Date.UTC(2026, 0, 1);
  const entries: DailyMetabolismEntry[] = [];
  const intakeByDate: Record<string, number> = {};
  for (let index = 0; index < days; index += 1) {
    const date = new Date(firstDay + index * 86_400_000)
      .toISOString()
      .slice(0, 10);
    entries.push(
      entry(date, {
        weightKg: weightAtDay(index),
        dietComplete: true
      })
    );
    intakeByDate[date] = intake;
  }
  return { entries, intakeByDate };
}

describe("기초대사량 계산", () => {
  it("남성 Mifflin–St Jeor 공식을 적용한다", () => {
    expect(
      calculateBmr({
        sex: "male",
        birthDate: "1990-07-26",
        heightCm: 180,
        weightKg: 80,
        asOfDate: "2026-07-26"
      })
    ).toEqual({
      method: "mifflin-st-jeor",
      kcal: 1_750,
      ageYears: 36
    });
  });

  it("여성 Mifflin–St Jeor 공식을 적용한다", () => {
    expect(
      calculateBmr({
        sex: "female",
        birthDate: "1990-07-26",
        heightCm: 180,
        weightKg: 80,
        asOfDate: "2026-07-26"
      }).kcal
    ).toBe(1_584);
  });

  it("체지방률이 있으면 제지방량 공식을 우선한다", () => {
    expect(
      calculateBmr({
        sex: "male",
        birthDate: "1990-07-26",
        heightCm: 180,
        weightKg: 80,
        bodyFatPercent: 20,
        asOfDate: "2026-07-26"
      })
    ).toEqual({
      method: "katch-mcardle",
      kcal: 1_752,
      ageYears: 36,
      leanBodyMassKg: 64
    });
  });

  it("생일 전에는 만 나이를 한 살 낮게 계산한다", () => {
    expect(
      calculateBmr({
        sex: "male",
        birthDate: "1990-07-26",
        heightCm: 180,
        weightKg: 80,
        asOfDate: "2026-07-25"
      }).ageYears
    ).toBe(35);
  });

  it("잘못된 체지방률에는 이해하기 쉬운 한국어 오류를 낸다", () => {
    expect(() =>
      calculateBmr({
        sex: "male",
        birthDate: "1990-07-26",
        heightCm: 180,
        weightKg: 80,
        bodyFatPercent: 90,
        asOfDate: "2026-07-26"
      })
    ).toThrow("체지방률");
  });

  it("미래 생년월일은 프로필 저장 단계에서 거부한다", () => {
    expect(() =>
      validateMetabolismProfile(
        profile({ birthDate: "2999-01-01" })
      )
    ).toThrow("생년월일");
  });
});

describe("활동대사량 계산", () => {
  it("간편 모드의 다섯 활동계수를 그대로 사용한다", () => {
    expect(SIMPLE_ACTIVITY_FACTORS).toEqual({
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      high: 1.725,
      very_high: 1.9
    });
    expect(calculateSimpleTdee(1_600, "moderate")).toEqual({
      level: "moderate",
      factor: 1.55,
      bmrKcal: 1_600,
      activityKcal: 880,
      tdeeKcal: 2_480
    });
  });

  it("한 날짜에 서로 다른 직업 활동을 여러 개 합산한다", () => {
    const result = estimateDailyEnergy(
      profile(),
      entry("2026-07-26", {
        jobActivities: [
          {
            id: "clinic",
            templateId: "doctor",
            name: "피부과 진료",
            activityType: "seated",
            hours: 8
          },
          {
            id: "field-trip",
            templateId: "investor",
            name: "기업 탐방",
            activityType: "walking",
            hours: 4
          }
        ]
      })
    );

    expect(result.bmrKcal).toBe(1_750);
    expect(result.baselineActivityKcal).toBe(350);
    expect(result.workKcal).toBe(208);
    expect(result.tdeeKcal).toBe(2_308);
  });

  it("걸음 수와 달리기가 함께 있으면 중복 보정을 적용한다", () => {
    const result = estimateDailyEnergy(
      profile(),
      entry("2026-07-26", {
        steps: 10_000,
        jobActivities: [
          {
            id: "clinic",
            name: "피부과 진료",
            activityType: "standing",
            hours: 4
          }
        ],
        exercises: [
          {
            id: "run",
            name: "달리기",
            category: "running",
            intensity: "moderate",
            durationMinutes: 60
          }
        ]
      })
    );

    expect(result.stepsKcal).toBe(280);
    expect(result.workKcal).toBe(48);
    expect(result.exerciseKcal).toBe(480);
    expect(result.tdeeKcal).toBe(2_908);
    expect(result.assumptions.join(" ")).toContain("중복");
  });

  it("하루 직업 활동 합계가 24시간을 넘으면 거부한다", () => {
    expect(() =>
      validateDailyMetabolismEntry(
        entry("2026-07-26", {
          jobActivities: [
            {
              id: "a",
              name: "진료",
              activityType: "standing",
              hours: 13
            },
            {
              id: "b",
              name: "탐방",
              activityType: "walking",
              hours: 12
            }
          ]
        })
      )
    ).toThrow("24시간");
  });

  it("직업 활동과 운동 시간을 합쳐 하루 24시간을 넘으면 거부한다", () => {
    expect(() =>
      validateDailyMetabolismEntry(
        entry("2026-07-26", {
          jobActivities: [
            {
              id: "clinic",
              name: "진료",
              activityType: "standing",
              hours: 20
            }
          ],
          exercises: [
            {
              id: "run",
              name: "달리기",
              category: "running",
              intensity: "moderate",
              durationMinutes: 300
            }
          ]
        })
      )
    ).toThrow("직업 활동과 운동 시간");
  });

  it("직업 템플릿 ID의 중복을 거부한다", () => {
    const invalid = profile();
    invalid.jobTemplates[1].id = invalid.jobTemplates[0].id;
    expect(() => validateMetabolismProfile(invalid)).toThrow("중복된 ID");
  });
});

describe("개인화 TDEE 학습", () => {
  it("14일이 되기 전에는 부족한 데이터로 안내한다", () => {
    const data = trendEntries(7, () => 80);
    const result = estimatePersonalizedTdee(
      data.entries,
      data.intakeByDate
    );

    expect(result.status).toBe("insufficient");
    expect(result.reason).toContain("7일의 기록이 더 필요");
  });

  it("체중이 유지되면 평균 섭취량을 유지 칼로리로 계산한다", () => {
    const data = trendEntries(14, () => 80);
    const result = estimatePersonalizedTdee(
      data.entries,
      data.intakeByDate,
      { windowDays: 14 }
    );

    expect(result).toMatchObject({
      status: "estimated",
      windowDays: 14,
      averageIntakeKcal: 2_000,
      weightTrendKgPerWeek: 0,
      tdeeKcal: 2_000,
      confidence: "medium"
    });
  });

  it("주당 0.7kg 감소 추세를 에너지 적자로 환산한다", () => {
    const data = trendEntries(14, (day) => 80 - day * 0.1);
    const result = estimatePersonalizedTdee(
      data.entries,
      data.intakeByDate,
      { windowDays: 14 }
    );

    expect(result.status).toBe("estimated");
    expect(result.weightTrendKgPerWeek).toBe(-0.7);
    expect(result.tdeeKcal).toBe(2_770);
  });

  it("28일의 촘촘하고 안정적인 데이터에는 높은 신뢰도를 부여한다", () => {
    const data = trendEntries(28, () => 80, 2_200);
    const result = estimatePersonalizedTdee(
      data.entries,
      data.intakeByDate
    );

    expect(result).toMatchObject({
      status: "estimated",
      windowDays: 28,
      tdeeKcal: 2_200,
      confidence: "high",
      validIntakeDays: 28,
      weightMeasurementDays: 28
    });
    expect(result.lowerKcal).toBeLessThan(2_200);
    expect(result.upperKcal).toBeGreaterThan(2_200);
  });

  it("하루의 비정상적인 체중값이 유지 칼로리를 크게 왜곡하지 않는다", () => {
    const data = trendEntries(28, () => 80);
    data.entries[13].weightKg = 85;

    const result = estimatePersonalizedTdee(
      data.entries,
      data.intakeByDate
    );

    expect(result.status).toBe("estimated");
    expect(result.weightTrendKgPerWeek).toBe(0);
    expect(result.tdeeKcal).toBe(2_000);
  });

  it("식단 완료로 표시한 날짜의 섭취량만 학습한다", () => {
    const data = trendEntries(14, () => 80);
    for (let index = 10; index < 14; index += 1) {
      data.entries[index].dietComplete = false;
      data.intakeByDate[data.entries[index].date] = 9_999;
    }
    const result = estimatePersonalizedTdee(
      data.entries,
      data.intakeByDate,
      { windowDays: 14 }
    );

    expect(result.status).toBe("estimated");
    expect(result.validIntakeDays).toBe(10);
    expect(result.averageIntakeKcal).toBe(2_000);
  });

  it("28일 자료가 불완전하면 충분한 최근 14일 자료로 첫 추정을 제공한다", () => {
    const data = trendEntries(28, () => 80);
    for (let index = 0; index < 14; index += 1) {
      data.entries[index].dietComplete = false;
    }

    const result = estimatePersonalizedTdee(
      data.entries,
      data.intakeByDate
    );

    expect(result).toMatchObject({
      status: "estimated",
      windowDays: 14,
      validIntakeDays: 14,
      tdeeKcal: 2_000
    });
  });

  it("데이터가 적고 흔들릴수록 더 넓은 범위를 반환한다", () => {
    const high = calculateTdeeConfidenceRange(2_400, {
      windowDays: 28,
      validIntakeDays: 28,
      weightMeasurementDays: 28,
      weightSpanDays: 27,
      averageIntakeKcal: 2_400,
      slopeStandardErrorKgPerDay: 0.005,
      weightResidualSdKg: 0.2
    });
    const low = calculateTdeeConfidenceRange(2_400, {
      windowDays: 14,
      validIntakeDays: 10,
      weightMeasurementDays: 7,
      weightSpanDays: 9,
      averageIntakeKcal: 2_400,
      slopeStandardErrorKgPerDay: 0.05,
      weightResidualSdKg: 0.9
    });

    expect(high.confidence).toBe("high");
    expect(low.confidence).toBe("low");
    expect(high.upperKcal - high.lowerKcal).toBeLessThan(
      low.upperKcal - low.lowerKcal
    );
  });
});
