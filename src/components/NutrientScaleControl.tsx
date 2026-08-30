import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { FoodItem } from "../types";
import { hasAnyNutrientValue, NUTRIENT_SCALE_MAX, NUTRIENT_SCALE_MIN, scaleFoodNutrients } from "../lib/nutrition";

export type Notify = (message: string, tone?: "default" | "error") => void;

export default function NutrientScaleControl({ foods, onChange, disabled, onNotify }: {
  foods: FoodItem[];
  onChange: (foods: FoodItem[]) => void;
  disabled?: boolean;
  onNotify?: Notify;
}) {
  const [multiplier, setMultiplier] = useState("1");
  const [message, setMessage] = useState("");
  const apply = () => {
    try {
      if (!foods.some((food) => hasAnyNutrientValue(food.nutrients))) {
        throw new Error("배율을 적용할 영양성분이 없습니다.");
      }
      onChange(scaleFoodNutrients(foods, Number(multiplier)));
      const text = `모든 영양성분에 ×${Number(multiplier)}를 적용했어요.`;
      setMultiplier("1");
      setMessage(text);
      onNotify?.(text);
    } catch (error) {
      const text = error instanceof Error ? error.message : "배율을 확인해주세요.";
      setMessage(text);
      onNotify?.(text, "error");
    }
  };

  return (
    <div className="nutrient-scale-control">
      <div className="nutrient-scale-control__heading">
        <SlidersHorizontal size={18} aria-hidden="true" />
        <span>
          <strong>전체 영양성분 배율 조정</strong>
          <small>현재 입력된 모든 음식의 칼로리·탄단지와 추가 영양소에 같은 배율을 적용해요.</small>
        </span>
      </div>
      <div className="nutrient-scale-presets" aria-label="빠른 배율 선택">
        {[0.5, 0.8, 1.2, 1.5].map((value) => (
          <button type="button" key={value} disabled={disabled}
            aria-pressed={multiplier === String(value)}
            onClick={() => setMultiplier(String(value))}>×{value}</button>
        ))}
      </div>
      <div className="nutrient-scale-control__apply">
        <label className="field field--number">
          <span>직접 배율</span>
          <span className="number-input">
            <input type="number" min={NUTRIENT_SCALE_MIN} max={NUTRIENT_SCALE_MAX}
              step="0.1" inputMode="decimal" value={multiplier} disabled={disabled}
              aria-label="전체 영양성분 배율" onChange={(event) => setMultiplier(event.target.value)} />
            <span>배</span>
          </span>
        </label>
        <button className="secondary-button" type="button"
          disabled={disabled || Number(multiplier) === 1} onClick={apply}>배율 적용</button>
      </div>
      <p>현재 숫자에 곱합니다. 먹은 양 설명은 직접 확인하고, 마지막에 저장을 눌러주세요.</p>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
