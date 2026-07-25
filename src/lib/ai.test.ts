import {
  analyzeFoodRecord,
  buildAnalysisPrompt,
  foodAnalysisPayloadSchema,
  foodAnalysisPayloadToItems,
  parseFoodAnalysisPayload,
  validateAnalysisInput
} from "./ai";

afterEach(() => {
  vi.unstubAllGlobals();
});

const validPayload = {
  foods: [
    {
      name: "삼겹살",
      amountText: "약 150g",
      nutrients: {
        energyKcal: 495,
        carbsG: 0,
        proteinG: 26,
        fatG: 43,
        sugarG: null,
        sodiumMg: 180,
        fiberG: null,
        saturatedFatG: 16
      }
    }
  ],
  assumptions: ["구운 삼겹살 150g 기준"],
  confidence: "medium" as const
};

describe("foodAnalysisPayloadSchema", () => {
  it("accepts nullable unknown nutrients", () => {
    expect(parseFoodAnalysisPayload(validPayload)).toEqual(validPayload);
  });

  it("rejects negative nutrient values", () => {
    const result = foodAnalysisPayloadSchema.safeParse({
      ...validPayload,
      foods: [
        {
          ...validPayload.foods[0],
          nutrients: {
            ...validPayload.foods[0].nutrients,
            energyKcal: -1
          }
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown structured-output fields", () => {
    const result = foodAnalysisPayloadSchema.safeParse({
      ...validPayload,
      extra: "unexpected"
    });

    expect(result.success).toBe(false);
  });
});

describe("foodAnalysisPayloadToItems", () => {
  it("maps analyzed foods to editable application food items", () => {
    const [food] = foodAnalysisPayloadToItems(validPayload);

    expect(food).toMatchObject({
      name: "삼겹살",
      amountText: "약 150g",
      source: "ai",
      userEdited: false,
      nutrients: validPayload.foods[0].nutrients
    });
    expect(food.id).toMatch(/^food-/);
  });
});

describe("analysis input", () => {
  it("allows text-only analysis and trims credentials and text", () => {
    const normalized = validateAnalysisInput({
      apiKey: "  sk-ant-test  ",
      modelId: "  claude-sonnet-5  ",
      note: "  밥 반 공기  ",
      photos: []
    });

    expect(normalized).toMatchObject({
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-5",
      note: "밥 반 공기"
    });
  });

  it("rejects an empty record", () => {
    expect(() =>
      validateAnalysisInput({
        apiKey: "sk-ant-test",
        modelId: "claude-sonnet-5",
        note: "   ",
        photos: []
      })
    ).toThrow("음식 설명이나 사진");
  });

  it("rejects more than five photos before an API request", () => {
    const photos = Array.from(
      { length: 6 },
      () => new Blob([], { type: "image/webp" })
    );

    expect(() =>
      validateAnalysisInput({
        apiKey: "sk-ant-test",
        modelId: "claude-sonnet-5",
        note: "",
        photos
      })
    ).toThrow("최대 5장");
  });
});

describe("buildAnalysisPrompt", () => {
  it("warns the model that multiple photos may show the same food", () => {
    const prompt = buildAnalysisPrompt("삼겹살과 상추", 3);

    expect(prompt).toContain("사진 3장");
    expect(prompt).toContain("같은 음식의 다른 각도");
    expect(prompt).toContain("삼겹살과 상추");
  });
});

describe("Claude 요청 설정", () => {
  it("Sonnet 5의 불필요한 adaptive thinking을 끈다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "claude-sonnet-5",
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify(validPayload) }],
          usage: {
            input_tokens: 100,
            output_tokens: 50
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await analyzeFoodRecord({
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-5",
      note: "삼겹살 150g",
      photos: []
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.max_tokens).toBe(4096);
    expect(body.output_config.format.type).toBe("json_schema");
  });
});
