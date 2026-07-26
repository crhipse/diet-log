import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EMPTY_NUTRIENTS } from "../constants";
import type { GoalSettings } from "../lib/goalHistory";
import GoalDashboard from "./GoalDashboard";

const emptyTotals = {
  ...EMPTY_NUTRIENTS,
  hasMissingCoreValues: false
};

beforeEach(() => {
  sessionStorage.clear();
});

test("추천 기준으로 목표를 확인한 뒤 사용자 승인 시에만 저장한다", async () => {
  const onSaveGoal = vi.fn().mockResolvedValue(undefined);
  render(
    <GoalDashboard
      selectedDay="2026-07-26"
      todayDay="2026-07-26"
      selectedTotals={emptyTotals}
      totalsByDate={{}}
      currentBasis={{
        tdeeKcal: 2400,
        weightKg: 75,
        source: "detailed"
      }}
      onSaveGoal={onSaveGoal}
      onOpenMetabolism={vi.fn()}
    />
  );

  expect(onSaveGoal).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /목표 설정/ }));
  expect(
    screen.getByRole("dialog", { name: "목표 설정" }).parentElement
      ?.parentElement
  ).toBe(document.body);

  expect(
    screen.getByText(
      (_, node) =>
        node?.tagName === "STRONG" &&
        node.textContent?.includes("1,970~2,110") === true
    )
  ).toHaveTextContent("1,970~2,110 kcal/일");
  expect(
    screen.getByText(
      (_, node) =>
        node?.tagName === "STRONG" &&
        node.textContent?.includes("단백질 120") === true
    )
  ).toHaveTextContent("단백질 120 g 목표/일");

  fireEvent.click(screen.getByRole("button", { name: "이 목표로 시작" }));
  await waitFor(() => expect(onSaveGoal).toHaveBeenCalledTimes(1));
  expect(onSaveGoal.mock.calls[0][0]).toMatchObject({
    tdeeSource: "detailed",
    plan: {
      goalType: "fat_loss",
      pace: "moderate",
      resistanceTrainingDaysPerWeek: 3
    },
    recommendation: {
      tdeeKcal: 2400,
      weightKg: 75,
      proteinMinimumG: 120
    }
  });
});

test("대사량 화면을 다녀와도 작성 중인 목표 선택을 복원한다", () => {
  const onOpenMetabolism = vi.fn();
  const first = render(
    <GoalDashboard
      selectedDay="2026-07-26"
      todayDay="2026-07-26"
      selectedTotals={emptyTotals}
      totalsByDate={{}}
      onSaveGoal={vi.fn()}
      onOpenMetabolism={onOpenMetabolism}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /목표 설정/ }));
  fireEvent.click(screen.getByRole("button", { name: /린매스업/ }));
  fireEvent.click(
    screen.getByRole("button", { name: /대사량을 먼저 기록/ })
  );
  expect(onOpenMetabolism).toHaveBeenCalledTimes(1);
  first.unmount();

  render(
    <GoalDashboard
      selectedDay="2026-07-26"
      todayDay="2026-07-26"
      selectedTotals={emptyTotals}
      totalsByDate={{}}
      currentBasis={{
        tdeeKcal: 2400,
        weightKg: 75,
        source: "detailed"
      }}
      onSaveGoal={vi.fn()}
      onOpenMetabolism={vi.fn()}
    />
  );

  expect(screen.getByRole("dialog", { name: "목표 설정" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /린매스업/ })).toHaveClass(
    "is-selected"
  );
  expect(
    screen.getByText(
      (_, node) =>
        node?.tagName === "STRONG" &&
        node.textContent?.includes("2,520~2,660") === true
    )
  ).toBeInTheDocument();
});

test("저체중 목표와 지나치게 빠른 감량 계획은 저장하지 않는다", async () => {
  const onSaveGoal = vi.fn();
  render(
    <GoalDashboard
      selectedDay="2026-07-26"
      todayDay="2026-07-26"
      selectedTotals={emptyTotals}
      totalsByDate={{}}
      currentBasis={{
        tdeeKcal: 2200,
        weightKg: 75,
        heightCm: 170,
        source: "detailed"
      }}
      onSaveGoal={onSaveGoal}
      onOpenMetabolism={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /목표 설정/ }));
  const targetWeight = screen.getByRole("spinbutton", {
    name: /목표 체중.*kg/
  });
  fireEvent.change(targetWeight, { target: { value: "45" } });
  fireEvent.click(screen.getByRole("button", { name: "이 목표로 시작" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "목표 체중이 BMI 저체중 범위"
  );
  expect(onSaveGoal).not.toHaveBeenCalled();

  fireEvent.change(targetWeight, { target: { value: "65" } });
  fireEvent.change(
    screen.getByLabelText(/목표 날짜/),
    { target: { value: "2026-08-10" } }
  );
  fireEvent.click(screen.getByRole("button", { name: "이 목표로 시작" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "주 0.9kg보다 빠른 감량"
  );
  expect(onSaveGoal).not.toHaveBeenCalled();
});

test("주간 요약에서 기록 없음과 영양성분 일부 누락을 구분한다", () => {
  const partialTotals = {
    ...EMPTY_NUTRIENTS,
    energyKcal: 500,
    carbsG: 50,
    fatG: 20,
    hasMissingCoreValues: true
  };
  const goalSettings: GoalSettings = {
    updatedAt: "2026-07-20T00:00:00.000Z",
    targets: [
      {
        id: "goal-weekly-summary",
        effectiveFrom: "2026-07-20",
        plan: {
          goalType: "fat_loss",
          pace: "moderate",
          resistanceTrainingDaysPerWeek: 3
        },
        tdeeKcal: 2400,
        weightKg: 75,
        tdeeSource: "detailed",
        dailyCalories: {
          minKcal: 1970,
          targetKcal: 2040,
          maxKcal: 2110
        },
        proteinMinimumG: 150,
        createdAt: "2026-07-20T00:00:00.000Z"
      }
    ]
  };

  render(
    <GoalDashboard
      selectedDay="2026-07-21"
      todayDay="2026-07-21"
      selectedTotals={partialTotals}
      totalsByDate={{ "2026-07-21": partialTotals }}
      goalSettings={goalSettings}
      onSaveGoal={vi.fn()}
      onOpenMetabolism={vi.fn()}
    />
  );

  expect(screen.getByText("1일 부분 기록")).toBeInTheDocument();
  expect(screen.queryByText("2일 미기록")).not.toBeInTheDocument();
  expect(screen.getAllByText("1일 미기록")).toHaveLength(2);
});
