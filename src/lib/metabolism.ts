import type {
  BmrCalculation,
  Confidence,
  DailyEnergyEstimate,
  DailyMetabolismEntry,
  ExerciseCategory,
  ExerciseIntensity,
  MetabolismProfile,
  PersonalizedTdeeEstimate,
  SimpleActivityLevel,
  SimpleTdeeEstimate,
  WorkActivityType
} from "../types";

const DAY_MS = 86_400_000;
const KCAL_PER_KG_BODY_WEIGHT_CHANGE = 7_700;

export const SIMPLE_ACTIVITY_FACTORS: Readonly<
  Record<SimpleActivityLevel, number>
> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9
};

const WORK_NET_KCAL_PER_KG_HOUR_WITHOUT_STEPS: Readonly<
  Record<WorkActivityType, number>
> = {
  seated: 0,
  standing: 0.25,
  walking: 0.65,
  physical: 1.5
};

const WORK_NET_KCAL_PER_KG_HOUR_WITH_STEPS: Readonly<
  Record<WorkActivityType, number>
> = {
  seated: 0,
  standing: 0.15,
  walking: 0.1,
  physical: 0.5
};

const EXERCISE_METS: Readonly<
  Record<ExerciseCategory, Record<ExerciseIntensity, number>>
> = {
  walking: { low: 2.5, moderate: 3.5, high: 5 },
  running: { low: 6, moderate: 9, high: 12 },
  cycling: { low: 4, moderate: 7, high: 10 },
  strength: { low: 3, moderate: 5, high: 7 },
  swimming: { low: 4.5, moderate: 7, high: 10 },
  sports: { low: 4, moderate: 7, high: 10 },
  yoga: { low: 2, moderate: 3, high: 4 },
  other: { low: 3, moderate: 5, high: 8 }
};

const SEX_VALUES = new Set(["male", "female"]);
const WORK_ACTIVITY_VALUES = new Set([
  "seated",
  "standing",
  "walking",
  "physical"
]);
const EXERCISE_CATEGORY_VALUES = new Set([
  "walking",
  "running",
  "cycling",
  "strength",
  "swimming",
  "sports",
  "yoga",
  "other"
]);
const EXERCISE_INTENSITY_VALUES = new Set(["low", "moderate", "high"]);

export interface BmrInput {
  sex: MetabolismProfile["sex"];
  birthDate: string;
  heightCm: number;
  weightKg: number;
  bodyFatPercent?: number;
  /** Defaults to today. A date-only string is interpreted as a calendar date. */
  asOfDate?: string | Date;
}

export interface PersonalizedTdeeOptions {
  windowDays?: 14 | 28 | "auto";
}

export interface PersonalizationQualityInput {
  windowDays: 14 | 28;
  validIntakeDays: number;
  weightMeasurementDays: number;
  weightSpanDays: number;
  averageIntakeKcal: number;
  slopeStandardErrorKgPerDay: number;
  weightResidualSdKg: number;
}

export interface TdeeConfidenceRange {
  confidence: Confidence;
  lowerKcal: number;
  upperKcal: number;
}

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

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label}이(가) 비어 있습니다.`);
  if (value.length > 100) {
    throw new RangeError(`${label}은(는) 100자 이하여야 합니다.`);
  }
}

function assertUniqueIds(
  values: readonly { id: string }[],
  label: string
): void {
  const ids = values.map((value) => value.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label}에 중복된 ID가 있습니다.`);
  }
}

function assertIsoTimestamp(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label}이(가) 올바르지 않습니다.`);
  }
}

function dateParts(value: string): [number, number, number] | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return [year, month, day];
}

export function validateDateKey(value: string, label = "날짜"): void {
  if (!dateParts(value)) {
    throw new Error(`${label}은(는) YYYY-MM-DD 형식의 올바른 날짜여야 합니다.`);
  }
}

function dateToEpochDay(value: string): number {
  const parts = dateParts(value);
  if (!parts) {
    throw new Error("날짜은(는) YYYY-MM-DD 형식의 올바른 날짜여야 합니다.");
  }
  return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / DAY_MS);
}

function epochDayToDate(epochDay: number): string {
  return new Date(epochDay * DAY_MS).toISOString().slice(0, 10);
}

function roundKcal(value: number): number {
  return Math.round(value);
}

function calculateAge(birthDate: string, asOfDate: string): number {
  const birth = dateParts(birthDate);
  const asOf = dateParts(asOfDate);
  if (!birth || !asOf) throw new Error("생년월일 또는 기준일이 올바르지 않습니다.");

  let age = asOf[0] - birth[0];
  if (
    asOf[1] < birth[1] ||
    (asOf[1] === birth[1] && asOf[2] < birth[2])
  ) {
    age -= 1;
  }
  if (age < 0) throw new RangeError("생년월일은 기준일보다 늦을 수 없습니다.");
  if (age > 130) throw new RangeError("생년월일을 다시 확인해 주세요.");
  return age;
}

function normalizeAsOfDate(value?: string | Date): string {
  if (typeof value === "string") {
    validateDateKey(value, "기준일");
    return value;
  }
  const date = value ?? new Date();
  if (Number.isNaN(date.getTime())) throw new Error("기준일이 올바르지 않습니다.");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function validateMetabolismProfile(
  profile: MetabolismProfile
): void {
  if (profile.id !== "metabolism") {
    throw new Error("대사량 프로필 ID는 metabolism이어야 합니다.");
  }
  if (!SEX_VALUES.has(profile.sex)) {
    throw new Error("계산 기준 성별을 선택해 주세요.");
  }
  validateDateKey(profile.birthDate, "생년월일");
  calculateAge(profile.birthDate, normalizeAsOfDate());
  assertFiniteInRange(profile.heightCm, 100, 250, "키(cm)");
  assertIsoTimestamp(profile.createdAt, "프로필 생성 시각");
  assertIsoTimestamp(profile.updatedAt, "프로필 수정 시각");

  if (profile.jobTemplates.length > 50) {
    throw new RangeError("직업 템플릿은 최대 50개까지 저장할 수 있습니다.");
  }
  if (profile.exerciseTemplates.length > 100) {
    throw new RangeError("운동 템플릿은 최대 100개까지 저장할 수 있습니다.");
  }
  assertUniqueIds(profile.jobTemplates, "직업 템플릿");
  assertUniqueIds(profile.exerciseTemplates, "운동 템플릿");

  for (const template of profile.jobTemplates) {
    assertNonEmpty(template.id, "직업 템플릿 ID");
    assertNonEmpty(template.name, "직업 이름");
    if (!WORK_ACTIVITY_VALUES.has(template.activityType)) {
      throw new Error(`직업 '${template.name}'의 활동 유형이 올바르지 않습니다.`);
    }
    assertFiniteInRange(
      template.defaultHours,
      0.25,
      24,
      `직업 '${template.name}'의 기본 시간`
    );
  }

  for (const template of profile.exerciseTemplates) {
    assertNonEmpty(template.id, "운동 템플릿 ID");
    assertNonEmpty(template.name, "운동 이름");
    if (!EXERCISE_CATEGORY_VALUES.has(template.category)) {
      throw new Error(`운동 '${template.name}'의 종류가 올바르지 않습니다.`);
    }
    if (!EXERCISE_INTENSITY_VALUES.has(template.intensity)) {
      throw new Error(`운동 '${template.name}'의 강도가 올바르지 않습니다.`);
    }
    assertFiniteInRange(
      template.defaultDurationMinutes,
      1,
      1_440,
      `운동 '${template.name}'의 기본 시간(분)`
    );
    assertFiniteInRange(
      template.weeklyFrequency,
      0,
      14,
      `운동 '${template.name}'의 주당 횟수`
    );
  }
}

export function validateDailyMetabolismEntry(
  entry: DailyMetabolismEntry
): void {
  validateDateKey(entry.date);
  if (entry.id !== entry.date) {
    throw new Error("일일 대사량 기록 ID는 기록 날짜와 같아야 합니다.");
  }
  assertFiniteInRange(entry.weightKg, 30, 350, "체중(kg)");
  if (entry.bodyFatPercent !== undefined) {
    assertFiniteInRange(entry.bodyFatPercent, 1, 75, "체지방률(%)");
  }
  if (entry.steps !== undefined) {
    if (!Number.isInteger(entry.steps)) {
      throw new RangeError("걸음 수는 0 이상의 정수여야 합니다.");
    }
    assertFiniteInRange(entry.steps, 0, 200_000, "걸음 수");
  }
  if (typeof entry.dietComplete !== "boolean") {
    throw new Error("식단 기록 완료 여부가 올바르지 않습니다.");
  }
  assertIsoTimestamp(entry.createdAt, "기록 생성 시각");
  assertIsoTimestamp(entry.updatedAt, "기록 수정 시각");
  assertUniqueIds(entry.jobActivities, "하루 직업 활동");
  assertUniqueIds(entry.exercises, "하루 운동");

  let totalWorkHours = 0;
  for (const activity of entry.jobActivities) {
    assertNonEmpty(activity.id, "직업 활동 ID");
    assertNonEmpty(activity.name, "직업 활동 이름");
    if (!WORK_ACTIVITY_VALUES.has(activity.activityType)) {
      throw new Error(`직업 '${activity.name}'의 활동 유형이 올바르지 않습니다.`);
    }
    assertFiniteInRange(
      activity.hours,
      0.25,
      24,
      `직업 '${activity.name}'의 활동 시간`
    );
    totalWorkHours += activity.hours;
  }
  if (totalWorkHours > 24) {
    throw new RangeError("하루 직업 활동 시간의 합은 24시간을 넘을 수 없습니다.");
  }

  let totalExerciseMinutes = 0;
  for (const exercise of entry.exercises) {
    assertNonEmpty(exercise.id, "운동 기록 ID");
    assertNonEmpty(exercise.name, "운동 이름");
    if (!EXERCISE_CATEGORY_VALUES.has(exercise.category)) {
      throw new Error(`운동 '${exercise.name}'의 종류가 올바르지 않습니다.`);
    }
    if (!EXERCISE_INTENSITY_VALUES.has(exercise.intensity)) {
      throw new Error(`운동 '${exercise.name}'의 강도가 올바르지 않습니다.`);
    }
    assertFiniteInRange(
      exercise.durationMinutes,
      1,
      1_440,
      `운동 '${exercise.name}'의 시간(분)`
    );
    totalExerciseMinutes += exercise.durationMinutes;
  }
  if (totalExerciseMinutes > 1_440) {
    throw new RangeError("하루 운동 시간의 합은 24시간을 넘을 수 없습니다.");
  }
  if (totalWorkHours + totalExerciseMinutes / 60 > 24) {
    throw new RangeError(
      "하루 직업 활동과 운동 시간의 합은 24시간을 넘을 수 없습니다."
    );
  }
}

export function calculateBmr(input: BmrInput): BmrCalculation {
  if (!SEX_VALUES.has(input.sex)) {
    throw new Error("계산 기준 성별을 선택해 주세요.");
  }
  validateDateKey(input.birthDate, "생년월일");
  assertFiniteInRange(input.heightCm, 100, 250, "키(cm)");
  assertFiniteInRange(input.weightKg, 30, 350, "체중(kg)");
  if (input.bodyFatPercent !== undefined) {
    assertFiniteInRange(input.bodyFatPercent, 1, 75, "체지방률(%)");
  }

  const asOfDate = normalizeAsOfDate(input.asOfDate);
  const ageYears = calculateAge(input.birthDate, asOfDate);

  if (input.bodyFatPercent !== undefined) {
    const leanBodyMassKg =
      input.weightKg * (1 - input.bodyFatPercent / 100);
    return {
      method: "katch-mcardle",
      kcal: roundKcal(370 + 21.6 * leanBodyMassKg),
      ageYears,
      leanBodyMassKg: Math.round(leanBodyMassKg * 10) / 10
    };
  }

  const sexAdjustment = input.sex === "male" ? 5 : -161;
  return {
    method: "mifflin-st-jeor",
    kcal: roundKcal(
      10 * input.weightKg +
        6.25 * input.heightCm -
        5 * ageYears +
        sexAdjustment
    ),
    ageYears
  };
}

export function calculateSimpleTdee(
  bmrKcal: number,
  level: SimpleActivityLevel
): SimpleTdeeEstimate {
  assertFiniteInRange(bmrKcal, 500, 5_000, "기초대사량(kcal)");
  const factor = SIMPLE_ACTIVITY_FACTORS[level];
  if (!factor) throw new Error("활동 수준을 올바르게 선택해 주세요.");
  const tdeeKcal = roundKcal(bmrKcal * factor);
  return {
    level,
    factor,
    bmrKcal: roundKcal(bmrKcal),
    activityKcal: tdeeKcal - roundKcal(bmrKcal),
    tdeeKcal
  };
}

export function estimateDailyEnergy(
  profile: MetabolismProfile,
  entry: DailyMetabolismEntry
): DailyEnergyEstimate {
  validateMetabolismProfile(profile);
  validateDailyMetabolismEntry(entry);

  const bmr = calculateBmr({
    sex: profile.sex,
    birthDate: profile.birthDate,
    heightCm: profile.heightCm,
    weightKg: entry.weightKg,
    bodyFatPercent: entry.bodyFatPercent,
    asOfDate: entry.date
  });
  const baselineActivityKcal = bmr.kcal * 0.2;
  const hasSteps = entry.steps !== undefined;
  const stepsKcal = hasSteps
    ? Math.max(0, entry.steps! - 3_000) * entry.weightKg * 0.0005
    : 0;
  const workFactors = hasSteps
    ? WORK_NET_KCAL_PER_KG_HOUR_WITH_STEPS
    : WORK_NET_KCAL_PER_KG_HOUR_WITHOUT_STEPS;
  const workKcal = entry.jobActivities.reduce(
    (total, activity) =>
      total +
      entry.weightKg * workFactors[activity.activityType] * activity.hours,
    0
  );
  const exerciseKcal = entry.exercises.reduce((total, exercise) => {
    const met = EXERCISE_METS[exercise.category][exercise.intensity];
    const stepsMayIncludeExercise =
      hasSteps &&
      (exercise.category === "walking" || exercise.category === "running");
    const netMet = Math.max(0, met - (stepsMayIncludeExercise ? 3 : 1));
    return (
      total +
      netMet * entry.weightKg * (exercise.durationMinutes / 60)
    );
  }, 0);

  const tdeeKcal = roundKcal(
    bmr.kcal +
      baselineActivityKcal +
      stepsKcal +
      workKcal +
      exerciseKcal
  );
  const bmrKcal = bmr.kcal;
  const activityKcal = tdeeKcal - bmrKcal;
  const assumptions = [
    "기초적인 일상 활동과 음식 소화에 기초대사량의 20%를 반영했습니다.",
    hasSteps
      ? "3,000보까지는 기초적인 일상 활동에 포함하고, 이를 넘는 걸음 수를 추가 반영했습니다."
      : "걸음 수가 없어 직업 활동 유형과 시간으로 이동량을 추정했습니다."
  ];
  if (hasSteps && entry.jobActivities.length > 0) {
    assumptions.push(
      "걸음 수와 직업 활동이 겹치지 않도록 직업 활동 소모량을 낮춰 계산했습니다."
    );
  }
  if (
    hasSteps &&
    entry.exercises.some(
      (exercise) =>
        exercise.category === "walking" || exercise.category === "running"
    )
  ) {
    assumptions.push(
      "걷기·달리기 운동의 걸음이 총 걸음 수에 포함될 수 있어 중복분을 보정했습니다."
    );
  }

  return {
    date: entry.date,
    bmr,
    bmrKcal,
    baselineActivityKcal: roundKcal(baselineActivityKcal),
    stepsKcal: roundKcal(stepsKcal),
    workKcal: roundKcal(workKcal),
    exerciseKcal: roundKcal(exerciseKcal),
    activityKcal,
    tdeeKcal,
    pal: Math.round((tdeeKcal / bmrKcal) * 100) / 100,
    assumptions
  };
}

function linearRegression(points: readonly [number, number][]): {
  slope: number;
  residualSd: number;
  slopeStandardError: number;
} {
  // Morning weight can jump because of hydration, sodium, or an input typo.
  // A Theil–Sen slope keeps one unusual weigh-in from distorting the learned
  // TDEE while still returning the same result for a clean linear trend.
  const count = points.length;
  const slopes: number[] = [];
  for (let left = 0; left < count; left += 1) {
    for (let right = left + 1; right < count; right += 1) {
      const deltaX = points[right][0] - points[left][0];
      if (deltaX !== 0) {
        slopes.push((points[right][1] - points[left][1]) / deltaX);
      }
    }
  }
  const median = (values: readonly number[]): number => {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  };
  const slope = median(slopes);
  const intercept = median(
    points.map(([x, y]) => y - slope * x)
  );
  const meanX = points.reduce((sum, point) => sum + point[0], 0) / count;
  const sxx = points.reduce(
    (sum, point) => sum + (point[0] - meanX) ** 2,
    0
  );
  const residualSumSquares = points.reduce((sum, point) => {
    const residual = point[1] - (intercept + slope * point[0]);
    return sum + residual ** 2;
  }, 0);
  const residualSd =
    count > 2 ? Math.sqrt(residualSumSquares / (count - 2)) : 0;
  const slopeStandardError =
    count > 2 && sxx > 0 ? residualSd / Math.sqrt(sxx) : Number.POSITIVE_INFINITY;
  return { slope, residualSd, slopeStandardError };
}

/**
 * Converts data coverage and weight-trend noise into a displayable confidence
 * label and a conservative kcal range around the personalized TDEE.
 */
export function calculateTdeeConfidenceRange(
  tdeeKcal: number,
  quality: PersonalizationQualityInput
): TdeeConfidenceRange {
  assertFiniteInRange(tdeeKcal, 1, 10_000, "개인화 대사량(kcal)");
  const intakeCoverage = quality.validIntakeDays / quality.windowDays;
  const weightCoverage = quality.weightMeasurementDays / quality.windowDays;
  const spanCoverage = quality.weightSpanDays / (quality.windowDays - 1);

  let confidence: Confidence = "low";
  if (
    quality.windowDays === 28 &&
    intakeCoverage >= 0.85 &&
    weightCoverage >= 0.7 &&
    spanCoverage >= 0.85 &&
    quality.weightResidualSdKg <= 0.45
  ) {
    confidence = "high";
  } else if (
    intakeCoverage >= 0.7 &&
    weightCoverage >= 0.5 &&
    spanCoverage >= 0.7 &&
    quality.weightResidualSdKg <= 0.7
  ) {
    confidence = "medium";
  }

  const weightTrendUncertainty =
    Number.isFinite(quality.slopeStandardErrorKgPerDay)
      ? quality.slopeStandardErrorKgPerDay *
        KCAL_PER_KG_BODY_WEIGHT_CHANGE *
        1.96
      : 1_200;
  const intakeUncertainty =
    quality.averageIntakeKcal *
    (confidence === "high" ? 0.08 : confidence === "medium" ? 0.12 : 0.18);
  const coveragePenalty =
    Math.max(0, 1 - intakeCoverage) * 400 +
    Math.max(0, 1 - weightCoverage) * 300;
  const halfWidth = Math.round(
    Math.min(
      1_200,
      Math.max(150, weightTrendUncertainty, intakeUncertainty) +
        coveragePenalty
    ) / 10
  ) * 10;

  return {
    confidence,
    lowerKcal: Math.max(0, Math.round((tdeeKcal - halfWidth) / 10) * 10),
    upperKcal: Math.round((tdeeKcal + halfWidth) / 10) * 10
  };
}

function insufficientPersonalizedEstimate(
  windowDays: 14 | 28,
  startDate: string,
  endDate: string,
  validIntakeDays: number,
  weightMeasurementDays: number,
  reason: string
): PersonalizedTdeeEstimate {
  return {
    status: "insufficient",
    windowDays,
    startDate,
    endDate,
    validIntakeDays,
    weightMeasurementDays,
    confidence: "low",
    reason
  };
}

/**
 * Estimates maintenance calories from completed food logs and the slope of
 * morning body weight. A negative weight slope increases the estimate:
 * TDEE = average intake - (kg/day × 7,700 kcal/kg).
 */
export function estimatePersonalizedTdee(
  entries: readonly DailyMetabolismEntry[],
  intakeByDate: Readonly<Record<string, number>>,
  options: PersonalizedTdeeOptions = {}
): PersonalizedTdeeEstimate {
  if (options.windowDays == null || options.windowDays === "auto") {
    const longWindow = estimatePersonalizedTdee(entries, intakeByDate, {
      windowDays: 28
    });
    if (longWindow.status === "estimated") return longWindow;
    return estimatePersonalizedTdee(entries, intakeByDate, {
      windowDays: 14
    });
  }

  const entriesByDate = new Map<string, DailyMetabolismEntry>();
  for (const entry of entries) {
    validateDailyMetabolismEntry(entry);
    if (entriesByDate.has(entry.date)) {
      throw new Error(`같은 날짜의 대사량 기록이 중복되었습니다: ${entry.date}`);
    }
    entriesByDate.set(entry.date, entry);
  }

  if (entriesByDate.size === 0) {
    const requestedWindow = options.windowDays;
    return insufficientPersonalizedEstimate(
      requestedWindow,
      "",
      "",
      0,
      0,
      "개인화 계산을 시작하려면 아침 체중과 완료된 식단 기록이 필요합니다."
    );
  }

  const sortedEntries = [...entriesByDate.values()].sort((left, right) =>
    left.date.localeCompare(right.date)
  );
  const firstEpochDay = dateToEpochDay(sortedEntries[0].date);
  const endDate = sortedEntries.at(-1)!.date;
  const endEpochDay = dateToEpochDay(endDate);
  const availableSpanDays = endEpochDay - firstEpochDay + 1;
  const windowDays = options.windowDays;
  const startEpochDay = endEpochDay - windowDays + 1;
  const startDate = epochDayToDate(startEpochDay);
  const windowEntries = sortedEntries.filter(
    (entry) => dateToEpochDay(entry.date) >= startEpochDay
  );

  const intakeValues: number[] = [];
  for (const entry of windowEntries) {
    if (!entry.dietComplete) continue;
    const intake = intakeByDate[entry.date];
    if (intake === undefined) continue;
    assertFiniteInRange(
      intake,
      0,
      20_000,
      `${entry.date} 섭취 열량(kcal)`
    );
    intakeValues.push(intake);
  }

  const weightPoints: [number, number][] = windowEntries.map((entry) => [
    dateToEpochDay(entry.date) - startEpochDay,
    entry.weightKg
  ]);
  const validIntakeDays = intakeValues.length;
  const weightMeasurementDays = weightPoints.length;
  const minimumIntakeDays = Math.ceil(windowDays * 0.7);
  const minimumWeightDays = Math.ceil(windowDays * 0.5);

  if (availableSpanDays < windowDays) {
    return insufficientPersonalizedEstimate(
      windowDays,
      startDate,
      endDate,
      validIntakeDays,
      weightMeasurementDays,
      `${windowDays}일 추세를 계산하려면 ${windowDays - availableSpanDays}일의 기록이 더 필요합니다.`
    );
  }
  if (validIntakeDays < minimumIntakeDays) {
    return insufficientPersonalizedEstimate(
      windowDays,
      startDate,
      endDate,
      validIntakeDays,
      weightMeasurementDays,
      `식단 완료 기록이 최소 ${minimumIntakeDays}일 필요합니다.`
    );
  }
  if (weightMeasurementDays < minimumWeightDays) {
    return insufficientPersonalizedEstimate(
      windowDays,
      startDate,
      endDate,
      validIntakeDays,
      weightMeasurementDays,
      `아침 체중 기록이 최소 ${minimumWeightDays}일 필요합니다.`
    );
  }

  const weightSpanDays =
    weightPoints.at(-1)![0] - weightPoints[0][0];
  const minimumWeightSpan = Math.ceil((windowDays - 1) * 0.7);
  if (weightSpanDays < minimumWeightSpan) {
    return insufficientPersonalizedEstimate(
      windowDays,
      startDate,
      endDate,
      validIntakeDays,
      weightMeasurementDays,
      `체중 기록은 기간의 앞뒤에 걸쳐 최소 ${minimumWeightSpan + 1}일 범위를 포함해야 합니다.`
    );
  }

  const averageIntakeKcal =
    intakeValues.reduce((sum, value) => sum + value, 0) /
    validIntakeDays;
  const regression = linearRegression(weightPoints);
  const rawTdee =
    averageIntakeKcal -
    regression.slope * KCAL_PER_KG_BODY_WEIGHT_CHANGE;
  if (rawTdee < 500 || rawTdee > 8_000) {
    return insufficientPersonalizedEstimate(
      windowDays,
      startDate,
      endDate,
      validIntakeDays,
      weightMeasurementDays,
      "체중 변화가 너무 커서 신뢰할 수 있는 유지 칼로리를 계산하지 못했습니다."
    );
  }

  const tdeeKcal = roundKcal(rawTdee);
  const range = calculateTdeeConfidenceRange(tdeeKcal, {
    windowDays,
    validIntakeDays,
    weightMeasurementDays,
    weightSpanDays,
    averageIntakeKcal,
    slopeStandardErrorKgPerDay: regression.slopeStandardError,
    weightResidualSdKg: regression.residualSd
  });

  return {
    status: "estimated",
    windowDays,
    startDate,
    endDate,
    validIntakeDays,
    weightMeasurementDays,
    averageIntakeKcal: roundKcal(averageIntakeKcal),
    weightTrendKgPerWeek:
      Math.round(regression.slope * 7 * 1_000) / 1_000,
    tdeeKcal,
    lowerKcal: range.lowerKcal,
    upperKcal: range.upperKcal,
    confidence: range.confidence
  };
}
