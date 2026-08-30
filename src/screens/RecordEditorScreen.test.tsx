import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "../lib/db";
import { saveFavoriteFood } from "../lib/favorites";
import type { FoodRecord } from "../types";
import RecordEditorScreen from "./RecordEditorScreen";

function previousRecord(index: number): FoodRecord {
  const timestamp = new Date(2026, 7, 12, 12 - (index % 12)).toISOString();
  return {
    id: `record-${index}`,
    consumedAt: timestamp,
    timezoneOffsetMinutes: -540,
    note: `설명 ${index}`,
    photoIds: [],
    foods: [
      {
        id: `food-${index}`,
        name: `이전 음식 ${index}`,
        amountText: "1인분",
        nutrients: {
          energyKcal: 100,
          carbsG: 10,
          proteinG: 10,
          fatG: 2,
          sugarG: null,
          sodiumMg: null,
          fiberG: null,
          saturatedFatG: null
        },
        source: "manual",
        userEdited: false
      }
    ],
    analysis: { status: "not_requested", assumptions: [] },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

beforeEach(async () => { await db.favoriteFoods.clear(); });

test("빠른 API 키 입력창은 닫거나 저장한 뒤 원문을 상태에 남기지 않는다", () => {
  const onSaveApiKey = vi.fn();
  render(
    <RecordEditorScreen
      recentRecords={[]}
      isBusy={false}
      apiKeyAvailable={false}
      onCancel={vi.fn()}
      onSaveManual={vi.fn().mockResolvedValue(undefined)}
      onAnalyze={vi.fn().mockResolvedValue(undefined)}
      onCopyRecord={vi.fn()}
      onSaveApiKey={onSaveApiKey}
      onNotify={vi.fn()}
    />
  );

  fireEvent.change(screen.getByLabelText("먹은 음식과 양"), {
    target: { value: "닭가슴살 한 팩" }
  });
  fireEvent.click(screen.getByRole("button", { name: "AI 분석으로 저장" }));
  fireEvent.change(screen.getByLabelText("API 키"), {
    target: { value: "sk-ant-first-secret" }
  });
  fireEvent.click(screen.getByRole("button", { name: "API 키 입력 닫기" }));

  fireEvent.click(screen.getByRole("button", { name: "AI 분석으로 저장" }));
  expect(screen.getByLabelText("API 키")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("API 키"), {
    target: { value: " sk-ant-second-secret " }
  });
  fireEvent.click(screen.getByRole("button", { name: "API 키 저장" }));
  expect(onSaveApiKey).toHaveBeenCalledWith("sk-ant-second-secret", false);

  fireEvent.click(screen.getByRole("button", { name: "AI 분석으로 저장" }));
  expect(screen.getByLabelText("API 키")).toHaveValue("");
});

test("이전 기록 복사 목록은 최근 36개까지 스크롤 영역에 표시한다", () => {
  render(
    <RecordEditorScreen
      recentRecords={Array.from({ length: 40 }, (_, index) =>
        previousRecord(index + 1)
      )}
      isBusy={false}
      apiKeyAvailable
      onCancel={vi.fn()}
      onSaveManual={vi.fn().mockResolvedValue(undefined)}
      onAnalyze={vi.fn().mockResolvedValue(undefined)}
      onCopyRecord={vi.fn()}
      onSaveApiKey={vi.fn()}
      onNotify={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "이전 기록에서 복사" }));
  const dialog = screen.getByRole("dialog", { name: "이전 기록 복사" });

  expect(within(dialog).getByText("이전 음식 36")).toBeInTheDocument();
  expect(within(dialog).queryByText("이전 음식 37")).not.toBeInTheDocument();
  expect(dialog.querySelector(".copy-list")).toBeInTheDocument();
});

test("이전 기록 복사 후 배율을 조정해 저장해도 원본과 API는 건드리지 않는다", async () => {
  const original = previousRecord(1);
  const onSaveManual = vi.fn().mockResolvedValue(undefined);
  const onAnalyze = vi.fn();
  render(<RecordEditorScreen recentRecords={[original]} isBusy={false} apiKeyAvailable={false}
    onCancel={vi.fn()} onSaveManual={onSaveManual} onAnalyze={onAnalyze}
    onCopyRecord={vi.fn().mockResolvedValue({ note: original.note, foods: original.foods, photos: [] })}
    onSaveApiKey={vi.fn()} onNotify={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "이전 기록에서 복사" }));
  fireEvent.click(screen.getByRole("button", { name: /이전 음식 1/ }));
  await screen.findByRole("button", { name: "수동 기록 저장" });
  fireEvent.click(screen.getByRole("button", { name: "×1.2" }));
  fireEvent.click(screen.getByRole("button", { name: "배율 적용" }));
  expect(screen.getByRole("spinbutton", { name: /칼로리/ })).toHaveValue(120);
  fireEvent.click(screen.getByRole("button", { name: "수동 기록 저장" }));
  expect(onSaveManual.mock.calls[0][0].foods[0]).toMatchObject({
    source: "copied", userEdited: true,
    nutrients: { energyKcal: 120, proteinG: 12, carbsG: 12, fatG: 2.4, sugarG: null }
  });
  expect(original.foods[0].nutrients.energyKcal).toBe(100);
  expect(onAnalyze).not.toHaveBeenCalled();
});

test("즐겨찾기를 기존 음식에 추가하고 배율을 바꿔도 즐겨찾기 원본은 유지한다", async () => {
  const favorite = await saveFavoriteFood({ ...previousRecord(2).foods[0], name: "그릭요거트" });
  const initial = previousRecord(1);
  const onSaveManual = vi.fn().mockResolvedValue(undefined);
  const onAnalyze = vi.fn();
  render(<RecordEditorScreen initialRecord={initial} recentRecords={[]} isBusy={false} apiKeyAvailable={false}
    onCancel={vi.fn()} onSaveManual={onSaveManual} onAnalyze={onAnalyze}
    onCopyRecord={vi.fn()} onSaveApiKey={vi.fn()} onNotify={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "즐겨찾기에서 추가" }));
  fireEvent.click(await screen.findByRole("button", { name: "그릭요거트 추가" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getAllByLabelText("음식명").map((input) => (input as HTMLInputElement).value))
    .toEqual(["이전 음식 1", "그릭요거트"]);
  fireEvent.click(screen.getByRole("button", { name: "×0.5" }));
  fireEvent.click(screen.getByRole("button", { name: "배율 적용" }));
  fireEvent.click(screen.getByRole("button", { name: "수동 기록 저장" }));
  await waitFor(() => expect(onSaveManual).toHaveBeenCalledTimes(1));
  const foods = onSaveManual.mock.calls[0][0].foods;
  expect(foods.map((food: { nutrients: { energyKcal: number } }) => food.nutrients.energyKcal)).toEqual([50, 50]);
  expect(foods[1].id).not.toBe(favorite.id);
  expect((await db.favoriteFoods.get(favorite.id))?.nutrients.energyKcal).toBe(100);
  expect(onAnalyze).not.toHaveBeenCalled();
});
