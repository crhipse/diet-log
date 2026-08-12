import { EMPTY_NUTRIENTS } from "../constants";
import type { FoodItem, FoodRecord } from "../types";
import {
  completeEnergyTotal,
  scaleFoodNutrients,
  sumFoods
} from "./nutrition";

function food(
  id: string,
  nutrients: Partial<FoodItem["nutrients"]>
): FoodItem {
  return {
    id,
    name: id,
    amountText: "",
    source: "manual",
    userEdited: false,
    nutrients: { ...EMPTY_NUTRIENTS, ...nutrients }
  };
}

describe("영양성분 합계", () => {
  it("알려진 값은 더하고 완전히 모르는 값은 null로 보존한다", () => {
    const totals = sumFoods([
      food("a", { energyKcal: 300, proteinG: 20 }),
      food("b", { energyKcal: 250, proteinG: 15 })
    ]);

    expect(totals.energyKcal).toBe(550);
    expect(totals.proteinG).toBe(35);
    expect(totals.sodiumMg).toBeNull();
    expect(totals.hasMissingCoreValues).toBe(true);
  });

  it("모든 핵심 값이 있으면 일부 미입력 표시를 하지 않는다", () => {
    const totals = sumFoods([
      food("a", {
        energyKcal: 500,
        carbsG: 55,
        proteinG: 30,
        fatG: 18
      })
    ]);

    expect(totals.hasMissingCoreValues).toBe(false);
  });

  it("빈 기록이나 칼로리 미입력 음식이 있으면 학습용 합계를 만들지 않는다", () => {
    const record = (id: string, foods: FoodItem[]): FoodRecord => ({
      id,
      consumedAt: "2026-07-26T03:00:00.000Z",
      timezoneOffsetMinutes: -540,
      note: "",
      photoIds: [],
      foods,
      analysis: { status: "not_requested", assumptions: [] },
      createdAt: "2026-07-26T03:00:00.000Z",
      updatedAt: "2026-07-26T03:00:00.000Z"
    });

    expect(
      completeEnergyTotal([
        record("known", [food("a", { energyKcal: 500 })]),
        record("pending", [])
      ])
    ).toBeNull();
    expect(
      completeEnergyTotal([
        record("known", [food("a", { energyKcal: 500 })]),
        record("unknown", [food("b", { energyKcal: null })])
      ])
    ).toBeNull();
    expect(
      completeEnergyTotal([
        record("a", [food("a", { energyKcal: 500 })]),
        record("b", [food("b", { energyKcal: 300 })])
      ])
    ).toBe(800);
  });
});

describe("영양성분 배율 조정", () => {
  it("모든 알려진 영양성분에 같은 배율을 적용하고 null은 유지한다", () => {
    const original = food("scaled", {
      energyKcal: 106,
      carbsG: 1,
      proteinG: 24,
      fatG: 0.7,
      sugarG: 0.4,
      sodiumMg: 82,
      fiberG: null,
      saturatedFatG: 0.2
    });

    const [scaled] = scaleFoodNutrients([original], 1.2);

    expect(scaled.nutrients).toEqual({
      energyKcal: 127.2,
      carbsG: 1.2,
      proteinG: 28.8,
      fatG: 0.84,
      sugarG: 0.48,
      sodiumMg: 98.4,
      fiberG: null,
      saturatedFatG: 0.24
    });
    expect(scaled.userEdited).toBe(true);
    expect(original.nutrients.energyKcal).toBe(106);
  });

  it("허용 범위를 벗어난 배율을 거부한다", () => {
    expect(() => scaleFoodNutrients([], 0)).toThrow("0.1~5");
    expect(() => scaleFoodNutrients([], 5.1)).toThrow("0.1~5");
  });
});
