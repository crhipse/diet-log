import { fireEvent, render, screen } from "@testing-library/react";
import ChronicleSyncCard, { chronicleStatusText } from "./ChronicleSyncCard";
import { chronicleSync } from "../lib/chronicleSync";

afterEach(() => vi.restoreAllMocks());

it("uses a one-time source code and clears it after saving without blocking food records", async () => {
  const connect = vi.spyOn(chronicleSync, "connect").mockResolvedValue();
  render(<ChronicleSyncCard />);
  expect(screen.getByText(/위버멘쉬 설정 → 자동 연동 관리 → 연결 코드 만들기/)).toBeInTheDocument();
  const input = screen.getByLabelText("위버멘쉬 연결 코드");
  fireEvent.change(input, { target: { value: "one-time-code" } });
  fireEvent.click(screen.getByRole("button", { name: "연결하기" }));
  await vi.waitFor(() => expect(connect).toHaveBeenCalledWith("one-time-code"));
  await vi.waitFor(() => expect(input).toHaveValue(""));
});

it("distinguishes empty source, server review, expired connection and offline queue", () => {
  const state = { connected: true, needsReview: false };
  expect(chronicleStatusText({ ...state, phase: "empty_source" })).toContain("기록이 있는 기존 아이폰 홈 화면 식단 앱");
  expect(chronicleStatusText({ ...state, needsReview: true, phase: "synced" })).toContain("겹친 기록 확인");
  expect(chronicleStatusText({ ...state, phase: "reconnect" })).toContain("새 연결 코드");
  expect(chronicleStatusText({ ...state, phase: "offline" })).toContain("오프라인");
});
