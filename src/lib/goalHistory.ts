import type { DailyCalorieRange, GoalPlan, GoalRecommendation } from "./goals";
import { GOAL_SAFETY_LIMITS, validateGoalPlan } from "./goals";

export type GoalTdeeSource = "personalized" | "detailed" | "manual";

export interface GoalTargetSnapshot {
  id: string;
  effectiveFrom: string;
  plan: GoalPlan;
  tdeeKcal: number;
  weightKg: number;
  tdeeSource: GoalTdeeSource;
  dailyCalories: DailyCalorieRange;
  proteinMinimumG: number;
  createdAt: string;
}

export interface GoalSettings {
  targets: GoalTargetSnapshot[];
  updatedAt: string;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TDEE_SOURCES = new Set<GoalTdeeSource>([
  "personalized",
  "detailed",
  "manual"
]);
export const MAX_GOAL_TARGETS = 1_000;

export function goalTargetFromRecommendation(input: {
  id: string;
  effectiveFrom: string;
  plan: GoalPlan;
  recommendation: GoalRecommendation;
  tdeeSource: GoalTdeeSource;
  createdAt?: string;
}): GoalTargetSnapshot {
  const target: GoalTargetSnapshot = {
    id: input.id,
    effectiveFrom: input.effectiveFrom,
    plan: input.plan,
    tdeeKcal: input.recommendation.tdeeKcal,
    weightKg: input.recommendation.weightKg,
    tdeeSource: input.tdeeSource,
    dailyCalories: input.recommendation.dailyCalories,
    proteinMinimumG: input.recommendation.proteinMinimumG,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
  validateGoalTarget(target);
  return target;
}

export function appendGoalTarget(
  current: GoalSettings | undefined,
  target: GoalTargetSnapshot
): GoalSettings {
  validateGoalTarget(target);
  const targets = [...(current?.targets ?? []).filter((item) => item.id !== target.id), target]
    .sort(
      (left, right) =>
        left.effectiveFrom.localeCompare(right.effectiveFrom) ||
        left.createdAt.localeCompare(right.createdAt)
    );
  if (targets.length > MAX_GOAL_TARGETS) {
    throw new RangeError(
      `목표 이력은 최대 ${MAX_GOAL_TARGETS}개까지 저장할 수 있습니다.`
    );
  }
  return { targets, updatedAt: target.createdAt };
}

export function goalTargetForDay(
  settings: GoalSettings | undefined,
  dayKey: string
): GoalTargetSnapshot | undefined {
  assertDateKey(dayKey, "조회 날짜");
  return settings?.targets
    .filter((target) => target.effectiveFrom <= dayKey)
    .sort(
      (left, right) =>
        right.effectiveFrom.localeCompare(left.effectiveFrom) ||
        right.createdAt.localeCompare(left.createdAt)
    )[0];
}

export function latestGoalTarget(
  settings: GoalSettings | undefined
): GoalTargetSnapshot | undefined {
  return settings?.targets
    .slice()
    .sort(
      (left, right) =>
        right.effectiveFrom.localeCompare(left.effectiveFrom) ||
        right.createdAt.localeCompare(left.createdAt)
    )[0];
}

export function mergeGoalSettings(
  current: GoalSettings | undefined,
  incoming: GoalSettings | undefined
): GoalSettings | undefined {
  if (!current) return incoming;
  if (!incoming) return current;
  validateGoalSettings(current);
  validateGoalSettings(incoming);

  const targets = new Map<string, GoalTargetSnapshot>();
  for (const target of [...current.targets, ...incoming.targets]) {
    const stored = targets.get(target.id);
    if (!stored || Date.parse(target.createdAt) > Date.parse(stored.createdAt)) {
      targets.set(target.id, target);
    }
  }
  const merged: GoalSettings = {
    targets: [...targets.values()]
      .sort(
        (left, right) =>
          left.effectiveFrom.localeCompare(right.effectiveFrom) ||
          left.createdAt.localeCompare(right.createdAt)
      ),
    updatedAt:
      Date.parse(incoming.updatedAt) > Date.parse(current.updatedAt)
        ? incoming.updatedAt
        : current.updatedAt
  };
  validateGoalSettings(merged);
  return merged;
}

export function validateGoalSettings(settings: GoalSettings): void {
  if (
    !Array.isArray(settings.targets) ||
    settings.targets.length > MAX_GOAL_TARGETS
  ) {
    throw new RangeError(
      `목표 이력은 최대 ${MAX_GOAL_TARGETS}개까지 저장할 수 있습니다.`
    );
  }
  if (Number.isNaN(Date.parse(settings.updatedAt))) {
    throw new Error("목표 수정 시각이 올바르지 않습니다.");
  }
  const ids = settings.targets.map((target) => target.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("목표 이력에 중복된 ID가 있습니다.");
  }
  settings.targets.forEach(validateGoalTarget);
}

export function validateGoalTarget(target: GoalTargetSnapshot): void {
  if (!target.id.trim() || target.id.length > 100) {
    throw new Error("목표 ID가 올바르지 않습니다.");
  }
  assertDateKey(target.effectiveFrom, "목표 적용일");
  validateGoalPlan(target.plan);
  if (
    !Number.isFinite(target.tdeeKcal) ||
    target.tdeeKcal < GOAL_SAFETY_LIMITS.minimumValidTdeeKcal ||
    target.tdeeKcal > GOAL_SAFETY_LIMITS.maximumValidTdeeKcal
  ) {
    throw new RangeError("목표의 TDEE가 올바르지 않습니다.");
  }
  if (
    !Number.isFinite(target.weightKg) ||
    target.weightKg < 30 ||
    target.weightKg > 350
  ) {
    throw new RangeError("목표의 기준 체중이 올바르지 않습니다.");
  }
  if (!TDEE_SOURCES.has(target.tdeeSource)) {
    throw new Error("목표의 TDEE 출처가 올바르지 않습니다.");
  }
  const { minKcal, targetKcal, maxKcal } = target.dailyCalories;
  if (
    ![minKcal, targetKcal, maxKcal].every(
      (value) =>
        Number.isFinite(value) &&
        value >= GOAL_SAFETY_LIMITS.absoluteMinimumDailyKcal &&
        value <= GOAL_SAFETY_LIMITS.maximumValidTdeeKcal
    ) ||
    minKcal > targetKcal ||
    targetKcal > maxKcal
  ) {
    throw new RangeError("목표 칼로리 범위가 올바르지 않습니다.");
  }
  if (
    !Number.isFinite(target.proteinMinimumG) ||
    target.proteinMinimumG < 1 ||
    target.proteinMinimumG > 500
  ) {
    throw new RangeError("목표 단백질량이 올바르지 않습니다.");
  }
  if (Number.isNaN(Date.parse(target.createdAt))) {
    throw new Error("목표 생성 시각이 올바르지 않습니다.");
  }
}

function assertDateKey(value: string, label: string): void {
  if (!DATE_KEY_PATTERN.test(value)) {
    throw new Error(`${label}이 올바르지 않습니다.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label}이 올바르지 않습니다.`);
  }
}
