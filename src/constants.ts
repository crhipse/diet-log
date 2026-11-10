import type { AppSettings, Nutrients } from "./types";

export const APP_NAME = "식단관리";
export const DEFAULT_MODEL_ID = "claude-sonnet-5-5";
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
    id: DEFAULT_MODEL_ID,
    name: "Sonnet 5.5",
    description: "기본 · 정확도와 비용의 균형"
  },
  {
    id: "claude-haiku-5-5",
    name: "Haiku 5.5",
    description: "빠르고 저렴한 분석"
  },
  {
    id: "claude-opus-5-5",
    name: "Opus 5.5",
    description: "복잡한 식단 분석 · 높은 비용"
  },
  {
    id: "claude-fable-5-2",
    name: "Fable 5.2",
    description: "고비용 · Anthropic 요청 데이터 30일 보관"
  }
] as const;
