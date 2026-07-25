import type { AppSettings, Nutrients } from "./types";

export const APP_NAME = "식단관리";
export const DEFAULT_MODEL_ID = "claude-sonnet-5";
export const MAX_PHOTOS_PER_RECORD = 5;
export const MAX_IMAGE_DIMENSION = 1024;
export const IMAGE_QUALITY = 0.78;

export const EMPTY_NUTRIENTS: Nutrients = {
  energyKcal: null,
  carbsG: null,
  proteinG: null,
  fatG: null,
  sugarG: null,
  sodiumMg: null,
  fiberG: null,
  saturatedFatG: null
};

export const DEFAULT_SETTINGS: AppSettings = {
  id: "app",
  dayStartHour: 2,
  modelId: DEFAULT_MODEL_ID,
  updatedAt: new Date(0).toISOString()
};

export const MODEL_PRESETS = [
  {
    id: "claude-sonnet-5",
    name: "Sonnet 5",
    description: "기본 · 정확도와 비용의 균형"
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Haiku 4.5",
    description: "빠르고 저렴한 분석"
  },
  {
    id: "claude-sonnet-4-6",
    name: "Sonnet 4.6",
    description: "안정적인 대체 모델"
  },
  {
    id: "claude-opus-4-8",
    name: "Opus 4.8",
    description: "높은 정확도 · 높은 비용"
  }
] as const;
