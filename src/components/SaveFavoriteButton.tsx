import { useState } from "react";
import { Star } from "lucide-react";
import type { FoodItem } from "../types";
import { saveFavoriteFood } from "../lib/favorites";
import type { Notify } from "./NutrientScaleControl";

export default function SaveFavoriteButton({ food, onNotify, disabled }: {
  food: FoodItem; onNotify?: Notify; disabled?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const save = async () => {
    setSaving(true);
    try {
      await saveFavoriteFood(food);
      setMessage("즐겨찾기에 저장했어요.");
      onNotify?.("즐겨찾기에 저장했어요.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "즐겨찾기를 저장하지 못했어요.";
      setMessage(text);
      onNotify?.(text, "error");
    } finally { setSaving(false); }
  };
  return (
    <div className="favorite-save">
      <button className="text-button" type="button" disabled={disabled || saving}
        aria-label={`${food.name || "음식"} 즐겨찾기에 저장`} onClick={() => void save()}>
        <Star size={16} aria-hidden="true" />{saving ? "저장 중…" : "즐겨찾기에 저장"}
      </button>
      {!onNotify && message && <p role="status">{message}</p>}
    </div>
  );
}
