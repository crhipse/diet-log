import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { DEFAULT_SETTINGS } from "../constants";
import SettingsScreen from "./SettingsScreen";

function settingsProps(
  overrides: Partial<ComponentProps<typeof SettingsScreen>> = {}
): ComponentProps<typeof SettingsScreen> {
  return {
    settings: { ...DEFAULT_SETTINGS },
    apiKeyAvailable: true,
    remembered: true,
    recordCount: 0,
    metabolismRecordCount: 0,
    storagePersisted: true,
    isBusy: false,
    onBack: vi.fn(),
    onSaveApiKey: vi.fn(),
    onClearApiKey: vi.fn(),
    onTestApiKey: vi.fn().mockResolvedValue(true),
    onSaveSettings: vi.fn().mockResolvedValue(undefined),
    onExportBackup: vi.fn().mockResolvedValue(undefined),
    onRestoreBackup: vi.fn().mockResolvedValue(undefined),
    onCopyMarkdown: vi.fn().mockResolvedValue(undefined),
    onShareMarkdown: vi.fn().mockResolvedValue(undefined),
    onDownloadCsv: vi.fn().mockResolvedValue(undefined),
    onNotify: vi.fn(),
    ...overrides
  };
}

test("저장된 API 키는 DOM에 넣지 않고 변경 버튼을 누른 뒤에만 빈 입력칸을 연다", () => {
  render(<SettingsScreen {...settingsProps()} />);

  expect(screen.getByText("API 키가 저장되어 있어요")).toBeInTheDocument();
  expect(screen.queryByLabelText("새 API 키")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "API 키 표시" })
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "API 키 변경" }));
  const input = screen.getByLabelText("새 API 키");
  expect(input).toHaveAttribute("type", "password");
  expect(input).toHaveValue("");

  fireEvent.change(input, { target: { value: "sk-ant-secret-to-clear" } });
  fireEvent.click(screen.getByRole("button", { name: "변경 취소" }));
  expect(screen.queryByLabelText("새 API 키")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "API 키 변경" }));
  expect(screen.getByLabelText("새 API 키")).toHaveValue("");
});

test("새 키는 연결 확인에 성공한 뒤 저장하고 입력 상태를 즉시 비운다", async () => {
  const onSaveApiKey = vi.fn();
  const onTestApiKey = vi.fn().mockResolvedValue(true);
  render(
    <SettingsScreen
      {...settingsProps({ onSaveApiKey, onTestApiKey })}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "API 키 변경" }));
  fireEvent.change(screen.getByLabelText("새 API 키"), {
    target: { value: "  sk-ant-new-secret  " }
  });
  fireEvent.click(
    screen.getByRole("button", { name: "확인 후 안전하게 저장" })
  );

  await waitFor(() =>
    expect(onTestApiKey).toHaveBeenCalledWith("sk-ant-new-secret")
  );
  expect(onSaveApiKey).toHaveBeenCalledWith("sk-ant-new-secret", true);
  expect(screen.queryByLabelText("새 API 키")).not.toBeInTheDocument();
});

test("연결 확인에 실패한 키는 기존 저장값을 덮어쓰지 않는다", async () => {
  const onSaveApiKey = vi.fn();
  const onTestApiKey = vi.fn().mockResolvedValue(false);
  render(
    <SettingsScreen
      {...settingsProps({ onSaveApiKey, onTestApiKey })}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "API 키 변경" }));
  fireEvent.change(screen.getByLabelText("새 API 키"), {
    target: { value: "sk-ant-invalid" }
  });
  fireEvent.click(
    screen.getByRole("button", { name: "확인 후 안전하게 저장" })
  );

  await waitFor(() => expect(onTestApiKey).toHaveBeenCalledTimes(1));
  expect(onSaveApiKey).not.toHaveBeenCalled();
  expect(screen.getByLabelText("새 API 키")).toHaveValue("sk-ant-invalid");
});
