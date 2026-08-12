import { fireEvent, render, screen, within } from "@testing-library/react";
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
