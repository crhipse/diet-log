import { fireEvent, render, screen, within } from "@testing-library/react";
import { EMPTY_NUTRIENTS } from "../constants";
import HomeScreen from "./HomeScreen";

test("식단 화면에는 섭취 합계와 기록만 표시하고 목표 영역은 표시하지 않는다", () => {
  render(
    <HomeScreen
      selectedDay="2026-07-26"
      todayDay="2026-07-26"
      dateLabel="7월 26일 (일)"
      isToday
      records={[]}
      totals={{
        energyKcal: 1_500,
        carbsG: 180,
        proteinG: 95,
        fatG: 45,
        sugarG: null,
        sodiumMg: null,
        fiberG: null,
        saturatedFatG: null,
        hasMissingCoreValues: false
      }}
      photoUrls={{}}
      dietRecordDays={[]}
      metabolismRecordDays={[]}
      onPreviousDate={vi.fn()}
      onNextDate={vi.fn()}
      onSelectDate={vi.fn()}
      onOpenSettings={vi.fn()}
      onAddRecord={vi.fn()}
      onOpenRecord={vi.fn()}
    />
  );

  expect(
    screen.getByRole("heading", { level: 1, name: "식단관리" })
  ).toBeInTheDocument();
  expect(screen.getByText("1,500 kcal")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { level: 2, name: "시간별 기록" })
  ).toBeInTheDocument();
  expect(
    screen.queryByText("나에게 맞는 목표를 설정해 보세요")
  ).not.toBeInTheDocument();
});

test("자동 완료된 날짜에도 식단 저장완료 버튼으로 직접 확정할 수 있고 당일 TDEE와 적자를 표시한다", () => {
  const complete = vi.fn();
  render(<HomeScreen selectedDay="2026-10-23" todayDay="2026-10-23" dateLabel="10월 23일" isToday
    records={[{ id: "r1", consumedAt: "2026-10-23T03:00:00.000Z", timezoneOffsetMinutes: -540, note: "", foods: [], photoIds: [],
      analysis: { status: "not_requested", assumptions: [] }, createdAt: "2026-10-23T03:00:00.000Z", updatedAt: "2026-10-23T03:00:00.000Z" }]}
    totals={{ ...EMPTY_NUTRIENTS, energyKcal: 2100, hasMissingCoreValues: false }} photoUrls={{}}
    dietRecordDays={[]} metabolismRecordDays={[]} onPreviousDate={vi.fn()} onNextDate={vi.fn()} onSelectDate={vi.fn()}
    onOpenSettings={vi.fn()} onAddRecord={vi.fn()} onOpenRecord={vi.fn()}
    dietComplete dietManuallyComplete={false} onCompleteDiet={complete} tdeeKcal={2500} balanceKcal={-400} />);
  const save = screen.getByRole("button", { name: "식단 저장완료" });
  expect(save).toBeEnabled(); fireEvent.click(save);
  expect(complete).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "완료 취소" }));
  expect(complete).toHaveBeenLastCalledWith(false);
  const energy = screen.getByRole("region", { name: "선택 날짜의 TDEE와 칼로리 수지" });
  expect(within(energy).getByText("2,500 kcal")).toBeInTheDocument();
  expect(within(energy).getByText("적자 400 kcal")).toBeInTheDocument();
  expect(within(energy).getByText(/입력 중/)).toBeInTheDocument();
});
