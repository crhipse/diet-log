import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FoodRecord } from "../types";
import RecordDetailScreen from "./RecordDetailScreen";

const record: FoodRecord = {
  id: "record-1",
  consumedAt: "2026-08-12T00:00:00.000Z",
  timezoneOffsetMinutes: -540,
  note: "테스트 음식",
  photoIds: [],
  foods: [
    {
      id: "food-1",
      name: "테이콧 초코맛",
      amountText: "250ml",
      nutrients: {
        energyKcal: 106,
        carbsG: 1,
        proteinG: 24,
        fatG: 0.7,
        sugarG: 0.4,
        sodiumMg: 82,
        fiberG: null,
        saturatedFatG: 0.2
      },
      source: "ai",
      userEdited: false
    }
  ],
  analysis: { status: "complete", assumptions: [] },
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z"
};

test("전체 영양성분에 선택한 배율을 적용한 뒤 저장한다", async () => {
  const onSaveFoods = vi.fn().mockResolvedValue(true);
  const onNotify = vi.fn();

  render(
    <RecordDetailScreen
      record={record}
      photoUrls={[]}
      isBusy={false}
      onBack={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      onSaveFoods={onSaveFoods}
      onReanalyze={vi.fn().mockResolvedValue(null)}
      onApplyReanalysis={vi.fn().mockResolvedValue(true)}
      onNotify={onNotify}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "숫자 수정" }));
  fireEvent.click(screen.getByRole("button", { name: "×0.5" }));
  fireEvent.click(screen.getByRole("button", { name: "배율 적용" }));

  expect(screen.getByRole("spinbutton", { name: /칼로리/ })).toHaveValue(53);
  expect(screen.getByRole("spinbutton", { name: /탄수화물/ })).toHaveValue(0.5);
  expect(screen.getByRole("spinbutton", { name: /단백질/ })).toHaveValue(12);
  expect(screen.getByRole("spinbutton", { name: /지방/ })).toHaveValue(0.35);

  fireEvent.click(screen.getByRole("button", { name: "수정 내용 저장" }));
  await waitFor(() => expect(onSaveFoods).toHaveBeenCalledTimes(1));

  expect(onSaveFoods.mock.calls[0][0][0]).toMatchObject({
    userEdited: true,
    nutrients: {
      energyKcal: 53,
      carbsG: 0.5,
      proteinG: 12,
      fatG: 0.35,
      sugarG: 0.2,
      sodiumMg: 41,
      fiberG: null,
      saturatedFatG: 0.1
    }
  });
  expect(onNotify).toHaveBeenCalledWith("모든 영양성분에 ×0.5를 적용했어요.");
});
