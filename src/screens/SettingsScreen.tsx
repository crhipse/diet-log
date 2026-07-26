import {
  ArrowLeft,
  Check,
  ChevronRight,
  ClipboardCopy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FileUp,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Share2,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { useRef, useState } from "react";
import { MODEL_PRESETS } from "../constants";
import type { AppSettings } from "../types";

type RestoreMode = "merge" | "replace";

interface SettingsScreenProps {
  settings: AppSettings;
  apiKey: string;
  remembered: boolean;
  recordCount: number;
  metabolismRecordCount: number;
  storagePersisted: boolean | null;
  isBusy: boolean;
  onBack: () => void;
  onSaveApiKey: (apiKey: string, remember: boolean) => void;
  onClearApiKey: () => void;
  onTestApiKey: (apiKey: string) => Promise<boolean>;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  onExportBackup: (includePhotos: boolean) => Promise<void>;
  onRestoreBackup: (file: File, mode: RestoreMode) => Promise<void>;
  onCopyMarkdown: (from: string, to: string) => Promise<void>;
  onShareMarkdown: (from: string, to: string) => Promise<void>;
  onDownloadCsv: (from: string, to: string) => Promise<void>;
  onNotify: (message: string, tone?: "default" | "error") => void;
}

export default function SettingsScreen({
  settings,
  apiKey,
  remembered,
  recordCount,
  metabolismRecordCount,
  storagePersisted,
  isBusy,
  onBack,
  onSaveApiKey,
  onClearApiKey,
  onTestApiKey,
  onSaveSettings,
  onExportBackup,
  onRestoreBackup,
  onCopyMarkdown,
  onShareMarkdown,
  onDownloadCsv,
  onNotify
}: SettingsScreenProps) {
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [rememberDraft, setRememberDraft] = useState(remembered);
  const [showKey, setShowKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyTested, setKeyTested] = useState(false);
  const [modelDraft, setModelDraft] = useState(settings.modelId);
  const [dayStartDraft, setDayStartDraft] = useState(settings.dayStartHour);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("merge");
  const [exportRange, setExportRange] = useState(defaultRange);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const saveKey = async () => {
    if (!keyDraft.trim()) {
      onNotify("API 키를 입력해주세요.", "error");
      return;
    }
    onSaveApiKey(keyDraft, rememberDraft);
    setTestingKey(true);
    try {
      const success = await onTestApiKey(keyDraft.trim());
      setKeyTested(success);
    } finally {
      setTestingKey(false);
    }
  };

  const savePreferences = async () => {
    if (!modelDraft.trim()) {
      onNotify("사용할 모델 ID를 입력해주세요.", "error");
      return;
    }
    await onSaveSettings({
      ...settings,
      modelId: modelDraft.trim(),
      dayStartHour: dayStartDraft,
      updatedAt: new Date().toISOString()
    });
  };

  const handleRestore = async (file: File | undefined) => {
    if (!file) return;
    if (
      restoreMode === "replace" &&
      !window.confirm(
        `현재 저장된 식단 ${recordCount}개와 대사량 ${metabolismRecordCount}일, ` +
          "기본 정보·활동 템플릿을 모두 지우고 백업으로 교체할까요? " +
          "이 작업은 되돌릴 수 없습니다."
      )
    ) {
      return;
    }
    await onRestoreBackup(file, restoreMode);
    if (restoreInputRef.current) restoreInputRef.current.value = "";
  };

  return (
    <main className="screen settings-screen">
      <header className="topbar topbar--compact">
        <button
          className="icon-button icon-button--ghost"
          type="button"
          aria-label="타임라인으로 돌아가기"
          onClick={onBack}
        >
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <div className="topbar__center">
          <p className="eyebrow">내 기기 설정</p>
          <h1>설정</h1>
        </div>
        <span className="topbar__spacer" />
      </header>

      <div className="settings-screen__body">
        <section className="settings-card">
          <div className="settings-card__title">
            <span className="settings-card__icon">
              <KeyRound size={19} aria-hidden="true" />
            </span>
            <div>
              <h2>Claude API 키</h2>
              <p>각자의 키를 사용해 각자 비용을 결제합니다.</p>
            </div>
          </div>

          <label className="field">
            <span>API 키</span>
            <span className="password-input">
              <input
                type={showKey ? "text" : "password"}
                autoComplete="off"
                spellCheck="false"
                value={keyDraft}
                placeholder="sk-ant-..."
                onChange={(event) => {
                  setKeyDraft(event.target.value);
                  setKeyTested(false);
                }}
              />
              <button
                type="button"
                aria-label={showKey ? "API 키 숨기기" : "API 키 표시"}
                onClick={() => setShowKey((value) => !value)}
              >
                {showKey ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </span>
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={rememberDraft}
              onChange={(event) => setRememberDraft(event.target.checked)}
            />
            <span>
              <strong>이 기기에 기억</strong>
              <small>
                끄면 앱을 완전히 닫을 때 키가 사라져 더 안전해요.
              </small>
            </span>
          </label>

          <div className="settings-card__actions">
            <button
              className="primary-button"
              type="button"
              disabled={testingKey}
              onClick={() => void saveKey()}
            >
              {testingKey ? (
                <LoaderCircle className="spin" size={18} aria-hidden="true" />
              ) : keyTested ? (
                <Check size={18} aria-hidden="true" />
              ) : (
                <ShieldCheck size={18} aria-hidden="true" />
              )}
              {testingKey
                ? "연결 확인 중…"
                : keyTested
                  ? "연결 확인됨"
                  : "저장하고 연결 테스트"}
            </button>
            {apiKey && (
              <button
                className="text-button text-button--danger"
                type="button"
                onClick={() => {
                  onClearApiKey();
                  setKeyDraft("");
                  setKeyTested(false);
                }}
              >
                <Trash2 size={16} aria-hidden="true" />키 삭제
              </button>
            )}
          </div>

          <div className="security-note">
            <LockKeyhole size={17} aria-hidden="true" />
            <p>
              키는 백업이나 식단 파일에 포함되지 않습니다. AI 분석을 누를
              때만 음식 설명과 선택한 사진을 Anthropic으로 전송합니다.
              GitHub Pages에서는 보안을 위해 가능하면 기억 옵션을 끄세요.
            </p>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card__title">
            <span className="settings-card__icon">
              <ChevronRight size={19} aria-hidden="true" />
            </span>
            <div>
              <h2>분석과 날짜</h2>
              <p>나중에 모델이 바뀌어도 직접 교체할 수 있어요.</p>
            </div>
          </div>

          <label className="field">
            <span>AI 모델</span>
            <input
              list="model-presets"
              value={modelDraft}
              onChange={(event) => setModelDraft(event.target.value)}
            />
            <datalist id="model-presets">
              {MODEL_PRESETS.map((model) => (
                <option value={model.id} key={model.id}>
                  {model.name} — {model.description}
                </option>
              ))}
            </datalist>
          </label>

          <div className="model-presets">
            {MODEL_PRESETS.map((model) => (
              <button
                className={modelDraft === model.id ? "is-selected" : ""}
                type="button"
                key={model.id}
                onClick={() => setModelDraft(model.id)}
              >
                <span>
                  <strong>{model.name}</strong>
                  <small>{model.description}</small>
                </span>
                {modelDraft === model.id && (
                  <Check size={17} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>

          <label className="field">
            <span>하루 시작 시각</span>
            <select
              value={dayStartDraft}
              onChange={(event) => setDayStartDraft(Number(event.target.value))}
            >
              {Array.from({ length: 7 }, (_, hour) => (
                <option value={hour} key={hour}>
                  새벽 {hour}시
                </option>
              ))}
            </select>
          </label>
          <p className="field-help">
            {dayStartDraft === 0
              ? "자정을 기준으로 새로운 하루가 시작됩니다."
              : `현재 설정에서는 자정부터 ${String(dayStartDraft - 1).padStart(
                  2,
                  "0"
                )}:59까지의 기록이 전날에 포함됩니다.`}
          </p>

          <button
            className="secondary-button"
            type="button"
            disabled={isBusy}
            onClick={() => void savePreferences()}
          >
            설정 저장
          </button>
        </section>

        <section className="settings-card">
          <div className="settings-card__title">
            <span className="settings-card__icon">
              <Share2 size={19} aria-hidden="true" />
            </span>
            <div>
              <h2>LLM 분석용 내보내기</h2>
              <p>모바일 채팅창에 바로 붙여넣을 수 있어요.</p>
            </div>
          </div>

          <div className="date-range">
            <label className="field">
              <span>시작</span>
              <input
                type="date"
                value={exportRange.from}
                onChange={(event) =>
                  setExportRange((range) => ({
                    ...range,
                    from: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>종료</span>
              <input
                type="date"
                value={exportRange.to}
                onChange={(event) =>
                  setExportRange((range) => ({
                    ...range,
                    to: event.target.value
                  }))
                }
              />
            </label>
          </div>

          <div className="export-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                void onCopyMarkdown(exportRange.from, exportRange.to)
              }
            >
              <ClipboardCopy size={18} aria-hidden="true" />
              마크다운 복사
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                void onShareMarkdown(exportRange.from, exportRange.to)
              }
            >
              <Share2 size={18} aria-hidden="true" />
              공유
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                void onDownloadCsv(exportRange.from, exportRange.to)
              }
            >
              <FileDown size={18} aria-hidden="true" />
              CSV
            </button>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card__title">
            <span className="settings-card__icon">
              <Database size={19} aria-hidden="true" />
            </span>
            <div>
              <h2>백업과 복원</h2>
              <p>
                식단 {recordCount}개 · 대사량 {metabolismRecordCount}일 ·{" "}
                {storagePersisted === true
                  ? "기기 저장 보호됨"
                  : storagePersisted === false
                    ? "정기 백업 권장"
                    : "저장 상태 확인 중"}
              </p>
            </div>
          </div>

          <div className="export-actions export-actions--backup">
            <button
              className="secondary-button"
              type="button"
              disabled={isBusy}
              onClick={() => void onExportBackup(false)}
            >
              <Download size={18} aria-hidden="true" />
              기록만 빠른 백업
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isBusy}
              onClick={() => void onExportBackup(true)}
            >
              <Download size={18} aria-hidden="true" />
              사진 포함 전체 백업
            </button>
          </div>
          <p className="field-help">
            오래 기록한 휴대폰에서는 먼저 가벼운 기록 백업을 권장합니다.
            사진 포함 백업은 파일이 크고 시간이 더 걸릴 수 있어요.
          </p>

          <div className="restore-row">
            <label className="field">
              <span>복원 방식</span>
              <select
                value={restoreMode}
                onChange={(event) =>
                  setRestoreMode(event.target.value as RestoreMode)
                }
              >
                <option value="merge">기존 기록과 병합</option>
                <option value="replace">현재 기록을 지우고 교체</option>
              </select>
            </label>
            <label className="secondary-button file-button">
              <FileUp size={18} aria-hidden="true" />
              백업 파일 선택
              <input
                ref={restoreInputRef}
                type="file"
                accept="application/json,.json"
                disabled={isBusy}
                onChange={(event) =>
                  void handleRestore(event.target.files?.[0])
                }
              />
            </label>
          </div>
          <p className="field-help">
            두 백업 모두 API 키를 포함하지 않습니다. 사진 없는 백업을
            복원해도 식단, 영양성분, 대사량 기록과 활동 템플릿은 모두
            보존됩니다.
          </p>
        </section>

        <section className="privacy-card">
          <ShieldCheck size={21} aria-hidden="true" />
          <div>
            <h2>내 기록은 이 휴대폰에만</h2>
            <p>
              다른 사람이 같은 주소를 열어도 내 기록은 보이지 않습니다.
              브라우저 데이터 삭제나 휴대폰 교체 전에는 백업을 만들어주세요.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  return {
    from: localDateValue(from),
    to: localDateValue(to)
  };
}

function localDateValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
