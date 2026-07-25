import { EMPTY_NUTRIENTS } from "../constants";
import type { FoodItem } from "../types";
import { sumFoods } from "./nutrition";

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
});
