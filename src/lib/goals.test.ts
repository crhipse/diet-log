import type {
  GoalPlan,
  GoalRecommendationInput,
  GoalType
} from "./goals";
import {
  calculateCalorieSafetyBounds,
  calculateDailyCalorieRange,
  calculateGoalRecommendation,
  calculateProteinMinimum,
  calculateWeeklyCalorieBudget,
  detectRecommendationChangeForNewTdee,
  GOAL_CALORIE_ADJUSTMENTS,
  GOAL_SAFETY_LIMITS,
  PROTEIN_GRAMS_PER_KG,
  RECOMMENDATION_CHANGE_THRESHOLDS,
  RESISTANCE_TRAINING_PROTEIN_GRAMS_PER_KG,
  validateGoalPlan
} from "./goals";

function plan(update: Partial<GoalPlan> = {}): GoalPlan {
  return {
    goalType: "fat_loss",
    pace: "moderate",
    resistanceTrainingDaysPerWeek: 3,
    ...update
  };
}

function input(
  update: Partial<GoalRecommendationInput> = {}
): GoalRecommendationInput {
  return {
    tdeeKcal: 2_000,
    weightKg: 80,
    plan: plan(),
    ...update
  };
}

describe("목표 설정 검증", () => {
  it("지원하는 목표 유형과 속도를 모두 허용한다", () => {
    const goalTypes: GoalType[] = [
      "fat_loss",
      "maintenance_recomp",
      "lean_mass_gain",
      "bulk"
    ];

    for (const goalType of goalTypes) {
      for (const pace of ["gentle", "moderate", "fast"] as const) {
        expect(() =>
          validateGoalPlan(plan({ goalType, pace }))
        ).not.toThrow();
      }
    }
    expect(() =>
      validateGoalPlan(
        plan({ goalType: "custom", customDailyKcal: 1_900 })
      )
    ).not.toThrow();
  });

  it("직접 설정 목표에는 일일 칼로리를 반드시 요구한다", () => {
    expect(() =>
      validateGoalPlan(plan({ goalType: "custom" }))
    ).toThrow("일일 칼로리");
  });

  it("근력운동 일수는 0~7 사이 정수만 허용한다", () => {
    expect(() =>
      validateGoalPlan(
        plan({ resistanceTrainingDaysPerWeek: 2.5 })
      )
    ).toThrow("정수");
    expect(() =>
      validateGoalPlan(
        plan({ resistanceTrainingDaysPerWeek: 8 })
      )
    ).toThrow("7");
  });

  it("실재하지 않는 목표 날짜를 거부한다", () => {
    expect(() =>
      validateGoalPlan(plan({ targetDate: "2026-02-29" }))
    ).toThrow("날짜");
    expect(() =>
      validateGoalPlan(plan({ targetDate: "26-07-26" }))
    ).toThrow("YYYY-MM-DD");
  });

  it("비현실적인 목표 체중과 직접 설정값을 거부한다", () => {
    expect(() =>
      validateGoalPlan(plan({ targetWeightKg: 20 }))
    ).toThrow("목표 체중");
    expect(() =>
      validateGoalPlan(
        plan({ goalType: "custom", customDailyKcal: 1_190 })
      )
    ).toThrow("직접 설정 칼로리");
    expect(() =>
      validateGoalPlan(
        plan({ goalType: "custom", customDailyKcal: 1_200 })
      )
    ).not.toThrow();
    expect(() =>
      validateGoalPlan(plan({ customProteinMinimumG: 501 }))
    ).toThrow("직접 설정 단백질");
  });
});

describe("일일 칼로리 권장 범위", () => {
  it("비율 가정을 공개 상수로 고정한다", () => {
    expect(GOAL_CALORIE_ADJUSTMENTS.fat_loss.moderate).toEqual({
      min: -0.18,
      target: -0.15,
      max: -0.12
    });
    expect(GOAL_CALORIE_ADJUSTMENTS.lean_mass_gain.moderate).toEqual({
      min: 0.05,
      target: 0.08,
      max: 0.11
    });
    expect(GOAL_SAFETY_LIMITS.maximumDeficitRatio).toBe(0.25);
    expect(GOAL_SAFETY_LIMITS.maximumSurplusRatio).toBe(0.25);
    expect(GOAL_SAFETY_LIMITS.maximumDailyDeficitKcal).toBe(750);
    expect(GOAL_SAFETY_LIMITS.maximumDailySurplusKcal).toBe(750);
  });

  it.each([
    ["gentle", { minKcal: 1_760, targetKcal: 1_800, maxKcal: 1_840 }],
    ["moderate", { minKcal: 1_640, targetKcal: 1_700, maxKcal: 1_760 }],
    ["fast", { minKcal: 1_540, targetKcal: 1_600, maxKcal: 1_660 }]
  ] as const)(
    "감량 %s 속도에 맞는 범위를 계산한다",
    (pace, expected) => {
      expect(
        calculateDailyCalorieRange({
          ...input(),
          plan: plan({ pace })
        })
      ).toEqual(expected);
    }
  );

  it("유지·리컴프는 속도와 무관하게 TDEE 전후 3%를 권장한다", () => {
    for (const pace of ["gentle", "moderate", "fast"] as const) {
      expect(
        calculateDailyCalorieRange({
          ...input(),
          plan: plan({ goalType: "maintenance_recomp", pace })
        })
      ).toEqual({
        minKcal: 1_940,
        targetKcal: 2_000,
        maxKcal: 2_060
      });
    }
  });

  it("린매스업 보통 속도에 5~11% 흑자를 적용한다", () => {
    expect(
      calculateDailyCalorieRange({
        ...input(),
        plan: plan({ goalType: "lean_mass_gain" })
      })
    ).toEqual({
      minKcal: 2_100,
      targetKcal: 2_160,
      maxKcal: 2_220
    });
  });

  it("벌크업 빠른 속도에 17~23% 흑자를 적용한다", () => {
    expect(
      calculateDailyCalorieRange({
        ...input(),
        plan: plan({ goalType: "bulk", pace: "fast" })
      })
    ).toEqual({
      minKcal: 2_340,
      targetKcal: 2_400,
      maxKcal: 2_460
    });
  });

  it("직접 설정 칼로리는 단일 목표값으로 사용한다", () => {
    expect(
      calculateDailyCalorieRange({
        ...input(),
        plan: plan({
          goalType: "custom",
          customDailyKcal: 1_805
        })
      })
    ).toEqual({
      minKcal: 1_810,
      targetKcal: 1_810,
      maxKcal: 1_810
    });
  });

  it("과도한 적자와 흑자는 TDEE ±25% 범위로 방어한다", () => {
    expect(calculateCalorieSafetyBounds(2_000)).toEqual({
      floorKcal: 1_500,
      ceilingKcal: 2_500
    });
    expect(
      calculateDailyCalorieRange({
        ...input(),
        plan: plan({
          goalType: "custom",
          customDailyKcal: 1_200
        })
      })
    ).toEqual({
      minKcal: 1_500,
      targetKcal: 1_500,
      maxKcal: 1_500
    });
    expect(
      calculateDailyCalorieRange({
        ...input(),
        plan: plan({
          goalType: "custom",
          customDailyKcal: 5_000
        })
      })
    ).toEqual({
      minKcal: 2_500,
      targetKcal: 2_500,
      maxKcal: 2_500
    });
  });

  it("고열량 TDEE에는 하루 750kcal 절대 적자·잉여 한계를 우선한다", () => {
    expect(calculateCalorieSafetyBounds(4_000)).toEqual({
      floorKcal: 3_250,
      ceilingKcal: 4_750
    });
    expect(
      calculateDailyCalorieRange({
        tdeeKcal: 4_000,
        weightKg: 80,
        plan: plan({ pace: "fast" })
      })
    ).toEqual({
      minKcal: 3_250,
      targetKcal: 3_250,
      maxKcal: 3_320
    });
    expect(
      calculateDailyCalorieRange({
        tdeeKcal: 4_000,
        weightKg: 80,
        plan: plan({ goalType: "bulk", pace: "fast" })
      })
    ).toEqual({
      minKcal: 4_680,
      targetKcal: 4_750,
      maxKcal: 4_750
    });
  });

  it("성인 안전 하한보다 낮은 TDEE는 추천하지 않는다", () => {
    expect(GOAL_SAFETY_LIMITS.minimumValidTdeeKcal).toBe(1_200);
    expect(() => calculateCalorieSafetyBounds(1_190)).toThrow("1200");
    expect(calculateCalorieSafetyBounds(1_200)).toEqual({
      floorKcal: 1_200,
      ceilingKcal: 1_500
    });
  });

  it("허용 가능한 최대 TDEE에서 칼로리 상한을 10,000kcal로 유지한다", () => {
    expect(calculateCalorieSafetyBounds(10_000)).toEqual({
      floorKcal: 9_250,
      ceilingKcal: 10_000
    });
  });
});

describe("단백질 최소량과 주간 예산", () => {
  it("근력운동이 없으면 보수적인 1.2g/kg을 5g 단위로 올림한다", () => {
    expect(PROTEIN_GRAMS_PER_KG).toEqual({
      fat_loss: 1.2,
      maintenance_recomp: 1.2,
      lean_mass_gain: 1.2,
      bulk: 1.2,
      custom: 1.2
    });
    expect(calculateProteinMinimum(80, "fat_loss")).toBe(100);
    expect(calculateProteinMinimum(80, "maintenance_recomp")).toBe(100);
    expect(calculateProteinMinimum(80, "lean_mass_gain")).toBe(100);
  });

  it("근력운동 계획이 있으면 감량을 포함해 1.6g/kg을 사용한다", () => {
    expect(RESISTANCE_TRAINING_PROTEIN_GRAMS_PER_KG).toBe(1.6);
    expect(calculateProteinMinimum(80, "fat_loss", undefined, 1)).toBe(130);
    expect(
      calculateProteinMinimum(80, "maintenance_recomp", undefined, 3)
    ).toBe(130);
    expect(calculateProteinMinimum(80, "bulk", undefined, 7)).toBe(130);
  });

  it("고체중 사용자는 단백질 계산 기준 체중을 120kg으로 제한한다", () => {
    expect(calculateProteinMinimum(200, "fat_loss")).toBe(145);
    expect(calculateProteinMinimum(200, "fat_loss", undefined, 3)).toBe(195);
  });

  it("직접 설정 단백질은 40g과 체중×2.2g의 동적 상한 사이로 제한한다", () => {
    expect(calculateProteinMinimum(80, "custom", 20)).toBe(40);
    expect(calculateProteinMinimum(80, "custom", 500)).toBe(175);
    expect(calculateProteinMinimum(200, "custom", 500)).toBe(240);
    expect(calculateProteinMinimum(30, "custom", 500)).toBe(65);
  });

  it("일일 범위를 7배 해 주간 칼로리 예산을 계산한다", () => {
    expect(
      calculateWeeklyCalorieBudget({
        minKcal: 1_640,
        targetKcal: 1_700,
        maxKcal: 1_760
      })
    ).toEqual({
      minKcal: 11_480,
      targetKcal: 11_900,
      maxKcal: 12_320
    });
  });

  it("순서가 뒤집힌 일일 범위를 거부한다", () => {
    expect(() =>
      calculateWeeklyCalorieBudget({
        minKcal: 1_800,
        targetKcal: 1_700,
        maxKcal: 1_600
      })
    ).toThrow("최소, 목표, 최대");
  });
});

describe("통합 목표 권장안", () => {
  it("감량 권장안에 일일·주간 목표와 단백질 최소량을 함께 담는다", () => {
    expect(calculateGoalRecommendation(input())).toMatchObject({
      goalType: "fat_loss",
      pace: "moderate",
      tdeeKcal: 2_000,
      dailyCalories: {
        minKcal: 1_640,
        targetKcal: 1_700,
        maxKcal: 1_760
      },
      weeklyCalories: {
        minKcal: 11_480,
        targetKcal: 11_900,
        maxKcal: 12_320
      },
      proteinMinimumG: 130,
      dailyAdjustmentKcal: -300,
      adjustmentPercent: -15,
      safetyAdjusted: false
    });
  });

  it("직접 설정값이 안전 범위에 의해 조정됐음을 표시한다", () => {
    const result = calculateGoalRecommendation({
      ...input(),
      plan: plan({
        goalType: "custom",
        customDailyKcal: 1_200,
        customProteinMinimumG: 20
      })
    });

    expect(result.safetyAdjusted).toBe(true);
    expect(result.dailyCalories.targetKcal).toBe(1_500);
    expect(result.proteinMinimumG).toBe(40);
    expect(result.assumptions.join(" ")).toContain("안전 한계");
  });

  it("근력운동 유무를 단백질 최소량과 설명에 반영한다", () => {
    const withoutTraining = calculateGoalRecommendation({
      ...input(),
      plan: plan({ resistanceTrainingDaysPerWeek: 0 })
    });
    const withTraining = calculateGoalRecommendation(input());

    expect(withoutTraining.proteinMinimumG).toBe(100);
    expect(withTraining.proteinMinimumG).toBe(130);
    expect(withoutTraining.assumptions.join(" ")).toContain(
      "근력운동 계획이 없어"
    );
    expect(withTraining.assumptions.join(" ")).toContain(
      "주 3일 근력운동 계획"
    );
  });

  it("하루 750kcal 적자 한계가 적용된 사실을 권장안에 표시한다", () => {
    const result = calculateGoalRecommendation({
      tdeeKcal: 4_000,
      weightKg: 80,
      plan: plan({ pace: "fast" })
    });

    expect(result.dailyCalories.targetKcal).toBe(3_250);
    expect(result.dailyAdjustmentKcal).toBe(-750);
    expect(result.safetyAdjusted).toBe(true);
    expect(result.assumptions.join(" ")).toContain("하루 750kcal");
    expect(result.assumptions.join(" ")).toContain("안전 한계를 넘어 조정");
  });

  it("직접 설정 단백질의 체중 기반 상한을 설명한다", () => {
    const result = calculateGoalRecommendation({
      ...input(),
      plan: plan({
        goalType: "custom",
        customDailyKcal: 1_800,
        customProteinMinimumG: 500
      })
    });

    expect(result.proteinMinimumG).toBe(175);
    expect(result.safetyAdjusted).toBe(true);
    expect(result.assumptions.join(" ")).toContain("40~175g 안전 한계");
    expect(result.assumptions.join(" ")).toContain("1kg당 2.2g");
  });
});

describe("새 TDEE에 따른 권장 변경 감지", () => {
  const detectionInput = (
    newTdeeKcal: number,
    previousTdeeKcal = 2_000
  ) => ({
    previousTdeeKcal,
    newTdeeKcal,
    weightKg: 80,
    plan: plan()
  });

  it("100kcal와 5% 미만 변화에는 변경을 권장하지 않는다", () => {
    expect(
      detectRecommendationChangeForNewTdee(
        detectionInput(2_099)
      )
    ).toMatchObject({
      shouldUpdate: false,
      direction: "increase",
      reason: "below_threshold",
      tdeeDeltaKcal: 99
    });
  });

  it("정확히 100kcal 또는 5% 변화부터 변경을 권장한다", () => {
    expect(RECOMMENDATION_CHANGE_THRESHOLDS).toEqual({
      absoluteKcal: 100,
      relativeRatio: 0.05
    });
    expect(
      detectRecommendationChangeForNewTdee(
        detectionInput(2_100)
      )
    ).toMatchObject({
      shouldUpdate: true,
      reason: "both_thresholds",
      tdeeDeltaKcal: 100,
      tdeeDeltaPercent: 5
    });
  });

  it("100kcal 미만이어도 5% 이상이면 변경을 권장한다", () => {
    expect(
      detectRecommendationChangeForNewTdee({
        ...detectionInput(1_995, 1_900)
      })
    ).toMatchObject({
      shouldUpdate: true,
      reason: "relative_threshold",
      tdeeDeltaKcal: 95,
      tdeeDeltaPercent: 5
    });
  });

  it("TDEE 감소 방향과 새 목표 칼로리를 함께 반환한다", () => {
    expect(
      detectRecommendationChangeForNewTdee(
        detectionInput(1_800)
      )
    ).toMatchObject({
      shouldUpdate: true,
      direction: "decrease",
      reason: "both_thresholds",
      previousTargetKcal: 1_700,
      newTargetKcal: 1_530,
      targetDeltaKcal: -170
    });
  });

  it("TDEE가 같으면 변경 없음으로 분류한다", () => {
    expect(
      detectRecommendationChangeForNewTdee(
        detectionInput(2_000)
      )
    ).toMatchObject({
      shouldUpdate: false,
      direction: "none",
      reason: "unchanged",
      tdeeDeltaKcal: 0,
      tdeeDeltaPercent: 0
    });
  });

  it("직접 설정 목표도 TDEE 자체의 의미 있는 변화는 감지한다", () => {
    const result = detectRecommendationChangeForNewTdee({
      ...detectionInput(2_100),
      plan: plan({
        goalType: "custom",
        customDailyKcal: 1_800
      })
    });

    expect(result.shouldUpdate).toBe(true);
    expect(result.previousTargetKcal).toBe(1_800);
    expect(result.newTargetKcal).toBe(1_800);
    expect(result.targetDeltaKcal).toBe(0);
  });
});
