import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import GoalScreen from "./GoalScreen";

const emptyTotals = {
  energyKcal: null,
  carbsG: null,
  proteinG: null,
  fatG: null,
  sugarG: null,
  sodiumMg: null,
  fiberG: null,
  saturatedFatG: null,
  hasMissingCoreValues: false
};

function goalScreenProps(
  overrides: Partial<ComponentProps<typeof GoalScreen>> = {}
): ComponentProps<typeof GoalScreen> {
  return {
    selectedDay: "2026-07-26",
    todayDay: "2026-07-26",
    dateLabel: "7월 26일 (일)",
    isToday: true,
    dietRecordDays: ["2026-07-25"],
    metabolismRecordDays: ["2026-07-26"],
    totals: emptyTotals,
    totalsByDate: {},
    onPreviousDate: vi.fn(),
    onNextDate: vi.fn(),
    onSelectDate: vi.fn(),
    onSaveGoal: vi.fn(),
    onOpenMetabolism: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides
  };
}

test("목표 전용 제목과 설정 진입을 표시한다", () => {
  const onOpenSettings = vi.fn();
  render(<GoalScreen {...goalScreenProps({ onOpenSettings })} />);

  expect(
    screen.getByRole("heading", { level: 1, name: "목표" })
  ).toBeInTheDocument();
  expect(screen.getByText("나에게 맞는 목표를 설정해 보세요")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "설정 열기" }));
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
});

test("오늘 화면에서는 다음 날짜 이동을 막는다", () => {
  const onNextDate = vi.fn();
  render(<GoalScreen {...goalScreenProps({ onNextDate })} />);

  const nextButton = screen.getByRole("button", { name: "다음 날짜" });
  expect(nextButton).toBeDisabled();
  fireEvent.click(nextButton);
  expect(onNextDate).not.toHaveBeenCalled();
});

test("과거 날짜에서는 앞뒤로 이동할 수 있다", () => {
  const onPreviousDate = vi.fn();
  const onNextDate = vi.fn();
  render(
    <GoalScreen
      {...goalScreenProps({
        selectedDay: "2026-07-25",
        dateLabel: "7월 25일 (토)",
        isToday: false,
        onPreviousDate,
        onNextDate
      })}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "이전 날짜" }));
  fireEvent.click(screen.getByRole("button", { name: "다음 날짜" }));

  expect(onPreviousDate).toHaveBeenCalledTimes(1);
  expect(onNextDate).toHaveBeenCalledTimes(1);
});

test("달력에서 미래 날짜를 선택할 수 없다", () => {
  const onSelectDate = vi.fn();
  render(<GoalScreen {...goalScreenProps({ onSelectDate })} />);

  fireEvent.click(
    screen.getByRole("button", { name: "7월 26일 (일), 달력 열기" })
  );

  expect(
    screen.getByRole("button", {
      name: /2026년 7월 27일.*미래 날짜, 선택할 수 없음/
    })
  ).toBeDisabled();
  expect(onSelectDate).not.toHaveBeenCalled();
});
