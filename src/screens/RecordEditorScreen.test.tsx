import { fireEvent, render, screen } from "@testing-library/react";
import RecordEditorScreen from "./RecordEditorScreen";

test("빠른 API 키 입력창은 닫거나 저장한 뒤 원문을 상태에 남기지 않는다", () => {
  const onSaveApiKey = vi.fn();
  render(
    <RecordEditorScreen
      recentRecords={[]}
      isBusy={false}
      apiKeyAvailable={false}
      onCancel={vi.fn()}
      onSaveManual={vi.fn().mockResolvedValue(undefined)}
      onAnalyze={vi.fn().mockResolvedValue(undefined)}
      onCopyRecord={vi.fn()}
      onSaveApiKey={onSaveApiKey}
      onNotify={vi.fn()}
    />
  );

  fireEvent.change(screen.getByLabelText("먹은 음식과 양"), {
    target: { value: "닭가슴살 한 팩" }
  });
  fireEvent.click(screen.getByRole("button", { name: "AI 분석으로 저장" }));
  fireEvent.change(screen.getByLabelText("API 키"), {
    target: { value: "sk-ant-first-secret" }
  });
  fireEvent.click(screen.getByRole("button", { name: "API 키 입력 닫기" }));

  fireEvent.click(screen.getByRole("button", { name: "AI 분석으로 저장" }));
  expect(screen.getByLabelText("API 키")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("API 키"), {
    target: { value: " sk-ant-second-secret " }
  });
  fireEvent.click(screen.getByRole("button", { name: "API 키 저장" }));
  expect(onSaveApiKey).toHaveBeenCalledWith("sk-ant-second-secret", false);

  fireEvent.click(screen.getByRole("button", { name: "AI 분석으로 저장" }));
  expect(screen.getByLabelText("API 키")).toHaveValue("");
});
