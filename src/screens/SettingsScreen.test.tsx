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

test("최신 Claude 프리셋을 표시하면서 저장된 사용자 선택은 유지한다", () => {
  const settings = { ...DEFAULT_SETTINGS, modelId: "claude-sonnet-4-6" };
  render(<SettingsScreen {...settingsProps({ settings })} />);
  const input = screen.getByLabelText("AI 모델");
  expect(input).toHaveValue(settings.modelId);
  for (const [name, id] of [
    ["Sonnet 5.5", "claude-sonnet-5-5"],
    ["Haiku 5.5", "claude-haiku-5-5"],
    ["Opus 5.5", "claude-opus-5-5"],
    ["Fable 5.2", "claude-fable-5-2"]
  ]) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(name.replace(".", "\\.")) }));
    expect(input).toHaveValue(id);
  }
  expect(screen.getByText("고비용 · Anthropic 요청 데이터 30일 보관")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Sonnet 4\.6|Haiku 4\.5|Opus 4\.8/ })).not.toBeInTheDocument();
});

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
