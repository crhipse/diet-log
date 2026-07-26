import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  DailyMetabolismEntry,
  MetabolismProfile
} from "../types";
import MetabolismScreen from "./MetabolismScreen";

const profile: MetabolismProfile = {
  id: "metabolism",
  sex: "male",
  birthDate: "1990-01-01",
  heightCm: 175,
  jobTemplates: [],
  exerciseTemplates: [],
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z"
};

const entry: DailyMetabolismEntry = {
  id: "2026-07-26",
  date: "2026-07-26",
  weightKg: 70,
  dietComplete: false,
  jobActivities: [],
  exercises: [],
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z"
};

test("일반 예시는 오늘 기록에만 추가하고 저장 템플릿은 변경하지 않는다", async () => {
  const onSaveDay = vi.fn().mockResolvedValue(undefined);

  render(
    <MetabolismScreen
      selectedDay="2026-07-26"
      todayDay="2026-07-26"
      dateLabel="7월 26일 (일)"
      isToday
      dietRecordDays={[]}
      metabolismRecordDays={["2026-07-26"]}
      profile={profile}
      entry={entry}
      history={[]}
      intakeByDate={{}}
      onPreviousDate={vi.fn()}
      onNextDate={vi.fn()}
      onSelectDate={vi.fn()}
      onOpenSettings={vi.fn()}
      onSaveProfile={vi.fn()}
      onSaveDay={onSaveDay}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "사무·재택" }));
  fireEvent.click(screen.getByRole("button", { name: "빠르게 걷기" }));
  fireEvent.click(
    screen.getByRole("button", { name: "오늘 대사량 기록 저장" })
  );

  await waitFor(() => expect(onSaveDay).toHaveBeenCalledTimes(1));
  const [savedProfile, savedEntry] = onSaveDay.mock.calls[0] as [
    MetabolismProfile,
    DailyMetabolismEntry
  ];

  expect(savedProfile.jobTemplates).toEqual([]);
  expect(savedProfile.exerciseTemplates).toEqual([]);
  expect(savedProfile.heightCm).toBe(175);
  expect(savedEntry.jobActivities).toEqual([
    expect.objectContaining({
      name: "사무·재택",
      activityType: "seated",
      hours: 8
    })
  ]);
  expect(savedEntry.exercises).toEqual([
    expect.objectContaining({
      name: "빠르게 걷기",
      category: "walking",
      intensity: "moderate",
      durationMinutes: 30
    })
  ]);
});

test("저장하지 않은 입력이 있으면 날짜 이동 전에 확인한다", () => {
  const onPreviousDate = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

  render(
    <MetabolismScreen
      selectedDay="2026-07-26"
      todayDay="2026-07-26"
      dateLabel="7월 26일 (일)"
      isToday
      dietRecordDays={[]}
      metabolismRecordDays={["2026-07-26"]}
      profile={profile}
      entry={entry}
      history={[]}
      intakeByDate={{}}
      onPreviousDate={onPreviousDate}
      onNextDate={vi.fn()}
      onSelectDate={vi.fn()}
      onOpenSettings={vi.fn()}
      onSaveProfile={vi.fn()}
      onSaveDay={vi.fn()}
    />
  );

  fireEvent.change(screen.getByLabelText("체중 (kg)"), {
    target: { value: "71" }
  });
  fireEvent.click(screen.getByRole("button", { name: "이전 날짜" }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(onPreviousDate).not.toHaveBeenCalled();

  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "이전 날짜" }));
  expect(onPreviousDate).toHaveBeenCalledTimes(1);
  confirm.mockRestore();
});

test("저장된 신장은 숨기고 변경할 때만 빈 입력칸을 연다", async () => {
  const onSaveProfile = vi.fn().mockResolvedValue(true);

  render(
    <MetabolismScreen
      selectedDay="2026-07-26"
      todayDay="2026-07-26"
      dateLabel="7월 26일 (일)"
      isToday
      dietRecordDays={[]}
      metabolismRecordDays={["2026-07-26"]}
      profile={profile}
      entry={entry}
      history={[]}
      intakeByDate={{}}
      onPreviousDate={vi.fn()}
      onNextDate={vi.fn()}
      onSelectDate={vi.fn()}
      onOpenSettings={vi.fn()}
      onSaveProfile={onSaveProfile}
      onSaveDay={vi.fn()}
    />
  );

  expect(screen.queryByText("175cm")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("새 신장 (cm)")).not.toBeInTheDocument();
  expect(screen.getAllByText("신장 입력 완료")).not.toHaveLength(0);

  fireEvent.click(screen.getByRole("button", { name: "신장 변경" }));
  const firstInput = screen.getByLabelText("새 신장 (cm)") as HTMLInputElement;
  expect(firstInput.value).toBe("");

  fireEvent.change(firstInput, { target: { value: "180" } });
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(screen.queryByLabelText("새 신장 (cm)")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "신장 변경" }));
  const reopenedInput = screen.getByLabelText(
    "새 신장 (cm)"
  ) as HTMLInputElement;
  expect(reopenedInput.value).toBe("");

  fireEvent.change(reopenedInput, { target: { value: "180" } });
  fireEvent.click(
    screen.getByRole("button", { name: "신장 변경 저장" })
  );

  await waitFor(() =>
    expect(onSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ heightCm: 180 })
    )
  );
  expect(screen.queryByLabelText("새 신장 (cm)")).not.toBeInTheDocument();
  expect(screen.queryByText("180cm")).not.toBeInTheDocument();
});

test("처음 등록하는 신장은 기본값 없이 직접 입력한다", () => {
  render(
    <MetabolismScreen
      selectedDay="2026-07-26"
      todayDay="2026-07-26"
      dateLabel="7월 26일 (일)"
      isToday
      dietRecordDays={[]}
      metabolismRecordDays={[]}
      profile={null}
      entry={null}
      history={[]}
      intakeByDate={{}}
      onPreviousDate={vi.fn()}
      onNextDate={vi.fn()}
      onSelectDate={vi.fn()}
      onOpenSettings={vi.fn()}
      onSaveProfile={vi.fn()}
      onSaveDay={vi.fn()}
    />
  );

  const heightInput = screen.getByLabelText("신장 (cm)") as HTMLInputElement;
  expect(heightInput.value).toBe("");
  expect(
    screen.getByRole("button", { name: "기본 정보 저장" })
  ).toBeDisabled();
});
