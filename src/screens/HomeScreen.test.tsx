import { render, screen } from "@testing-library/react";
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
