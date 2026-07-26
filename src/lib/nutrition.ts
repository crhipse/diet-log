import type {
  DailyTotals,
  FoodItem,
  FoodRecord,
  Nutrients
} from "../types";

export const NUTRIENT_KEYS = [
  "energyKcal",
  "carbsG",
  "proteinG",
  "fatG",
  "sugarG",
  "sodiumMg",
  "fiberG",
  "saturatedFatG"
] as const satisfies readonly (keyof Nutrients)[];

export const CORE_NUTRIENT_KEYS = [
  "energyKcal",
  "carbsG",
  "proteinG",
  "fatG"
] as const satisfies readonly (keyof Nutrients)[];

const DISPLAY_PRECISION: Record<keyof Nutrients, number> = {
  energyKcal: 0,
  carbsG: 1,
  proteinG: 1,
  fatG: 1,
  sugarG: 1,
  sodiumMg: 0,
  fiberG: 1,
  saturatedFatG: 1
};

function rounded(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isKnown(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Adds known nutrient values while keeping an entirely unknown nutrient null.
 * Missing values are never silently converted into zero.
 */
export function sumNutrients(
  nutrients: readonly Nutrients[]
): DailyTotals {
  const result = {} as Nutrients;

  for (const key of NUTRIENT_KEYS) {
    const knownValues = nutrients
      .map((entry) => entry[key])
      .filter(isKnown);
    result[key] =
      knownValues.length === 0
        ? null
        : rounded(knownValues.reduce((sum, value) => sum + value, 0));
  }

  return {
    ...result,
    hasMissingCoreValues:
      nutrients.length === 0 ||
      nutrients.some((entry) =>
        CORE_NUTRIENT_KEYS.some((key) => !isKnown(entry[key]))
      )
  };
}

export function sumFoods(foods: readonly FoodItem[]): DailyTotals {
  return sumNutrients(foods.map((food) => food.nutrients));
}

export function sumRecords(records: readonly FoodRecord[]): DailyTotals {
  return sumFoods(records.flatMap((record) => record.foods));
}

/**
 * Returns a day's calorie total only when every saved record contains at
 * least one food and every food has a calorie value. This keeps pending or
 * failed records out of personalized TDEE learning.
 */
export function completeEnergyTotal(
  records: readonly FoodRecord[]
): number | null {
  if (
    records.length === 0 ||
    records.some(
      (record) =>
        record.foods.length === 0 ||
        record.foods.some((food) => !isKnown(food.nutrients.energyKcal))
    )
  ) {
    return null;
  }
  return rounded(
    records
      .flatMap((record) => record.foods)
      .reduce((sum, food) => sum + food.nutrients.energyKcal!, 0)
  );
}

export const calculateRecordTotals = (
  record: Pick<FoodRecord, "foods">
): DailyTotals => sumFoods(record.foods);

export const calculateDailyTotals = sumRecords;

export function hasAnyNutrientValue(
  nutrients: Nutrients
): boolean {
  return NUTRIENT_KEYS.some((key) => isKnown(nutrients[key]));
}

export function formatNutrientValue(
  value: number | null | undefined,
  key: keyof Nutrients
): string {
  if (!isKnown(value)) return "미입력";
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: DISPLAY_PRECISION[key]
  }).format(value);
}

export function buildCompactNutrientLine(nutrients: Nutrients): string {
  const kcal = isKnown(nutrients.energyKcal)
    ? `${formatNutrientValue(nutrients.energyKcal, "energyKcal")} kcal`
    : "칼로리 미입력";
  return [
    kcal,
    `탄 ${formatNutrientValue(nutrients.carbsG, "carbsG")}g`,
    `단 ${formatNutrientValue(nutrients.proteinG, "proteinG")}g`,
    `지 ${formatNutrientValue(nutrients.fatG, "fatG")}g`
  ].join(" · ");
}
