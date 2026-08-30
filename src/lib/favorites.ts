import type { FavoriteFood, FoodItem, Nutrients } from "../types";
import { db } from "./db";
import { createId } from "./id";
import { hasAnyNutrientValue, NUTRIENT_KEYS } from "./nutrition";

type FavoriteInput = Pick<FoodItem, "name" | "amountText" | "nutrients">;

export function validateFavoriteFood(food: FavoriteInput): void {
  if (!food.name.trim() || food.name.length > 2_000) {
    throw new Error("음식명을 입력해주세요. 최대 2,000자까지 저장할 수 있어요.");
  }
  if (food.amountText.length > 10_000) throw new Error("먹은 양 설명이 너무 깁니다.");
  for (const key of NUTRIENT_KEYS) {
    const value = food.nutrients[key];
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 10_000_000)) {
      throw new Error("영양성분은 0 이상의 숫자로 입력하고, 모르는 값은 비워주세요.");
    }
  }
  if (!hasAnyNutrientValue(food.nutrients)) {
    throw new Error("즐겨찾기에 저장할 영양성분을 하나 이상 입력해주세요.");
  }
}

export function listFavoriteFoods(): Promise<FavoriteFood[]> {
  return db.favoriteFoods.orderBy("updatedAt").reverse().toArray();
}

export async function saveFavoriteFood(
  food: FavoriteInput,
  existingId?: string
): Promise<FavoriteFood> {
  validateFavoriteFood(food);
  const name = food.name.trim();
  const amountText = food.amountText.trim();
  const nutrients = Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [key, food.nutrients[key]])
  ) as unknown as Nutrients;

  return db.transaction("rw", db.favoriteFoods, async () => {
    const existing = existingId ? await db.favoriteFoods.get(existingId) : undefined;
    if (existingId && !existing) throw new Error("즐겨찾기를 찾을 수 없습니다. 목록을 다시 열어주세요.");
    // Repeated taps must not create identical entries. Different portions or
    // nutrient values may still be stored separately under the same food name.
    if (!existingId) {
      const matches = await db.favoriteFoods.where("name").equals(name).toArray();
      const duplicate = matches.find((item) => item.amountText === amountText &&
        NUTRIENT_KEYS.every((key) => item.nutrients[key] === nutrients[key]));
      if (duplicate) return duplicate;
    }
    const now = new Date().toISOString();
    const favorite: FavoriteFood = {
      id: existing?.id ?? createId("favorite"), name, amountText, nutrients,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await db.favoriteFoods.put(favorite);
    return favorite;
  });
}

export async function deleteFavoriteFood(id: string): Promise<void> {
  await db.favoriteFoods.delete(id);
}

/** Independent snapshot: editing a meal never modifies the saved favorite. */
export function foodFromFavorite(favorite: FavoriteFood): FoodItem {
  return {
    id: createId("food"),
    name: favorite.name,
    amountText: favorite.amountText,
    nutrients: { ...favorite.nutrients },
    source: "copied",
    userEdited: false
  };
}
