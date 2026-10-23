import { fireEvent, render, screen, within } from "@testing-library/react";
import StatisticsScreen from "./StatisticsScreen";
import type { EnergyPoint } from "../lib/energyBalance";

const points: EnergyPoint[] = [
  { date: "2026-07-01", end: "2026-07-01", intake: 2800, tdee: 2500, balance: 300 },
  { date: "2026-10-19", end: "2026-10-19", intake: 2100, tdee: 2500, balance: -400 },
  { date: "2026-10-23", end: "2026-10-23", intake: 2000, tdee: 2300, balance: -300 }
];
function renderStats() {
  const onOpenDay = vi.fn();
  render(<StatisticsScreen points={points} selectedDay="2026-10-23" todayDay="2026-10-23" onOpenDay={onOpenDay} onOpenSettings={vi.fn()} />);
  return onOpenDay;
}

test("일·주·월 집계는 해당 기간 합계를 표시하고 과거 날짜로 직접 이동할 수 있다", () => {
  const onOpenDay = renderStats();
  const summary = screen.getByRole("region", { name: "선택 기간 칼로리 수지" });
  expect(within(summary).getByText("적자 300 kcal")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "주" }));
  expect(within(summary).getByText("적자 700 kcal")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "월" }));
  expect(within(summary).getByText("적자 700 kcal")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("통계 기준 날짜"), { target: { value: "2026-07-01" } });
  expect(within(summary).getByText("흑자 300 kcal")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "식단" }));
  expect(onOpenDay).toHaveBeenCalledWith("2026-07-01", "diet");
});

test("기록이 없는 날은 0 수지로 표시하거나 서로 떨어진 점을 선으로 연결하지 않는다", () => {
  renderStats();
  const chart = screen.getByRole("img", { name: /꺾은선 그래프/ });
  expect(chart.querySelectorAll("path.energy-line")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("통계 기준 날짜"), { target: { value: "2026-10-22" } });
  expect(screen.getByText("완료한 기록 없음")).toBeInTheDocument();
});

test("두 손가락을 오므리면 표시 기간이 늘고 버튼으로도 축소할 수 있다", () => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: PointerEventInit = {}) { super(type, params); this.pointerId = params.pointerId ?? 1; }
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  try {
    renderStats();
    const chart = screen.getByRole("img", { name: /꺾은선 그래프/ });
    const summary = document.querySelector(".statistics-range-summary")!;
    expect(summary.textContent).toContain("2026-09-24");
    fireEvent.pointerDown(chart, { pointerId: 1, clientX: 50, clientY: 100 });
    fireEvent.pointerDown(chart, { pointerId: 2, clientX: 250, clientY: 100 });
    fireEvent.pointerMove(chart, { pointerId: 2, clientX: 150, clientY: 100 });
    fireEvent.pointerUp(chart, { pointerId: 1, clientX: 50, clientY: 100 });
    fireEvent.pointerUp(chart, { pointerId: 2, clientX: 150, clientY: 100 });
    expect(summary.textContent).toContain("2026-08-25");
    fireEvent.click(screen.getByRole("button", { name: "기간 좁히기" }));
    expect(summary.textContent).toContain("2026-09-14");
  } finally { vi.unstubAllGlobals(); }
});
