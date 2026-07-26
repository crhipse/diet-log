import { EMPTY_NUTRIENTS } from "../constants";
import type { FoodItem, FoodRecord } from "../types";
import { completeEnergyTotal, sumFoods } from "./nutrition";

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
