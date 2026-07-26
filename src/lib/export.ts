import { APP_NAME, MAX_PHOTOS_PER_RECORD } from "../constants";
import type {
  AnalysisMeta,
  AppSettings,
  BackupPhoto,
  Confidence,
  DailyExercise,
  DailyMetabolismEntry,
  DailyWorkActivity,
  DietLogBackup,
  ExerciseCategory,
  ExerciseIntensity,
  ExerciseTemplate,
  FoodItem,
  FoodRecord,
  FoodSource,
  MetabolismProfile,
  Nutrients,
  PhotoAsset,
  Sex,
  WorkActivityType,
  WorkTemplate
} from "../types";
import {
  db,
  getMetabolismProfile,
  getSettings,
  listDailyMetabolismEntries,
  listRecords
} from "./db";
import {
  formatDayKey,
  formatDayLabel,
  formatRecordTime,
  formatRecordTimeForDay,
  getRecordDayKey,
  groupRecordsByDay
} from "./date";
import { sumFoods, sumRecords } from "./nutrition";
import {
  validateDailyMetabolismEntry,
  validateDateKey,
  validateMetabolismProfile
} from "./metabolism";
import type {
  GoalPlan,
  GoalPace,
  GoalType
} from "./goals";
import { GOAL_SAFETY_LIMITS, validateGoalPlan } from "./goals";
import type {
  GoalSettings,
  GoalTargetSnapshot,
  GoalTdeeSource
} from "./goalHistory";
import {
  MAX_GOAL_TARGETS,
  mergeGoalSettings,
  validateGoalSettings
} from "./goalHistory";

export type ImportMode = "merge" | "replace";

export interface BackupOptions {
  includePhotos?: boolean;
}

export interface ImportBackupResult {
  mode: ImportMode;
  recordsImported: number;
  recordsSkipped: number;
  photosImported: number;
  metabolismEntriesImported: number;
  metabolismEntriesSkipped: number;
  metabolismProfileImported: boolean;
}

const SOURCES = new Set<FoodSource>(["ai", "manual", "copied"]);
const STATUSES = new Set<AnalysisMeta["status"]>([
  "not_requested",
  "pending",
  "complete",
  "failed"
]);
const CONFIDENCES = new Set<Confidence>(["high", "medium", "low"]);
const SEXES = new Set<Sex>(["male", "female"]);
const WORK_ACTIVITY_TYPES = new Set<WorkActivityType>([
  "seated",
  "standing",
  "walking",
  "physical"
]);
const EXERCISE_CATEGORIES = new Set<ExerciseCategory>([
  "walking",
  "running",
  "cycling",
  "strength",
  "swimming",
  "sports",
  "yoga",
  "other"
]);
const EXERCISE_INTENSITIES = new Set<ExerciseIntensity>([
  "low",
  "moderate",
  "high"
]);
const GOAL_TYPES = new Set<GoalType>([
  "fat_loss",
  "maintenance_recomp",
  "lean_mass_gain",
  "bulk",
  "custom"
]);
const GOAL_PACES = new Set<GoalPace>(["gentle", "moderate", "fast"]);
const GOAL_TDEE_SOURCES = new Set<GoalTdeeSource>([
  "personalized",
  "detailed",
  "manual"
]);
const IMAGE_DATA_URL_PATTERN =
  /^data:image\/(?:jpeg|png|webp|gif|avif);base64,[a-z0-9+/]*={0,2}$/i;

function invalid(path: string, detail: string): never {
  throw new Error(`백업 파일의 ${path} 항목이 올바르지 않습니다: ${detail}`);
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(path, "객체여야 합니다.");
  }
  return value as Record<string, unknown>;
}

function stringAt(
  value: unknown,
  path: string,
  options: { allowEmpty?: boolean; maxLength?: number } = {}
): string {
  if (typeof value !== "string") invalid(path, "문자열이어야 합니다.");
  if (!options.allowEmpty && value.trim() === "") {
    invalid(path, "비어 있을 수 없습니다.");
  }
  if (options.maxLength && value.length > options.maxLength) {
    invalid(path, `최대 ${options.maxLength}자까지 허용됩니다.`);
  }
  return value;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "참/거짓 값이어야 합니다.");
  return value;
}

function finiteNumberAt(
  value: unknown,
  path: string,
  options: {
    nullable?: boolean;
    integer?: boolean;
    min?: number;
    max?: number;
  } = {}
): number | null {
  if (value === null && options.nullable) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(path, options.nullable ? "숫자 또는 null이어야 합니다." : "숫자여야 합니다.");
  }
  if (options.integer && !Number.isInteger(value)) invalid(path, "정수여야 합니다.");
  if (options.min != null && value < options.min) {
    invalid(path, `${options.min} 이상이어야 합니다.`);
  }
  if (options.max != null && value > options.max) {
    invalid(path, `${options.max} 이하여야 합니다.`);
  }
  return value;
}

function isoDateAt(value: unknown, path: string): string {
  const text = stringAt(value, path, { maxLength: 100 });
  if (Number.isNaN(Date.parse(text))) invalid(path, "유효한 날짜와 시각이어야 합니다.");
  return text;
}

function stringArrayAt(
  value: unknown,
  path: string,
  maxItems = Number.MAX_SAFE_INTEGER
): string[] {
  if (!Array.isArray(value)) invalid(path, "목록이어야 합니다.");
  if (value.length > maxItems) invalid(path, `최대 ${maxItems}개까지 허용됩니다.`);
  const result = value.map((item, index) =>
    stringAt(item, `${path}[${index}]`, { maxLength: 500 })
  );
  if (new Set(result).size !== result.length) invalid(path, "중복 값이 있습니다.");
  return result;
}

function optionalStringAt(
  value: unknown,
  path: string,
  maxLength: number
): string | undefined {
  return value == null
    ? undefined
    : stringAt(value, path, { allowEmpty: true, maxLength });
}

function nutrientsAt(value: unknown, path: string): Nutrients {
  const item = objectAt(value, path);
  const nutrient = (key: keyof Nutrients): number | null =>
    finiteNumberAt(item[key], `${path}.${key}`, {
      nullable: true,
      min: 0,
      max: 10_000_000
    });

  return {
    energyKcal: nutrient("energyKcal"),
    carbsG: nutrient("carbsG"),
    proteinG: nutrient("proteinG"),
    fatG: nutrient("fatG"),
    sugarG: nutrient("sugarG"),
    sodiumMg: nutrient("sodiumMg"),
    fiberG: nutrient("fiberG"),
    saturatedFatG: nutrient("saturatedFatG")
  };
}

function foodAt(value: unknown, path: string): FoodItem {
  const item = objectAt(value, path);
  const source = stringAt(item.source, `${path}.source`) as FoodSource;
  if (!SOURCES.has(source)) invalid(`${path}.source`, "알 수 없는 입력 방식입니다.");
  return {
    id: stringAt(item.id, `${path}.id`, { maxLength: 500 }),
    name: stringAt(item.name, `${path}.name`, { maxLength: 2_000 }),
    amountText: stringAt(item.amountText, `${path}.amountText`, {
      allowEmpty: true,
      maxLength: 10_000
    }),
    nutrients: nutrientsAt(item.nutrients, `${path}.nutrients`),
    source,
    userEdited: booleanAt(item.userEdited, `${path}.userEdited`)
  };
}

function analysisAt(value: unknown, path: string): AnalysisMeta {
  const item = objectAt(value, path);
  const status = stringAt(item.status, `${path}.status`) as AnalysisMeta["status"];
  if (!STATUSES.has(status)) invalid(`${path}.status`, "알 수 없는 분석 상태입니다.");

  const assumptions = stringArrayAt(item.assumptions, `${path}.assumptions`);
  const confidence =
    item.confidence == null
      ? undefined
      : (stringAt(item.confidence, `${path}.confidence`) as Confidence);
  if (confidence && !CONFIDENCES.has(confidence)) {
    invalid(`${path}.confidence`, "알 수 없는 신뢰도입니다.");
  }
  const optionalTokenCount = (
    tokenValue: unknown,
    tokenPath: string
  ): number | undefined => {
    if (tokenValue == null) return undefined;
    return finiteNumberAt(tokenValue, tokenPath, {
      integer: true,
      min: 0,
      max: 1_000_000_000
    }) as number;
  };

  return {
    status,
    assumptions,
    modelId: optionalStringAt(item.modelId, `${path}.modelId`, 200),
    analyzedAt:
      item.analyzedAt == null
        ? undefined
        : isoDateAt(item.analyzedAt, `${path}.analyzedAt`),
    confidence,
    error: optionalStringAt(item.error, `${path}.error`, 20_000),
    inputTokens: optionalTokenCount(item.inputTokens, `${path}.inputTokens`),
    outputTokens: optionalTokenCount(item.outputTokens, `${path}.outputTokens`)
  };
}

function recordAt(value: unknown, path: string): FoodRecord {
  const item = objectAt(value, path);
  if (!Array.isArray(item.foods)) invalid(`${path}.foods`, "목록이어야 합니다.");
  const foods = item.foods.map((food, index) =>
    foodAt(food, `${path}.foods[${index}]`)
  );
  const foodIds = foods.map((food) => food.id);
  if (new Set(foodIds).size !== foodIds.length) {
    invalid(`${path}.foods`, "음식 ID가 중복되었습니다.");
  }

  return {
    id: stringAt(item.id, `${path}.id`, { maxLength: 500 }),
    consumedAt: isoDateAt(item.consumedAt, `${path}.consumedAt`),
    timezoneOffsetMinutes: finiteNumberAt(
      item.timezoneOffsetMinutes,
      `${path}.timezoneOffsetMinutes`,
      { integer: true, min: -840, max: 840 }
    ) as number,
    note: stringAt(item.note, `${path}.note`, {
      allowEmpty: true,
      maxLength: 100_000
    }),
    photoIds: stringArrayAt(
      item.photoIds,
      `${path}.photoIds`,
      MAX_PHOTOS_PER_RECORD
    ),
    foods,
    analysis: analysisAt(item.analysis, `${path}.analysis`),
    createdAt: isoDateAt(item.createdAt, `${path}.createdAt`),
    updatedAt: isoDateAt(item.updatedAt, `${path}.updatedAt`)
  };
}

function settingsAt(value: unknown, path: string): AppSettings {
  const item = objectAt(value, path);
  if (item.id !== "app") invalid(`${path}.id`, '"app"이어야 합니다.');
  return {
    id: "app",
    dayStartHour: finiteNumberAt(item.dayStartHour, `${path}.dayStartHour`, {
      integer: true,
      min: 0,
      max: 23
    }) as number,
    modelId: stringAt(item.modelId, `${path}.modelId`, { maxLength: 200 }),
    goalSettings:
      item.goalSettings == null
        ? undefined
        : goalSettingsAt(item.goalSettings, `${path}.goalSettings`),
    updatedAt: isoDateAt(item.updatedAt, `${path}.updatedAt`)
  };
}

function goalPlanAt(value: unknown, path: string): GoalPlan {
  const item = objectAt(value, path);
  const goalType = stringAt(item.goalType, `${path}.goalType`) as GoalType;
  const pace = stringAt(item.pace, `${path}.pace`) as GoalPace;
  if (!GOAL_TYPES.has(goalType)) {
    invalid(`${path}.goalType`, "알 수 없는 목표 유형입니다.");
  }
  if (!GOAL_PACES.has(pace)) {
    invalid(`${path}.pace`, "알 수 없는 목표 속도입니다.");
  }
  const plan: GoalPlan = {
    goalType,
    pace,
    resistanceTrainingDaysPerWeek: finiteNumberAt(
      item.resistanceTrainingDaysPerWeek,
      `${path}.resistanceTrainingDaysPerWeek`,
      { integer: true, min: 0, max: 7 }
    ) as number,
    targetWeightKg:
      item.targetWeightKg == null
        ? undefined
        : (finiteNumberAt(item.targetWeightKg, `${path}.targetWeightKg`, {
            min: 30,
            max: 350
          }) as number),
    targetDate:
      item.targetDate == null
        ? undefined
        : dateKeyAt(item.targetDate, `${path}.targetDate`),
    customDailyKcal:
      item.customDailyKcal == null
        ? undefined
        : (finiteNumberAt(item.customDailyKcal, `${path}.customDailyKcal`, {
            min: GOAL_SAFETY_LIMITS.minimumValidTdeeKcal,
            max: GOAL_SAFETY_LIMITS.maximumValidTdeeKcal
          }) as number),
    customProteinMinimumG:
      item.customProteinMinimumG == null
        ? undefined
        : (finiteNumberAt(
            item.customProteinMinimumG,
            `${path}.customProteinMinimumG`,
            { min: 1, max: 500 }
          ) as number)
  };
  try {
    validateGoalPlan(plan);
  } catch (error) {
    invalid(
      path,
      error instanceof Error ? error.message : "목표 설정이 올바르지 않습니다."
    );
  }
  return plan;
}

function goalTargetAt(value: unknown, path: string): GoalTargetSnapshot {
  const item = objectAt(value, path);
  const tdeeSource = stringAt(
    item.tdeeSource,
    `${path}.tdeeSource`
  ) as GoalTdeeSource;
  if (!GOAL_TDEE_SOURCES.has(tdeeSource)) {
    invalid(`${path}.tdeeSource`, "알 수 없는 TDEE 출처입니다.");
  }
  const calories = objectAt(item.dailyCalories, `${path}.dailyCalories`);
  return {
    id: stringAt(item.id, `${path}.id`, { maxLength: 100 }),
    effectiveFrom: dateKeyAt(
      item.effectiveFrom,
      `${path}.effectiveFrom`
    ),
    plan: goalPlanAt(item.plan, `${path}.plan`),
    tdeeKcal: finiteNumberAt(item.tdeeKcal, `${path}.tdeeKcal`, {
      min: GOAL_SAFETY_LIMITS.minimumValidTdeeKcal,
      max: GOAL_SAFETY_LIMITS.maximumValidTdeeKcal
    }) as number,
    weightKg: finiteNumberAt(item.weightKg, `${path}.weightKg`, {
      min: 30,
      max: 350
    }) as number,
    tdeeSource,
    dailyCalories: {
      minKcal: finiteNumberAt(
        calories.minKcal,
        `${path}.dailyCalories.minKcal`,
        {
          min: GOAL_SAFETY_LIMITS.absoluteMinimumDailyKcal,
          max: GOAL_SAFETY_LIMITS.maximumValidTdeeKcal
        }
      ) as number,
      targetKcal: finiteNumberAt(
        calories.targetKcal,
        `${path}.dailyCalories.targetKcal`,
        {
          min: GOAL_SAFETY_LIMITS.absoluteMinimumDailyKcal,
          max: GOAL_SAFETY_LIMITS.maximumValidTdeeKcal
        }
      ) as number,
      maxKcal: finiteNumberAt(
        calories.maxKcal,
        `${path}.dailyCalories.maxKcal`,
        {
          min: GOAL_SAFETY_LIMITS.absoluteMinimumDailyKcal,
          max: GOAL_SAFETY_LIMITS.maximumValidTdeeKcal
        }
      ) as number
    },
    proteinMinimumG: finiteNumberAt(
      item.proteinMinimumG,
      `${path}.proteinMinimumG`,
      { min: 1, max: 500 }
    ) as number,
    createdAt: isoDateAt(item.createdAt, `${path}.createdAt`)
  };
}

function goalSettingsAt(value: unknown, path: string): GoalSettings {
  const item = objectAt(value, path);
  if (!Array.isArray(item.targets)) {
    invalid(`${path}.targets`, "목록이어야 합니다.");
  }
  if (item.targets.length > MAX_GOAL_TARGETS) {
    invalid(
      `${path}.targets`,
      `최대 ${MAX_GOAL_TARGETS}개까지 허용됩니다.`
    );
  }
  const settings: GoalSettings = {
    targets: item.targets.map((target, index) =>
      goalTargetAt(target, `${path}.targets[${index}]`)
    ),
    updatedAt: isoDateAt(item.updatedAt, `${path}.updatedAt`)
  };
  try {
    validateGoalSettings(settings);
  } catch (error) {
    invalid(
      path,
      error instanceof Error ? error.message : "목표 이력이 올바르지 않습니다."
    );
  }
  return settings;
}

function dateKeyAt(value: unknown, path: string): string {
  const dateKey = stringAt(value, path, { maxLength: 10 });
  try {
    validateDateKey(dateKey, path);
  } catch (error) {
    invalid(
      path,
      error instanceof Error ? error.message : "유효한 날짜여야 합니다."
    );
  }
  return dateKey;
}

function workTemplateAt(value: unknown, path: string): WorkTemplate {
  const item = objectAt(value, path);
  const activityType = stringAt(
    item.activityType,
    `${path}.activityType`
  ) as WorkActivityType;
  if (!WORK_ACTIVITY_TYPES.has(activityType)) {
    invalid(`${path}.activityType`, "알 수 없는 직업 활동 유형입니다.");
  }
  return {
    id: stringAt(item.id, `${path}.id`, { maxLength: 100 }),
    name: stringAt(item.name, `${path}.name`, { maxLength: 100 }),
    activityType,
    defaultHours: finiteNumberAt(
      item.defaultHours,
      `${path}.defaultHours`,
      { min: 0.25, max: 24 }
    ) as number
  };
}

function exerciseTemplateAt(value: unknown, path: string): ExerciseTemplate {
  const item = objectAt(value, path);
  const category = stringAt(
    item.category,
    `${path}.category`
  ) as ExerciseCategory;
  const intensity = stringAt(
    item.intensity,
    `${path}.intensity`
  ) as ExerciseIntensity;
  if (!EXERCISE_CATEGORIES.has(category)) {
    invalid(`${path}.category`, "알 수 없는 운동 종류입니다.");
  }
  if (!EXERCISE_INTENSITIES.has(intensity)) {
    invalid(`${path}.intensity`, "알 수 없는 운동 강도입니다.");
  }
  return {
    id: stringAt(item.id, `${path}.id`, { maxLength: 100 }),
    name: stringAt(item.name, `${path}.name`, { maxLength: 100 }),
    category,
    intensity,
    defaultDurationMinutes: finiteNumberAt(
      item.defaultDurationMinutes,
      `${path}.defaultDurationMinutes`,
      { min: 1, max: 1_440 }
    ) as number,
    weeklyFrequency: finiteNumberAt(
      item.weeklyFrequency,
      `${path}.weeklyFrequency`,
      { min: 0, max: 14 }
    ) as number
  };
}

function metabolismProfileAt(
  value: unknown,
  path: string
): MetabolismProfile {
  const item = objectAt(value, path);
  if (item.id !== "metabolism") {
    invalid(`${path}.id`, '"metabolism"이어야 합니다.');
  }
  const sex = stringAt(item.sex, `${path}.sex`) as Sex;
  if (!SEXES.has(sex)) invalid(`${path}.sex`, "알 수 없는 계산 기준입니다.");
  if (!Array.isArray(item.jobTemplates)) {
    invalid(`${path}.jobTemplates`, "목록이어야 합니다.");
  }
  if (!Array.isArray(item.exerciseTemplates)) {
    invalid(`${path}.exerciseTemplates`, "목록이어야 합니다.");
  }
  const profile: MetabolismProfile = {
    id: "metabolism",
    sex,
    birthDate: dateKeyAt(item.birthDate, `${path}.birthDate`),
    heightCm: finiteNumberAt(item.heightCm, `${path}.heightCm`, {
      min: 100,
      max: 250
    }) as number,
    jobTemplates: item.jobTemplates.map((template, index) =>
      workTemplateAt(template, `${path}.jobTemplates[${index}]`)
    ),
    exerciseTemplates: item.exerciseTemplates.map((template, index) =>
      exerciseTemplateAt(template, `${path}.exerciseTemplates[${index}]`)
    ),
    createdAt: isoDateAt(item.createdAt, `${path}.createdAt`),
    updatedAt: isoDateAt(item.updatedAt, `${path}.updatedAt`)
  };
  try {
    validateMetabolismProfile(profile);
  } catch (error) {
    invalid(
      path,
      error instanceof Error ? error.message : "프로필이 올바르지 않습니다."
    );
  }
  return profile;
}

function dailyWorkActivityAt(
  value: unknown,
  path: string
): DailyWorkActivity {
  const item = objectAt(value, path);
  const activityType = stringAt(
    item.activityType,
    `${path}.activityType`
  ) as WorkActivityType;
  if (!WORK_ACTIVITY_TYPES.has(activityType)) {
    invalid(`${path}.activityType`, "알 수 없는 직업 활동 유형입니다.");
  }
  return {
    id: stringAt(item.id, `${path}.id`, { maxLength: 100 }),
    templateId: optionalStringAt(item.templateId, `${path}.templateId`, 100),
    name: stringAt(item.name, `${path}.name`, { maxLength: 100 }),
    activityType,
    hours: finiteNumberAt(item.hours, `${path}.hours`, {
      min: 0.25,
      max: 24
    }) as number
  };
}

function dailyExerciseAt(value: unknown, path: string): DailyExercise {
  const item = objectAt(value, path);
  const category = stringAt(
    item.category,
    `${path}.category`
  ) as ExerciseCategory;
  const intensity = stringAt(
    item.intensity,
    `${path}.intensity`
  ) as ExerciseIntensity;
  if (!EXERCISE_CATEGORIES.has(category)) {
    invalid(`${path}.category`, "알 수 없는 운동 종류입니다.");
  }
  if (!EXERCISE_INTENSITIES.has(intensity)) {
    invalid(`${path}.intensity`, "알 수 없는 운동 강도입니다.");
  }
  return {
    id: stringAt(item.id, `${path}.id`, { maxLength: 100 }),
    templateId: optionalStringAt(item.templateId, `${path}.templateId`, 100),
    name: stringAt(item.name, `${path}.name`, { maxLength: 100 }),
    category,
    intensity,
    durationMinutes: finiteNumberAt(
      item.durationMinutes,
      `${path}.durationMinutes`,
      { min: 1, max: 1_440 }
    ) as number
  };
}

function dailyMetabolismEntryAt(
  value: unknown,
  path: string
): DailyMetabolismEntry {
  const item = objectAt(value, path);
  if (!Array.isArray(item.jobActivities)) {
    invalid(`${path}.jobActivities`, "목록이어야 합니다.");
  }
  if (!Array.isArray(item.exercises)) {
    invalid(`${path}.exercises`, "목록이어야 합니다.");
  }
  const entry: DailyMetabolismEntry = {
    id: dateKeyAt(item.id, `${path}.id`),
    date: dateKeyAt(item.date, `${path}.date`),
    weightKg: finiteNumberAt(item.weightKg, `${path}.weightKg`, {
      min: 30,
      max: 350
    }) as number,
    bodyFatPercent:
      item.bodyFatPercent == null
        ? undefined
        : (finiteNumberAt(
            item.bodyFatPercent,
            `${path}.bodyFatPercent`,
            { min: 1, max: 75 }
          ) as number),
    steps:
      item.steps == null
        ? undefined
        : (finiteNumberAt(item.steps, `${path}.steps`, {
            integer: true,
            min: 0,
            max: 200_000
          }) as number),
    dietComplete: booleanAt(item.dietComplete, `${path}.dietComplete`),
    jobActivities: item.jobActivities.map((activity, index) =>
      dailyWorkActivityAt(activity, `${path}.jobActivities[${index}]`)
    ),
    exercises: item.exercises.map((exercise, index) =>
      dailyExerciseAt(exercise, `${path}.exercises[${index}]`)
    ),
    createdAt: isoDateAt(item.createdAt, `${path}.createdAt`),
    updatedAt: isoDateAt(item.updatedAt, `${path}.updatedAt`)
  };
  try {
    validateDailyMetabolismEntry(entry);
  } catch (error) {
    invalid(
      path,
      error instanceof Error ? error.message : "일일 기록이 올바르지 않습니다."
    );
  }
  return entry;
}

function photoAt(value: unknown, path: string): BackupPhoto {
  const item = objectAt(value, path);
  const dataUrl = stringAt(item.dataUrl, `${path}.dataUrl`, {
    maxLength: 20_000_000
  });
  if (!IMAGE_DATA_URL_PATTERN.test(dataUrl)) {
    invalid(`${path}.dataUrl`, "지원되는 Base64 이미지가 아닙니다.");
  }
  try {
    atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  } catch {
    invalid(`${path}.dataUrl`, "Base64 이미지 데이터가 손상되었습니다.");
  }

  return {
    id: stringAt(item.id, `${path}.id`, { maxLength: 500 }),
    recordId: stringAt(item.recordId, `${path}.recordId`, { maxLength: 500 }),
    dataUrl,
    width: finiteNumberAt(item.width, `${path}.width`, {
      integer: true,
      min: 1,
      max: 20_000
    }) as number,
    height: finiteNumberAt(item.height, `${path}.height`, {
      integer: true,
      min: 1,
      max: 20_000
    }) as number,
    createdAt: isoDateAt(item.createdAt, `${path}.createdAt`)
  };
}

/**
 * Parses and whitelists a backup. Version-1 food-only backups are normalized
 * to the current schema with empty metabolism data.
 */
export function parseBackup(value: string | unknown): DietLogBackup {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("올바른 JSON 백업 파일이 아닙니다.");
    }
  }

  const root = objectAt(parsed, "최상위");
  if (root.app !== APP_NAME) invalid("app", `"${APP_NAME}" 백업이 아닙니다.`);
  if (root.schemaVersion !== 1 && root.schemaVersion !== 2) {
    invalid("schemaVersion", "지원하지 않는 백업 버전입니다.");
  }
  if (!Array.isArray(root.records)) invalid("records", "목록이어야 합니다.");
  if (!Array.isArray(root.photos)) invalid("photos", "목록이어야 합니다.");

  const records = root.records.map((record, index) =>
    recordAt(record, `records[${index}]`)
  );
  const photos = root.photos.map((photo, index) =>
    photoAt(photo, `photos[${index}]`)
  );
  const recordIds = records.map((record) => record.id);
  const photoIds = photos.map((photo) => photo.id);
  if (new Set(recordIds).size !== recordIds.length) {
    invalid("records", "기록 ID가 중복되었습니다.");
  }
  if (new Set(photoIds).size !== photoIds.length) {
    invalid("photos", "사진 ID가 중복되었습니다.");
  }

  const recordsById = new Map(records.map((record) => [record.id, record]));
  const photosById = new Map(photos.map((photo) => [photo.id, photo]));
  for (const photo of photos) {
    const record = recordsById.get(photo.recordId);
    if (!record || !record.photoIds.includes(photo.id)) {
      invalid("photos", `사진 ${photo.id}의 기록 연결이 올바르지 않습니다.`);
    }
  }
  for (const record of records) {
    for (const photoId of record.photoIds) {
      const photo = photosById.get(photoId);
      if (!photo || photo.recordId !== record.id) {
        invalid(
          "records",
          `기록 ${record.id}가 존재하지 않는 사진 ${photoId}을(를) 참조합니다.`
        );
      }
    }
  }

  const metabolismProfile =
    root.schemaVersion === 1 || root.metabolismProfile == null
      ? null
      : metabolismProfileAt(root.metabolismProfile, "metabolismProfile");
  const metabolismEntries =
    root.schemaVersion === 1
      ? []
      : (() => {
          if (!Array.isArray(root.metabolismEntries)) {
            invalid("metabolismEntries", "목록이어야 합니다.");
          }
          const entries = root.metabolismEntries.map((entry, index) =>
            dailyMetabolismEntryAt(entry, `metabolismEntries[${index}]`)
          );
          if (
            new Set(entries.map((entry) => entry.id)).size !== entries.length
          ) {
            invalid("metabolismEntries", "날짜가 중복되었습니다.");
          }
          return entries;
        })();

  return {
    app: APP_NAME,
    schemaVersion: 2,
    // Backups created before this flag existed always included every photo.
    photosIncluded:
      root.photosIncluded == null
        ? true
        : booleanAt(root.photosIncluded, "photosIncluded"),
    exportedAt: isoDateAt(root.exportedAt, "exportedAt"),
    settings: settingsAt(root.settings, "settings"),
    records,
    photos,
    metabolismProfile,
    metabolismEntries
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("사진을 백업 파일로 변환하지 못했습니다."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("사진을 백업 파일로 변환하지 못했습니다."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const mimeType = header.slice(5, header.indexOf(";")) || "image/jpeg";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function createBackup(
  options: BackupOptions = {}
): Promise<DietLogBackup> {
  const includePhotos = options.includePhotos ?? true;
  const [settings, records, metabolismProfile, metabolismEntries] =
    await Promise.all([
    getSettings(),
    listRecords(),
    getMetabolismProfile(),
    listDailyMetabolismEntries()
  ]);
  if (!includePhotos) {
    return {
      app: APP_NAME,
      schemaVersion: 2,
      photosIncluded: false,
      exportedAt: new Date().toISOString(),
      settings,
      records: records.map((record) => ({ ...record, photoIds: [] })),
      photos: [],
      metabolismProfile: metabolismProfile ?? null,
      metabolismEntries
    };
  }

  // Read and encode one photo at a time. Loading every Blob and running many
  // FileReaders concurrently can exhaust memory on mobile devices.
  const backupPhotos: BackupPhoto[] = [];
  for (const record of records) {
    for (const photoId of record.photoIds) {
      const photo = await db.photos.get(photoId);
      if (!photo || photo.recordId !== record.id) {
        throw new Error("일부 사진을 찾을 수 없어 백업을 만들지 못했습니다.");
      }
      backupPhotos.push({
        id: photo.id,
        recordId: photo.recordId,
        dataUrl: await blobToDataUrl(photo.blob),
        width: photo.width,
        height: photo.height,
        createdAt: photo.createdAt
      });
    }
  }

  return {
    app: APP_NAME,
    schemaVersion: 2,
    photosIncluded: true,
    exportedAt: new Date().toISOString(),
    settings,
    records,
    photos: backupPhotos,
    metabolismProfile: metabolismProfile ?? null,
    metabolismEntries
  };
}

export function serializeBackup(backup: DietLogBackup): string {
  return JSON.stringify(backup, null, 2);
}

export function exportBackup(): Promise<DietLogBackup>;
export function exportBackup(
  format: "json",
  options?: BackupOptions
): Promise<string>;
export async function exportBackup(
  format?: "json",
  options: BackupOptions = {}
): Promise<DietLogBackup | string> {
  const backup = await createBackup(options);
  return format === "json" ? serializeBackup(backup) : backup;
}

export async function importBackup(
  source: string | Blob | DietLogBackup,
  mode: ImportMode = "merge"
): Promise<ImportBackupResult> {
  if (mode !== "merge" && mode !== "replace") {
    throw new Error("알 수 없는 복원 방식입니다.");
  }
  const raw =
    typeof source === "string"
      ? source
      : source instanceof Blob
        ? await source.text()
        : source;
  const backup = parseBackup(raw);
  const photoAssets: PhotoAsset[] = backup.photos.map((photo) => ({
    id: photo.id,
    recordId: photo.recordId,
    blob: dataUrlToBlob(photo.dataUrl),
    width: photo.width,
    height: photo.height,
    createdAt: photo.createdAt
  }));
  let recordsImported = backup.records.length;
  let recordsSkipped = 0;
  let photosImported = photoAssets.length;
  let metabolismEntriesImported = backup.metabolismEntries.length;
  let metabolismEntriesSkipped = 0;
  let metabolismProfileImported = Boolean(backup.metabolismProfile);

  await db.transaction(
    "rw",
    db.records,
    db.photos,
    db.settings,
    db.metabolismProfiles,
    db.dailyMetabolismEntries,
    async () => {
      if (mode === "replace") {
        await db.photos.clear();
        await db.records.clear();
        await db.settings.clear();
        await db.metabolismProfiles.clear();
        await db.dailyMetabolismEntries.clear();
        if (backup.records.length > 0) {
          await db.records.bulkPut(backup.records);
        }
        if (photoAssets.length > 0) {
          await db.photos.bulkPut(photoAssets);
        }
        await db.settings.put(backup.settings);
        if (backup.metabolismProfile) {
          await db.metabolismProfiles.put(backup.metabolismProfile);
        }
        if (backup.metabolismEntries.length > 0) {
          await db.dailyMetabolismEntries.bulkPut(backup.metabolismEntries);
        }
      } else {
        const existingRecords = await db.records.bulkGet(
          backup.records.map((record) => record.id)
        );
        const incomingRecords = backup.records.flatMap((record, index) => {
          const existing = existingRecords[index];
          const shouldImport =
            !existing ||
            Date.parse(record.updatedAt) > Date.parse(existing.updatedAt);
          if (!shouldImport) return [];
          if (!backup.photosIncluded && existing) {
            return [{ ...record, photoIds: [...existing.photoIds] }];
          }
          return [record];
        });
        const incomingRecordIds = new Set(
          incomingRecords.map((record) => record.id)
        );
        const incomingPhotos = photoAssets.filter((photo) =>
          incomingRecordIds.has(photo.recordId)
        );

        recordsImported = incomingRecords.length;
        recordsSkipped = backup.records.length - incomingRecords.length;
        photosImported = incomingPhotos.length;

        if (incomingPhotos.length > 0) {
          const collidingPhotos = await db.photos.bulkGet(
            incomingPhotos.map((photo) => photo.id)
          );
          const hasForeignCollision = collidingPhotos.some(
            (stored, index) =>
              stored &&
              stored.recordId !== incomingPhotos[index].recordId &&
              !incomingRecordIds.has(stored.recordId)
          );
          if (hasForeignCollision) {
            throw new Error(
              "기존 기록과 사진 ID가 충돌해 안전하게 병합할 수 없습니다."
            );
          }
        }

        if (backup.photosIncluded && incomingRecordIds.size > 0) {
          await db.photos
            .where("recordId")
            .anyOf([...incomingRecordIds])
            .delete();
        }
        if (incomingRecords.length > 0) {
          await db.records.bulkPut(incomingRecords);
        }
        if (incomingPhotos.length > 0) {
          await db.photos.bulkPut(incomingPhotos);
        }

        const currentSettings = await db.settings.get("app");
        if (!currentSettings) {
          await db.settings.put(backup.settings);
        } else {
          const incomingIsNewer =
            Date.parse(backup.settings.updatedAt) >
            Date.parse(currentSettings.updatedAt);
          const baseSettings = incomingIsNewer
            ? backup.settings
            : currentSettings;
          const mergedGoals = mergeGoalSettings(
            currentSettings.goalSettings,
            backup.settings.goalSettings
          );
          await db.settings.put({
            ...baseSettings,
            goalSettings: mergedGoals,
            updatedAt:
              mergedGoals &&
              Date.parse(mergedGoals.updatedAt) >
                Date.parse(baseSettings.updatedAt)
                ? mergedGoals.updatedAt
                : baseSettings.updatedAt
          });
        }

        const currentProfile = await db.metabolismProfiles.get("metabolism");
        const shouldImportProfile =
          backup.metabolismProfile != null &&
          (!currentProfile ||
            Date.parse(backup.metabolismProfile.updatedAt) >
              Date.parse(currentProfile.updatedAt));
        metabolismProfileImported = shouldImportProfile;
        if (shouldImportProfile && backup.metabolismProfile) {
          await db.metabolismProfiles.put(backup.metabolismProfile);
        }

        const currentMetabolismEntries =
          await db.dailyMetabolismEntries.bulkGet(
            backup.metabolismEntries.map((entry) => entry.id)
          );
        const incomingMetabolismEntries = backup.metabolismEntries.filter(
          (entry, index) => {
            const current = currentMetabolismEntries[index];
            return (
              !current ||
              Date.parse(entry.updatedAt) > Date.parse(current.updatedAt)
            );
          }
        );
        metabolismEntriesImported = incomingMetabolismEntries.length;
        metabolismEntriesSkipped =
          backup.metabolismEntries.length - incomingMetabolismEntries.length;
        if (incomingMetabolismEntries.length > 0) {
          await db.dailyMetabolismEntries.bulkPut(incomingMetabolismEntries);
        }
      }
    }
  );

  return {
    mode,
    recordsImported,
    recordsSkipped,
    photosImported,
    metabolismEntriesImported,
    metabolismEntriesSkipped,
    metabolismProfileImported
  };
}

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  let text = typeof value === "boolean" ? (value ? "예" : "아니요") : String(value);
  // Prevent spreadsheet programs from interpreting user text as a formula.
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const CSV_HEADERS = [
  "기록 ID",
  "식단 날짜",
  "섭취 시각",
  "음식명",
  "섭취량",
  "칼로리(kcal)",
  "탄수화물(g)",
  "단백질(g)",
  "지방(g)",
  "당류(g)",
  "나트륨(mg)",
  "식이섬유(g)",
  "포화지방(g)",
  "입력 방식",
  "사용자 수정",
  "기록 메모",
  "분석 상태",
  "추정 가정"
] as const;

const SOURCE_LABEL: Record<FoodSource, string> = {
  ai: "AI 분석",
  manual: "수동 입력",
  copied: "이전 기록 복사"
};

export function buildCsv(
  records: readonly FoodRecord[],
  dayStartHour = 2
): string {
  const rows: string[][] = [CSV_HEADERS.map(csvCell)];
  const sortedRecords = [...records].sort(
    (left, right) => Date.parse(left.consumedAt) - Date.parse(right.consumedAt)
  );

  for (const record of sortedRecords) {
    const foods: Array<FoodItem | null> =
      record.foods.length > 0 ? record.foods : [null];
    for (const food of foods) {
      rows.push(
        [
          record.id,
          getRecordDayKey(record, dayStartHour),
          formatRecordTime(record),
          food?.name,
          food?.amountText,
          food?.nutrients.energyKcal,
          food?.nutrients.carbsG,
          food?.nutrients.proteinG,
          food?.nutrients.fatG,
          food?.nutrients.sugarG,
          food?.nutrients.sodiumMg,
          food?.nutrients.fiberG,
          food?.nutrients.saturatedFatG,
          food ? SOURCE_LABEL[food.source] : "",
          food?.userEdited,
          record.note,
          record.analysis.status,
          record.analysis.assumptions.join(" | ")
        ].map(csvCell)
      );
    }
  }
  // The BOM makes Korean column names open correctly in mobile/desktop Excel.
  return `\uFEFF${rows.map((row) => row.join(",")).join("\r\n")}`;
}

function displayNumber(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "미입력";
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: digits
  }).format(value);
}

function macroSummary(nutrients: Nutrients): string {
  return [
    nutrients.energyKcal == null
      ? "칼로리 미입력"
      : `${displayNumber(nutrients.energyKcal, 0)} kcal`,
    `탄수화물 ${displayNumber(nutrients.carbsG)}${nutrients.carbsG == null ? "" : "g"}`,
    `단백질 ${displayNumber(nutrients.proteinG)}${nutrients.proteinG == null ? "" : "g"}`,
    `지방 ${displayNumber(nutrients.fatG)}${nutrients.fatG == null ? "" : "g"}`
  ].join(" · ");
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildMarkdown(
  records: readonly FoodRecord[],
  dayStartHour = 2
): string {
  const groups = groupRecordsByDay(records, dayStartHour, "asc");
  const lines = ["# 식단 기록", ""];

  if (groups.length === 0) {
    lines.push("선택한 기간에 기록이 없습니다.");
    return lines.join("\n");
  }

  const firstDay = groups[0].dayKey;
  const lastDay = groups[groups.length - 1].dayKey;
  const totals = sumRecords(records);
  lines.push(
    `- 기간: ${formatDayKey(firstDay)} ~ ${formatDayKey(lastDay)}`,
    `- 기록한 날: ${groups.length}일`,
    `- 전체 합계: ${macroSummary(totals)}`,
    `- 하루 기준: 새벽 ${String(dayStartHour).padStart(2, "0")}:00`,
    "",
    "> 영양성분의 미입력 값은 0으로 계산하지 않았으며, AI 분석값은 추정치입니다.",
    ""
  );

  for (const group of groups) {
    const dayTotals = sumRecords(group.records);
    lines.push(
      `## ${formatDayLabel(group.dayKey, true)}`,
      "",
      `**일일 합계:** ${macroSummary(dayTotals)}${
        dayTotals.hasMissingCoreValues ? " (일부 미입력)" : ""
      }`,
      ""
    );

    for (const record of group.records) {
      const time = formatRecordTimeForDay(record, dayStartHour);
      if (record.foods.length === 0) {
        lines.push(`- **${time}** 음식 항목 없음`);
      } else {
        record.foods.forEach((food, index) => {
          const amount = singleLine(food.amountText);
          const prefix = index === 0 ? `- **${time}**` : "  -";
          lines.push(
            `${prefix} ${singleLine(food.name)}${amount ? ` (${amount})` : ""} — ${macroSummary(
              food.nutrients
            )}${food.source === "ai" ? " · AI 추정" : ""}${
              food.userEdited ? " · 수정됨" : ""
            }`
          );
        });
      }

      const note = singleLine(record.note);
      if (note) lines.push(`  - 메모: ${note}`);
      if (record.analysis.assumptions.length > 0) {
        lines.push(
          `  - 추정 가정: ${record.analysis.assumptions
            .map(singleLine)
            .filter(Boolean)
            .join("; ")}`
        );
      }
    }
    lines.push("");
  }

  lines.push(
    "## 분석 요청",
    "",
    "위 기록을 바탕으로 체중 감량과 단백질 섭취 관점에서 식습관의 장점, 보완할 점, 실천하기 쉬운 다음 행동을 알려주세요. 미입력 값과 AI 추정치의 불확실성을 고려하고, 의학적 진단처럼 단정하지 말아주세요."
  );
  return lines.join("\n").trim();
}

export function downloadTextFile(
  content: string,
  filename: string,
  mimeType = "text/plain;charset=utf-8"
): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new Error("이 환경에서는 파일을 다운로드할 수 없습니다.");
  }
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
