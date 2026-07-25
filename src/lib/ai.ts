import { z } from "zod";
import { MAX_PHOTOS_PER_RECORD } from "../constants";
import type { Confidence, FoodItem, Nutrients } from "../types";
import { createId } from "./id";
import {
  assertPhotoLimit,
  blobToDataUrl,
  getAnthropicImageMediaType
} from "./photos";

const MAX_NOTE_CHARACTERS = 20_000;
const MAX_OUTPUT_TOKENS = 4_096;
const API_TIMEOUT_MS = 90_000;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1";

const nutrientNumber = (maximum: number) =>
  z.number().finite().nonnegative().max(maximum).nullable();

export const foodAnalysisPayloadSchema = z.strictObject({
  foods: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(120),
        amountText: z.string().min(1).max(200),
        nutrients: z.strictObject({
          energyKcal: nutrientNumber(100_000),
          carbsG: nutrientNumber(10_000),
          proteinG: nutrientNumber(10_000),
          fatG: nutrientNumber(10_000),
          sugarG: nutrientNumber(10_000),
          sodiumMg: nutrientNumber(10_000_000),
          fiberG: nutrientNumber(10_000),
          saturatedFatG: nutrientNumber(10_000)
        })
      })
    )
    .max(30),
  assumptions: z.array(z.string().min(1).max(300)).max(20),
  confidence: z.enum(["high", "medium", "low"])
});

export type FoodAnalysisPayload = z.infer<typeof foodAnalysisPayloadSchema>;

export type AnalysisPhoto = Blob | { blob: Blob };

export interface AnalyzeFoodRecordInput {
  apiKey: string;
  modelId: string;
  note: string;
  photos: readonly AnalysisPhoto[];
  signal?: AbortSignal;
}

export interface NormalizedAnalysisInput {
  apiKey: string;
  modelId: string;
  note: string;
  photos: readonly AnalysisPhoto[];
  signal?: AbortSignal;
}

export interface AnalysisTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalInputTokens: number;
}

export interface FoodAnalysisResult {
  foods: FoodItem[];
  assumptions: string[];
  confidence: Confidence;
  modelId: string;
  usage: AnalysisTokenUsage;
}

export interface ApiKeyTestResult {
  ok: true;
  availableModelIds: string[];
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicMessageResponse {
  model: string;
  stop_reason: string | null;
  content: Array<{ type: string; text?: string }>;
  usage: AnthropicUsage;
}

interface AnthropicModelsResponse {
  data: Array<{ id: string }>;
}

const FOOD_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    foods: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          amountText: { type: "string" },
          nutrients: {
            type: "object",
            additionalProperties: false,
            properties: {
              energyKcal: { type: ["number", "null"] },
              carbsG: { type: ["number", "null"] },
              proteinG: { type: ["number", "null"] },
              fatG: { type: ["number", "null"] },
              sugarG: { type: ["number", "null"] },
              sodiumMg: { type: ["number", "null"] },
              fiberG: { type: ["number", "null"] },
              saturatedFatG: { type: ["number", "null"] }
            },
            required: [
              "energyKcal",
              "carbsG",
              "proteinG",
              "fatG",
              "sugarG",
              "sodiumMg",
              "fiberG",
              "saturatedFatG"
            ]
          }
        },
        required: ["name", "amountText", "nutrients"]
      }
    },
    assumptions: {
      type: "array",
      items: { type: "string" }
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"]
    }
  },
  required: ["foods", "assumptions", "confidence"]
} as const;

export const ANALYSIS_SYSTEM_PROMPT = `당신은 식단 기록을 돕는 영양성분 추정 도우미입니다.
사용자가 실제로 섭취했다고 설명하거나 사진에서 섭취한 것으로 명확히 보이는 음식만 분석하세요.
여러 사진은 같은 식사를 다른 각도에서 찍은 사진일 수 있으므로 같은 음식을 중복 계산하지 마세요.
사용자의 양 설명을 사진보다 우선하고, 음식별로 항목을 나누세요.
각 음식에 대해 섭취량 전체의 열량(kcal), 탄수화물(g), 단백질(g), 지방(g), 당류(g), 나트륨(mg), 식이섬유(g), 포화지방(g)을 추정하세요.
확실히 추정할 수 없는 개별 영양소는 0으로 만들지 말고 null로 반환하세요.
amountText에는 추정한 섭취량을 사람이 확인하기 쉬운 한국어로 적으세요.
assumptions에는 음식 종류, 조리법, 중량 등 결과에 영향을 준 핵심 가정만 간결하게 적으세요.
의학적 진단이나 건강 조언은 하지 말고 식단 기록에 필요한 추정치만 반환하세요.`;

export function parseFoodAnalysisPayload(value: unknown): FoodAnalysisPayload {
  return foodAnalysisPayloadSchema.parse(value);
}

export function foodAnalysisPayloadToItems(
  payload: FoodAnalysisPayload
): FoodItem[] {
  return payload.foods.map((food) => ({
    id: createId("food"),
    name: food.name.trim(),
    amountText: food.amountText.trim(),
    nutrients: cloneNutrients(food.nutrients),
    source: "ai",
    userEdited: false
  }));
}

export function buildAnalysisPrompt(note: string, photoCount: number): string {
  const description = note.trim();
  const photoDescription =
    photoCount > 0
      ? `함께 첨부한 사진 ${photoCount}장을 모두 참고하세요. 사진들은 같은 음식의 다른 각도이거나 서로 다른 음식일 수 있습니다.`
      : "첨부된 사진은 없습니다.";

  return `다음 식단 기록을 음식별로 분석해 주세요.

${photoDescription}

사용자 설명:
${description || "(설명 없음 — 사진만 보고 분석)"}`;
}

export function validateAnalysisInput(
  input: AnalyzeFoodRecordInput
): NormalizedAnalysisInput {
  const apiKey = input.apiKey.trim();
  const modelId = input.modelId.trim();
  const note = input.note.trim();

  if (!apiKey) {
    throw new Error("Anthropic API 키를 입력해 주세요.");
  }
  if (!modelId) {
    throw new Error("분석에 사용할 모델을 선택해 주세요.");
  }
  if (note.length > MAX_NOTE_CHARACTERS) {
    throw new Error(
      `음식 설명은 ${MAX_NOTE_CHARACTERS.toLocaleString()}자 이내로 입력해 주세요.`
    );
  }

  assertPhotoLimit(input.photos.length);
  if (!note && input.photos.length === 0) {
    throw new Error("음식 설명이나 사진을 하나 이상 추가해 주세요.");
  }

  for (const photo of input.photos) {
    const blob = getPhotoBlob(photo);
    getAnthropicImageMediaType(blob);
  }

  return {
    ...input,
    apiKey,
    modelId,
    note
  };
}

export async function testApiKey(apiKey: string): Promise<ApiKeyTestResult> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new Error("Anthropic API 키를 입력해 주세요.");
  }

  const models = await anthropicRequest<AnthropicModelsResponse>(
    `${ANTHROPIC_API_URL}/models?limit=1`,
    trimmedKey,
    { method: "GET" }
  );

  return {
    ok: true,
    availableModelIds: models.data.map((model) => model.id)
  };
}

export async function analyzeFoodRecord(
  input: AnalyzeFoodRecordInput
): Promise<FoodAnalysisResult> {
  const normalized = validateAnalysisInput(input);
  const content: Array<Record<string, unknown>> = [];

  for (const [index, photo] of normalized.photos.entries()) {
    const blob = getPhotoBlob(photo);
    const dataUrl = await blobToDataUrl(blob);
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex < 0) {
      throw new Error(`사진 ${index + 1}을(를) 분석용 데이터로 바꾸지 못했습니다.`);
    }

    content.push({
      type: "text",
      text: `사진 ${index + 1}`
    });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: getAnthropicImageMediaType(blob),
        data: dataUrl.slice(commaIndex + 1)
      }
    });
  }

  content.push({
    type: "text",
    text: buildAnalysisPrompt(normalized.note, normalized.photos.length)
  });

  const response = await anthropicRequest<AnthropicMessageResponse>(
    `${ANTHROPIC_API_URL}/messages`,
    normalized.apiKey,
    {
      method: "POST",
      signal: normalized.signal,
      body: JSON.stringify({
        model: normalized.modelId,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        ...(normalized.modelId.startsWith("claude-sonnet-5")
          ? { thinking: { type: "disabled" } }
          : {}),
        output_config: {
          format: {
            type: "json_schema",
            schema: FOOD_ANALYSIS_JSON_SCHEMA
          }
        }
      })
    }
  );

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "분석 결과가 너무 길어 완료하지 못했습니다. 음식을 나누어 다시 시도해 주세요."
    );
  }
  if (response.stop_reason === "refusal") {
    throw new Error("AI가 이 사진 또는 설명을 분석하지 못했습니다.");
  }
  const textBlock = response.content.find(
    (block) => block.type === "text" && typeof block.text === "string"
  );
  if (!textBlock?.text) {
    throw new Error("AI 분석 결과의 형식을 확인하지 못했습니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error("AI 분석 결과를 읽지 못했습니다.");
  }

  const payload = parseFoodAnalysisPayload(parsed);
  const cacheCreationInputTokens =
    response.usage.cache_creation_input_tokens ?? 0;
  const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;

  return {
    foods: foodAnalysisPayloadToItems(payload),
    assumptions: [...payload.assumptions],
    confidence: payload.confidence,
    modelId: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
      totalInputTokens:
        response.usage.input_tokens +
        cacheCreationInputTokens +
        cacheReadInputTokens
    }
  };
}

async function anthropicRequest<T>(
  url: string,
  apiKey: string,
  init: RequestInit
): Promise<T> {
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, API_TIMEOUT_MS);
  const callerSignal = init.signal;
  const abortFromCaller = () => timeoutController.abort();
  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  let response: Response;
  let raw: string;
  try {
    response = await fetch(url, {
      ...init,
      signal: timeoutController.signal,
      headers: {
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
        "x-api-key": apiKey
      }
    });
    raw = await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (timedOut) {
        throw new Error(
          "Claude API 응답이 오래 걸려 요청을 중단했습니다. 다시 시도해주세요."
        );
      }
      throw error;
    }
    throw new Error(
      "Claude API에 연결하지 못했습니다. 인터넷 연결을 확인해주세요."
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }

  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const serverMessage =
      data &&
      typeof data === "object" &&
      "error" in data &&
      data.error &&
      typeof data.error === "object" &&
      "message" in data.error &&
      typeof data.error.message === "string"
        ? data.error.message
        : "";
    throw new Error(apiErrorMessage(response.status, serverMessage));
  }

  return data as T;
}

function apiErrorMessage(status: number, serverMessage: string): string {
  if (status === 401) return "API 키가 올바르지 않습니다.";
  if (status === 403) return "이 API 키에는 요청 권한이 없습니다.";
  if (status === 404) return "선택한 Claude 모델을 사용할 수 없습니다.";
  if (status === 413) return "사진 데이터가 너무 큽니다.";
  if (status === 429) {
    return "API 사용 한도에 도달했습니다. 잠시 후 다시 시도해주세요.";
  }
  if (status >= 500) {
    return "Claude API가 잠시 불안정합니다. 조금 뒤 다시 시도해주세요.";
  }
  return serverMessage
    ? `Claude API 요청을 처리하지 못했습니다: ${serverMessage}`
    : "Claude API 요청을 처리하지 못했습니다.";
}

function getPhotoBlob(photo: AnalysisPhoto): Blob {
  if (photo instanceof Blob) return photo;
  if (photo && photo.blob instanceof Blob) return photo.blob;
  throw new Error("사진 데이터가 올바르지 않습니다.");
}

function cloneNutrients(nutrients: Nutrients): Nutrients {
  return {
    energyKcal: nutrients.energyKcal,
    carbsG: nutrients.carbsG,
    proteinG: nutrients.proteinG,
    fatG: nutrients.fatG,
    sugarG: nutrients.sugarG,
    sodiumMg: nutrients.sodiumMg,
    fiberG: nutrients.fiberG,
    saturatedFatG: nutrients.saturatedFatG
  };
}
