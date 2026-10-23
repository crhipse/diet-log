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

test("중간저장과 완료는 별개이며 운동기기 입력값과 걸음 수 중복 선택을 저장한다", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<MetabolismScreen selectedDay={entry.date} todayDay={entry.date} dateLabel="7월 26일" isToday
    dietRecordDays={[]} metabolismRecordDays={[]} profile={profile} entry={entry} history={[]} intakeByDate={{}}
    onPreviousDate={vi.fn()} onNextDate={vi.fn()} onSelectDate={vi.fn()} onOpenSettings={vi.fn()}
    onSaveProfile={vi.fn()} onSaveDay={save} />);
  fireEvent.click(screen.getByRole("button", { name: "빠르게 걷기" }));
  fireEvent.change(screen.getByRole("combobox", { name: "빠르게 걷기 칼로리 입력 방식" }), { target: { value: "manual" } });
  fireEvent.change(screen.getByLabelText("기기 표시 총칼로리 (kcal)"), { target: { value: "300" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "이 운동의 걸음이 오늘 걸음 수에도 포함됨" }));
  fireEvent.click(screen.getByRole("button", { name: "대사량 중간저장" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][1]).toMatchObject({ metabolismComplete: false, tdeeSnapshot: undefined,
    exercises: [expect.objectContaining({ caloriesKcal: 300, includedInSteps: true })] });
  fireEvent.click(screen.getByRole("button", { name: "대사량 기록 완료" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1][1]).toMatchObject({ metabolismComplete: true,
    tdeeSnapshot: { kcal: expect.any(Number), source: "detail" } });
});

test("체중 입력 전에도 중간저장은 가능하고 완료는 할 수 없다", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<MetabolismScreen selectedDay={entry.date} todayDay={entry.date} dateLabel="7월 26일" isToday
    dietRecordDays={[]} metabolismRecordDays={[]} profile={profile} entry={null} history={[]} intakeByDate={{}}
    onPreviousDate={vi.fn()} onNextDate={vi.fn()} onSelectDate={vi.fn()} onOpenSettings={vi.fn()}
    onSaveProfile={vi.fn()} onSaveDay={save} />);
  expect(screen.getByRole("button", { name: "대사량 기록 완료" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "대사량 중간저장" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][1]).toMatchObject({ weightKg: 0, metabolismComplete: false });
});

test("새벽 자동 완료가 열린 입력 초안의 체중과 활동을 덮어쓰지 않는다", async () => {
  const onSaveDay = vi.fn().mockResolvedValue(undefined);
  const props = {
    selectedDay: "2026-07-26", todayDay: "2026-07-27", dateLabel: "7월 26일 (일)", isToday: false,
    dietRecordDays: ["2026-07-26"], metabolismRecordDays: ["2026-07-26"], profile, entry,
    history: [], intakeByDate: {}, onPreviousDate: vi.fn(), onNextDate: vi.fn(), onSelectDate: vi.fn(),
    onOpenSettings: vi.fn(), onSaveProfile: vi.fn(), onSaveDay
  };
  const { rerender } = render(<MetabolismScreen {...props} automaticDietComplete={false} />);
  fireEvent.change(screen.getByRole("spinbutton", { name: "체중 (kg)" }), { target: { value: "73" } });
  fireEvent.click(screen.getByRole("button", { name: "사무·재택" }));
  rerender(<MetabolismScreen {...props} automaticDietComplete />);
  expect(screen.getByText("식단 기록 자동 완료됨")).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "체중 (kg)" })).toHaveValue(73);
  fireEvent.click(screen.getByRole("button", { name: "대사량 중간저장" }));
  await waitFor(() => expect(onSaveDay).toHaveBeenCalledTimes(1));
  expect(onSaveDay.mock.calls[0][1]).toMatchObject({ weightKg: 73, dietComplete: true, dietCompletedAutomatically: true, jobActivities: [expect.objectContaining({ name: "사무·재택" })] });
});

test("식사만 있는 지난 날짜도 완료 표시하지만 체중이나 대사량 기록은 만들지 않는다", () => {
  const onSaveDay = vi.fn();
  render(<MetabolismScreen selectedDay="2026-07-26" todayDay="2026-07-27" dateLabel="7월 26일 (일)" isToday={false}
    dietRecordDays={["2026-07-26"]} metabolismRecordDays={[]} profile={profile} entry={null} automaticDietComplete
    history={[]} intakeByDate={{}} onPreviousDate={vi.fn()} onNextDate={vi.fn()} onSelectDate={vi.fn()}
    onOpenSettings={vi.fn()} onSaveProfile={vi.fn()} onSaveDay={onSaveDay} />);
  expect(screen.getByText("식단 기록 자동 완료됨")).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "체중 (kg)" })).toHaveValue(null);
  expect(screen.getByRole("button", { name: "대사량 기록 완료" })).toBeDisabled();
  expect(onSaveDay).not.toHaveBeenCalled();
});

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
    screen.getByRole("button", { name: "대사량 중간저장" })
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
