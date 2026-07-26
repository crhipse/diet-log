import { fireEvent, render, screen } from "@testing-library/react";
import AppNavigation from "./AppNavigation";

test("식단, 목표, 대사량 탭을 순서대로 표시하고 선택한 탭으로 이동한다", () => {
  const onChange = vi.fn();
  render(<AppNavigation active="goal" onChange={onChange} />);

  const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });
  const tabs = Array.from(navigation.querySelectorAll("button"));

  expect(tabs.map((tab) => tab.textContent)).toEqual([
    "식단",
    "목표",
    "대사량"
  ]);
  expect(screen.getByRole("button", { name: "목표" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  expect(screen.getByRole("button", { name: "식단" })).not.toHaveAttribute(
    "aria-current"
  );

  fireEvent.click(screen.getByRole("button", { name: "대사량" }));
  expect(onChange).toHaveBeenCalledWith("metabolism");
});
