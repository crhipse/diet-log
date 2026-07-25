import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { EMPTY_NUTRIENTS } from "../constants";
import { inputNumber, toNullableNumber } from "../lib/format";
import { createId } from "../lib/id";
import type { FoodItem, Nutrients } from "../types";

interface FoodEditorProps {
  foods: FoodItem[];
  onChange: (foods: FoodItem[]) => void;
  compact?: boolean;
}

interface NutrientField {
  key: keyof Nutrients;
  label: string;
  unit: string;
}

const coreFields: NutrientField[] = [
  { key: "energyKcal", label: "칼로리", unit: "kcal" },
  { key: "carbsG", label: "탄수화물", unit: "g" },
  { key: "proteinG", label: "단백질", unit: "g" },
  { key: "fatG", label: "지방", unit: "g" }
];

const extraFields: NutrientField[] = [
  { key: "sugarG", label: "당류", unit: "g" },
  { key: "sodiumMg", label: "나트륨", unit: "mg" },
  { key: "fiberG", label: "식이섬유", unit: "g" },
  { key: "saturatedFatG", label: "포화지방", unit: "g" }
];

export function createEmptyFood(): FoodItem {
  return {
    id: createId("food"),
    name: "",
    amountText: "",
    nutrients: { ...EMPTY_NUTRIENTS },
    source: "manual",
    userEdited: false
  };
}

export default function FoodEditor({
  foods,
  onChange,
  compact = false
}: FoodEditorProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const updateFood = (id: string, updates: Partial<FoodItem>) => {
    onChange(
      foods.map((food) =>
        food.id === id ? { ...food, ...updates, userEdited: true } : food
      )
    );
  };

  const updateNutrient = (
    id: string,
    key: keyof Nutrients,
    value: string
  ) => {
    onChange(
      foods.map((food) =>
        food.id === id
          ? {
              ...food,
              userEdited: true,
              nutrients: {
                ...food.nutrients,
                [key]: toNullableNumber(value)
              }
            }
          : food
      )
    );
  };

  const removeFood = (id: string) => {
    onChange(foods.filter((food) => food.id !== id));
  };

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="food-editor">
      {foods.map((food, index) => {
        const isExpanded = expanded.has(food.id);
        return (
          <section className="food-edit-card" key={food.id}>
            <div className="food-edit-card__heading">
              <span className="eyebrow">음식 {index + 1}</span>
              <button
                className="icon-button icon-button--small icon-button--danger"
                type="button"
                aria-label={`음식 ${index + 1} 삭제`}
                onClick={() => removeFood(food.id)}
              >
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </div>

            <div className="field-grid field-grid--food-name">
              <label className="field">
                <span>음식명</span>
                <input
                  value={food.name}
                  placeholder="예: 닭가슴살"
                  onChange={(event) =>
                    updateFood(food.id, { name: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>먹은 양</span>
                <input
                  value={food.amountText}
                  placeholder="예: 150g, 반 공기"
                  onChange={(event) =>
                    updateFood(food.id, { amountText: event.target.value })
                  }
                />
              </label>
            </div>

            <div
              className={
                compact
                  ? "nutrient-inputs nutrient-inputs--compact"
                  : "nutrient-inputs"
              }
            >
              {coreFields.map((field) => (
                <NutrientInput
                  key={field.key}
                  field={field}
                  value={food.nutrients[field.key]}
                  onChange={(value) =>
                    updateNutrient(food.id, field.key, value)
                  }
                />
              ))}
            </div>

            <button
              className="text-button text-button--muted food-edit-card__more"
              type="button"
              onClick={() => toggleExpanded(food.id)}
            >
              추가 영양소 {isExpanded ? "접기" : "입력"}
              {isExpanded ? (
                <ChevronUp size={16} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" />
              )}
            </button>

            {isExpanded && (
              <div className="nutrient-inputs nutrient-inputs--extra">
                {extraFields.map((field) => (
                  <NutrientInput
                    key={field.key}
                    field={field}
                    value={food.nutrients[field.key]}
                    onChange={(value) =>
                      updateNutrient(food.id, field.key, value)
                    }
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <button
        className="secondary-button secondary-button--dashed"
        type="button"
        onClick={() => onChange([...foods, createEmptyFood()])}
      >
        <Plus size={18} aria-hidden="true" />
        음식 추가
      </button>
    </div>
  );
}

function NutrientInput({
  field,
  value,
  onChange
}: {
  field: NutrientField;
  value: number | null;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field field--number">
      <span>{field.label}</span>
      <span className="number-input">
        <input
          type="number"
          min="0"
          step="0.1"
          inputMode="decimal"
          value={inputNumber(value)}
          placeholder="—"
          onChange={(event) => onChange(event.target.value)}
        />
        <span>{field.unit}</span>
      </span>
    </label>
  );
}
