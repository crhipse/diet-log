export type GoalType =
  | "fat_loss"
  | "maintenance_recomp"
  | "lean_mass_gain"
  | "bulk"
  | "custom";

export type GoalPace = "gentle" | "moderate" | "fast";

export interface GoalPlan {
  goalType: GoalType;
  pace: GoalPace;
  resistanceTrainingDaysPerWeek: number;
  targetWeightKg?: number;
  targetDate?: string;
  /** Required when goalType is "custom". */
  customDailyKcal?: number;
  /** Optional override; safety limits still apply. */
  customProteinMinimumG?: number;
}

export interface GoalRecommendationInput {
  tdeeKcal: number;
  weightKg: number;
  plan: GoalPlan;
}

export interface DailyCalorieRange {
  minKcal: number;
  targetKcal: number;
  maxKcal: number;
}

export interface WeeklyCalorieBudget {
  minKcal: number;
  targetKcal: number;
  maxKcal: number;
}

export interface GoalRecommendation {
  goalType: GoalType;
  pace: GoalPace;
  tdeeKcal: number;
  weightKg: number;
  dailyCalories: DailyCalorieRange;
  weeklyCalories: WeeklyCalorieBudget;
  proteinMinimumG: number;
  dailyAdjustmentKcal: number;
  /** Percentage points relative to TDEE. For example, -15 means 15% below. */
  adjustmentPercent: number;
  safetyFloorKcal: number;
  safetyCeilingKcal: number;
  safetyAdjusted: boolean;
  assumptions: string[];
}

export interface TdeeChangeDetectionInput {
  previousTdeeKcal: number;
  newTdeeKcal: number;
  weightKg: number;
  plan: GoalPlan;
}

export type TdeeChangeReason =
  | "absolute_threshold"
  | "relative_threshold"
  | "both_thresholds"
  | "below_threshold"
  | "unchanged";

export interface TdeeRecommendationChange {
  shouldUpdate: boolean;
  direction: "increase" | "decrease" | "none";
  reason: TdeeChangeReason;
  tdeeDeltaKcal: number;
  tdeeDeltaPercent: number;
  previousTargetKcal: number;
  newTargetKcal: number;
  targetDeltaKcal: number;
  recommendation: GoalRecommendation;
}

interface AdjustmentRange {
  min: number;
  target: number;
  max: number;
}

/**
 * Fractions of TDEE used for each recommendation.
 *
 * The minimum and maximum values describe the displayed calorie range; the
 * target is the center recommendation. Maintenance/recomposition deliberately
 * ignores pace because a large deficit or surplus would no longer be a
 * maintenance-oriented goal.
 */
export const GOAL_CALORIE_ADJUSTMENTS = {
  fat_loss: {
    gentle: { min: -0.12, target: -0.1, max: -0.08 },
    moderate: { min: -0.18, target: -0.15, max: -0.12 },
    fast: { min: -0.23, target: -0.2, max: -0.17 }
  },
  maintenance_recomp: {
    gentle: { min: -0.03, target: 0, max: 0.03 },
    moderate: { min: -0.03, target: 0, max: 0.03 },
    fast: { min: -0.03, target: 0, max: 0.03 }
  },
  lean_mass_gain: {
    gentle: { min: 0.03, target: 0.05, max: 0.07 },
    moderate: { min: 0.05, target: 0.08, max: 0.11 },
    fast: { min: 0.08, target: 0.12, max: 0.15 }
  },
  bulk: {
    gentle: { min: 0.08, target: 0.1, max: 0.12 },
    moderate: { min: 0.12, target: 0.15, max: 0.18 },
    fast: { min: 0.17, target: 0.2, max: 0.23 }
  }
} as const satisfies Record<
  Exclude<GoalType, "custom">,
  Record<GoalPace, AdjustmentRange>
>;

/**
 * Conservative daily protein floors for plans without resistance training.
 * A separate 1.6 g/kg rate is used when the plan includes resistance
 * training. The goal-keyed shape is retained for API compatibility.
 */
export const PROTEIN_GRAMS_PER_KG = {
  fat_loss: 1.2,
  maintenance_recomp: 1.2,
  lean_mass_gain: 1.2,
  bulk: 1.2,
  custom: 1.2
} as const satisfies Record<GoalType, number>;

export const RESISTANCE_TRAINING_PROTEIN_GRAMS_PER_KG = 1.6;

export const GOAL_SAFETY_LIMITS = {
  minimumValidTdeeKcal: 1_200,
  maximumValidTdeeKcal: 10_000,
  minimumWeightKg: 30,
  maximumWeightKg: 350,
  absoluteMinimumDailyKcal: 1_200,
  maximumDeficitRatio: 0.25,
  maximumSurplusRatio: 0.25,
  maximumDailyDeficitKcal: 750,
  maximumDailySurplusKcal: 750,
  minimumProteinG: 40,
  maximumProteinG: 240,
  maximumCustomProteinGPerKg: 2.2,
  proteinReferenceWeightCapKg: 120,
  maximumResistanceTrainingDaysPerWeek: 7
} as const;

export const RECOMMENDATION_CHANGE_THRESHOLDS = {
  absoluteKcal: 100,
  relativeRatio: 0.05
} as const;

const GOAL_TYPES = new Set<GoalType>([
  "fat_loss",
  "maintenance_recomp",
  "lean_mass_gain",
  "bulk",
  "custom"
]);
const GOAL_PACES = new Set<GoalPace>(["gentle", "moderate", "fast"]);

function assertFiniteInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label}은(는) ${minimum}부터 ${maximum} 사이여야 합니다.`
    );
  }
}

function assertTdee(tdeeKcal: number, label = "TDEE(kcal)"): void {
  assertFiniteInRange(
    tdeeKcal,
    GOAL_SAFETY_LIMITS.minimumValidTdeeKcal,
    GOAL_SAFETY_LIMITS.maximumValidTdeeKcal,
    label
  );
}

function assertWeight(weightKg: number): void {
  assertFiniteInRange(
    weightKg,
    GOAL_SAFETY_LIMITS.minimumWeightKg,
    GOAL_SAFETY_LIMITS.maximumWeightKg,
    "체중(kg)"
  );
}

function isValidDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function roundKcal(value: number): number {
  return Math.round(value / 10) * 10;
}

function roundProteinUp(value: number): number {
  return Math.ceil(value / 5) * 5;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertResistanceTrainingDays(daysPerWeek: number): void {
  if (
    !Number.isInteger(daysPerWeek) ||
    daysPerWeek < 0 ||
    daysPerWeek > GOAL_SAFETY_LIMITS.maximumResistanceTrainingDaysPerWeek
  ) {
    throw new RangeError(
      `근력운동 일수는 0부터 ${GOAL_SAFETY_LIMITS.maximumResistanceTrainingDaysPerWeek} 사이의 정수여야 합니다.`
    );
  }
}

function proteinRateForPlan(
  goalType: GoalType,
  resistanceTrainingDaysPerWeek: number
): number {
  return resistanceTrainingDaysPerWeek > 0
    ? RESISTANCE_TRAINING_PROTEIN_GRAMS_PER_KG
    : PROTEIN_GRAMS_PER_KG[goalType];
}

function customProteinMaximumG(weightKg: number): number {
  const referenceWeightKg = Math.min(
    weightKg,
    GOAL_SAFETY_LIMITS.proteinReferenceWeightCapKg
  );
  const weightBasedMaximum =
    referenceWeightKg * GOAL_SAFETY_LIMITS.maximumCustomProteinGPerKg;
  const rawMaximum = Math.min(
    GOAL_SAFETY_LIMITS.maximumProteinG,
    weightBasedMaximum
  );
  // Protein recommendations are displayed in 5 g increments and must not
  // round above the evidence-based upper guard.
  return Math.max(
    GOAL_SAFETY_LIMITS.minimumProteinG,
    Math.floor(rawMaximum / 5) * 5
  );
}

export function validateGoalPlan(plan: GoalPlan): void {
  if (!GOAL_TYPES.has(plan.goalType)) {
    throw new Error("목표 유형을 올바르게 선택해 주세요.");
  }
  if (!GOAL_PACES.has(plan.pace)) {
    throw new Error("목표 속도를 올바르게 선택해 주세요.");
  }
  assertResistanceTrainingDays(plan.resistanceTrainingDaysPerWeek);
  if (plan.targetWeightKg !== undefined) {
    assertFiniteInRange(
      plan.targetWeightKg,
      GOAL_SAFETY_LIMITS.minimumWeightKg,
      GOAL_SAFETY_LIMITS.maximumWeightKg,
      "목표 체중(kg)"
    );
  }
  if (plan.targetDate !== undefined && !isValidDateKey(plan.targetDate)) {
    throw new Error("목표 날짜는 YYYY-MM-DD 형식의 올바른 날짜여야 합니다.");
  }
  if (plan.customDailyKcal !== undefined) {
    assertFiniteInRange(
      plan.customDailyKcal,
      GOAL_SAFETY_LIMITS.minimumValidTdeeKcal,
      GOAL_SAFETY_LIMITS.maximumValidTdeeKcal,
      "직접 설정 칼로리(kcal)"
    );
  }
  if (plan.goalType === "custom" && plan.customDailyKcal === undefined) {
    throw new Error("직접 설정 목표에는 일일 칼로리가 필요합니다.");
  }
  if (plan.customProteinMinimumG !== undefined) {
    assertFiniteInRange(
      plan.customProteinMinimumG,
      1,
      500,
      "직접 설정 단백질(g)"
    );
  }
}

export function calculateCalorieSafetyBounds(tdeeKcal: number): {
  floorKcal: number;
  ceilingKcal: number;
} {
  assertTdee(tdeeKcal);
  const roundedTdee = roundKcal(tdeeKcal);
  const ratioDeficitFloor = roundKcal(
    tdeeKcal * (1 - GOAL_SAFETY_LIMITS.maximumDeficitRatio)
  );
  const absoluteDeficitFloor =
    roundedTdee - GOAL_SAFETY_LIMITS.maximumDailyDeficitKcal;
  const floorKcal = Math.min(
    roundedTdee,
    Math.max(
      GOAL_SAFETY_LIMITS.absoluteMinimumDailyKcal,
      ratioDeficitFloor,
      absoluteDeficitFloor
    )
  );
  const ratioSurplusCeiling = roundKcal(
    tdeeKcal * (1 + GOAL_SAFETY_LIMITS.maximumSurplusRatio)
  );
  const absoluteSurplusCeiling =
    roundedTdee + GOAL_SAFETY_LIMITS.maximumDailySurplusKcal;
  const ceilingKcal = Math.min(
    GOAL_SAFETY_LIMITS.maximumValidTdeeKcal,
    Math.max(
      roundedTdee,
      Math.min(ratioSurplusCeiling, absoluteSurplusCeiling)
    )
  );
  return { floorKcal, ceilingKcal };
}

function unboundedCalorieRange(
  tdeeKcal: number,
  plan: GoalPlan
): DailyCalorieRange {
  if (plan.goalType === "custom") {
    const targetKcal = roundKcal(plan.customDailyKcal!);
    return { minKcal: targetKcal, targetKcal, maxKcal: targetKcal };
  }
  const adjustment = GOAL_CALORIE_ADJUSTMENTS[plan.goalType][plan.pace];
  return {
    minKcal: roundKcal(tdeeKcal * (1 + adjustment.min)),
    targetKcal: roundKcal(tdeeKcal * (1 + adjustment.target)),
    maxKcal: roundKcal(tdeeKcal * (1 + adjustment.max))
  };
}

export function calculateDailyCalorieRange(
  input: GoalRecommendationInput
): DailyCalorieRange {
  assertTdee(input.tdeeKcal);
  assertWeight(input.weightKg);
  validateGoalPlan(input.plan);

  const raw = unboundedCalorieRange(input.tdeeKcal, input.plan);
  const safety = calculateCalorieSafetyBounds(input.tdeeKcal);
  const minKcal = clamp(raw.minKcal, safety.floorKcal, safety.ceilingKcal);
  const targetKcal = clamp(
    raw.targetKcal,
    safety.floorKcal,
    safety.ceilingKcal
  );
  const maxKcal = clamp(raw.maxKcal, safety.floorKcal, safety.ceilingKcal);
  return {
    minKcal: Math.min(minKcal, targetKcal, maxKcal),
    targetKcal,
    maxKcal: Math.max(minKcal, targetKcal, maxKcal)
  };
}

export function calculateProteinMinimum(
  weightKg: number,
  goalType: GoalType,
  customProteinMinimumG?: number,
  resistanceTrainingDaysPerWeek = 0
): number {
  assertWeight(weightKg);
  if (!GOAL_TYPES.has(goalType)) {
    throw new Error("목표 유형을 올바르게 선택해 주세요.");
  }
  assertResistanceTrainingDays(resistanceTrainingDaysPerWeek);
  if (customProteinMinimumG !== undefined) {
    assertFiniteInRange(
      customProteinMinimumG,
      1,
      500,
      "직접 설정 단백질(g)"
    );
  }

  const referenceWeightKg = Math.min(
    weightKg,
    GOAL_SAFETY_LIMITS.proteinReferenceWeightCapKg
  );
  const calculated =
    customProteinMinimumG ??
    referenceWeightKg *
      proteinRateForPlan(goalType, resistanceTrainingDaysPerWeek);
  const maximumProteinG =
    customProteinMinimumG === undefined
      ? GOAL_SAFETY_LIMITS.maximumProteinG
      : customProteinMaximumG(weightKg);
  return roundProteinUp(
    clamp(
      calculated,
      GOAL_SAFETY_LIMITS.minimumProteinG,
      maximumProteinG
    )
  );
}

export function calculateWeeklyCalorieBudget(
  dailyCalories: DailyCalorieRange
): WeeklyCalorieBudget {
  for (const [label, value] of [
    ["최소 일일 칼로리", dailyCalories.minKcal],
    ["목표 일일 칼로리", dailyCalories.targetKcal],
    ["최대 일일 칼로리", dailyCalories.maxKcal]
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${label}은(는) 0 이상의 숫자여야 합니다.`);
    }
  }
  if (
    dailyCalories.minKcal > dailyCalories.targetKcal ||
    dailyCalories.targetKcal > dailyCalories.maxKcal
  ) {
    throw new RangeError(
      "일일 칼로리 범위는 최소, 목표, 최대 순서여야 합니다."
    );
  }
  return {
    minKcal: Math.round(dailyCalories.minKcal * 7),
    targetKcal: Math.round(dailyCalories.targetKcal * 7),
    maxKcal: Math.round(dailyCalories.maxKcal * 7)
  };
}

export function calculateGoalRecommendation(
  input: GoalRecommendationInput
): GoalRecommendation {
  assertTdee(input.tdeeKcal);
  assertWeight(input.weightKg);
  validateGoalPlan(input.plan);

  const rawRange = unboundedCalorieRange(input.tdeeKcal, input.plan);
  const dailyCalories = calculateDailyCalorieRange(input);
  const proteinMinimumG = calculateProteinMinimum(
    input.weightKg,
    input.plan.goalType,
    input.plan.customProteinMinimumG,
    input.plan.resistanceTrainingDaysPerWeek
  );
  const defaultProteinG = calculateProteinMinimum(
    input.weightKg,
    input.plan.goalType,
    undefined,
    input.plan.resistanceTrainingDaysPerWeek
  );
  const proteinRate = proteinRateForPlan(
    input.plan.goalType,
    input.plan.resistanceTrainingDaysPerWeek
  );
  const customProteinCeilingG = customProteinMaximumG(input.weightKg);
  const safety = calculateCalorieSafetyBounds(input.tdeeKcal);
  const calorieSafetyAdjusted =
    rawRange.minKcal !== dailyCalories.minKcal ||
    rawRange.targetKcal !== dailyCalories.targetKcal ||
    rawRange.maxKcal !== dailyCalories.maxKcal;
  const proteinSafetyAdjusted =
    input.plan.customProteinMinimumG !== undefined &&
    proteinMinimumG !== roundProteinUp(input.plan.customProteinMinimumG);
  const dailyAdjustmentKcal =
    dailyCalories.targetKcal - roundKcal(input.tdeeKcal);
  const adjustmentPercent =
    Math.round(
      ((dailyCalories.targetKcal - input.tdeeKcal) / input.tdeeKcal) *
        1_000
    ) / 10;
  const assumptions = [
    "일일 칼로리는 현재 TDEE를 기준으로 10kcal 단위로 반올림했습니다.",
    `칼로리 권장 범위는 하루 최소 ${GOAL_SAFETY_LIMITS.absoluteMinimumDailyKcal}kcal, TDEE 대비 최대 ${GOAL_SAFETY_LIMITS.maximumDeficitRatio * 100}% 및 하루 ${GOAL_SAFETY_LIMITS.maximumDailyDeficitKcal}kcal 이내의 적자 제한을 적용했습니다.`,
    `칼로리 잉여는 TDEE 대비 최대 ${GOAL_SAFETY_LIMITS.maximumSurplusRatio * 100}% 및 하루 ${GOAL_SAFETY_LIMITS.maximumDailySurplusKcal}kcal 이내로 제한했습니다.`,
    `단백질 계산 기준 체중은 최대 ${GOAL_SAFETY_LIMITS.proteinReferenceWeightCapKg}kg으로 제한했습니다.`
  ];
  if (input.plan.customProteinMinimumG === undefined) {
    assumptions.push(
      `단백질 최소량은 ${
        input.plan.resistanceTrainingDaysPerWeek > 0
          ? `주 ${input.plan.resistanceTrainingDaysPerWeek}일 근력운동 계획을 반영해`
          : "근력운동 계획이 없어"
      } 기준 체중 1kg당 ${proteinRate}g으로 계산했습니다.`
    );
  } else {
    assumptions.push(
      `직접 설정 단백질은 기준 체중 1kg당 ${GOAL_SAFETY_LIMITS.maximumCustomProteinGPerKg}g과 ${GOAL_SAFETY_LIMITS.maximumProteinG}g 중 낮은 상한을 적용했습니다.`
    );
  }
  if (input.plan.goalType === "maintenance_recomp") {
    assumptions.push(
      "유지·리컴프는 속도와 관계없이 TDEE 전후 3% 범위를 사용합니다."
    );
  }
  if (input.plan.goalType === "custom") {
    assumptions.push("직접 설정한 칼로리는 권장 범위의 단일 목표로 사용했습니다.");
  }
  if (calorieSafetyAdjusted) {
    assumptions.push(
      "계산된 칼로리 범위가 적자·잉여 안전 한계를 넘어 조정했습니다."
    );
  }
  if (proteinSafetyAdjusted) {
    assumptions.push(
      `직접 설정 단백질에 ${GOAL_SAFETY_LIMITS.minimumProteinG}~${customProteinCeilingG}g 안전 한계를 적용했습니다.`
    );
  } else if (
    input.plan.customProteinMinimumG !== undefined &&
    proteinMinimumG !== defaultProteinG
  ) {
    assumptions.push("직접 설정한 단백질 최소량을 적용했습니다.");
  }

  return {
    goalType: input.plan.goalType,
    pace: input.plan.pace,
    tdeeKcal: roundKcal(input.tdeeKcal),
    weightKg: input.weightKg,
    dailyCalories,
    weeklyCalories: calculateWeeklyCalorieBudget(dailyCalories),
    proteinMinimumG,
    dailyAdjustmentKcal,
    adjustmentPercent,
    safetyFloorKcal: safety.floorKcal,
    safetyCeilingKcal: safety.ceilingKcal,
    safetyAdjusted: calorieSafetyAdjusted || proteinSafetyAdjusted,
    assumptions
  };
}

export function detectRecommendationChangeForNewTdee(
  input: TdeeChangeDetectionInput
): TdeeRecommendationChange {
  assertTdee(input.previousTdeeKcal, "이전 TDEE(kcal)");
  assertTdee(input.newTdeeKcal, "새 TDEE(kcal)");
  assertWeight(input.weightKg);
  validateGoalPlan(input.plan);

  const previous = calculateGoalRecommendation({
    tdeeKcal: input.previousTdeeKcal,
    weightKg: input.weightKg,
    plan: input.plan
  });
  const recommendation = calculateGoalRecommendation({
    tdeeKcal: input.newTdeeKcal,
    weightKg: input.weightKg,
    plan: input.plan
  });
  const rawTdeeDeltaKcal =
    input.newTdeeKcal - input.previousTdeeKcal;
  const tdeeDeltaKcal = Math.round(rawTdeeDeltaKcal);
  const absoluteThresholdMet =
    Math.abs(rawTdeeDeltaKcal) >=
    RECOMMENDATION_CHANGE_THRESHOLDS.absoluteKcal;
  const rawRelativeChange =
    Math.abs(rawTdeeDeltaKcal) /
    input.previousTdeeKcal;
  const relativeThresholdMet =
    rawRelativeChange >= RECOMMENDATION_CHANGE_THRESHOLDS.relativeRatio;
  const shouldUpdate = absoluteThresholdMet || relativeThresholdMet;

  let reason: TdeeChangeReason;
  if (rawTdeeDeltaKcal === 0) reason = "unchanged";
  else if (absoluteThresholdMet && relativeThresholdMet) {
    reason = "both_thresholds";
  } else if (absoluteThresholdMet) reason = "absolute_threshold";
  else if (relativeThresholdMet) reason = "relative_threshold";
  else reason = "below_threshold";

  return {
    shouldUpdate,
    direction:
      rawTdeeDeltaKcal > 0
        ? "increase"
        : rawTdeeDeltaKcal < 0
          ? "decrease"
          : "none",
    reason,
    tdeeDeltaKcal,
    tdeeDeltaPercent:
      Math.round(
        (rawTdeeDeltaKcal / input.previousTdeeKcal) *
          1_000
      ) / 10,
    previousTargetKcal: previous.dailyCalories.targetKcal,
    newTargetKcal: recommendation.dailyCalories.targetKcal,
    targetDeltaKcal:
      recommendation.dailyCalories.targetKcal -
      previous.dailyCalories.targetKcal,
    recommendation
  };
}
