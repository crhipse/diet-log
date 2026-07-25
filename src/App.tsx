import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import RecordDetailScreen from "./screens/RecordDetailScreen";
import RecordEditorScreen, {
  type RecordEditorPayload
} from "./screens/RecordEditorScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { analyzeFoodRecord, testApiKey } from "./lib/ai";
import {
  deleteRecordWithPhotos,
  getPhotosForRecord,
  getSettings,
  listRecords,
  requestPersistentStorage,
  saveRecord,
  saveSettings
} from "./lib/db";
import {
  addDays,
  formatDayLabel,
  getRecordDayKey,
  getTodayDayKey,
  isDayKeyInRange
} from "./lib/date";
import {
  buildCsv,
  buildMarkdown,
  downloadTextFile,
  exportBackup,
  importBackup,
  type ImportMode
} from "./lib/export";
import { createId } from "./lib/id";
import {
  clearApiKey,
  loadApiKey,
  saveApiKey
} from "./lib/keyStore";
import { sumRecords } from "./lib/nutrition";
import type {
  AppSettings,
  FoodAnalysisResult,
  FoodItem,
  FoodRecord,
  PendingPhoto,
  PhotoAsset
} from "./types";

type Screen =
  | { name: "home" }
  | { name: "editor"; recordId?: string }
  | { name: "detail"; recordId: string }
  | { name: "settings" };

interface ToastState {
  id: number;
  message: string;
  tone: "default" | "error";
}

const EMPTY_TOTALS = {
  energyKcal: null,
  carbsG: null,
  proteinG: null,
  fatG: null,
  sugarG: null,
  sodiumMg: null,
  fiberG: null,
  saturatedFatG: null,
  hasMissingCoreValues: false
} as const;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [records, setRecords] = useState<FoodRecord[]>([]);
  const [settings, setSettingsState] = useState<AppSettings | null>(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [credential, setCredential] = useState(loadApiKey);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [homePhotoUrls, setHomePhotoUrls] = useState<Record<string, string>>({});
  const [detailPhotoUrls, setDetailPhotoUrls] = useState<string[]>([]);
  const [editorPhotos, setEditorPhotos] = useState<PendingPhoto[]>([]);

  const notify = useCallback(
    (message: string, tone: "default" | "error" = "default") => {
      const id = Date.now();
      setToast({ id, message, tone });
      window.setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
      }, 3300);
    },
    []
  );

  const reloadRecords = useCallback(async () => {
    setRecords(await listRecords());
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [loadedRecords, loadedSettings, persisted] = await Promise.all([
          listRecords(),
          getSettings(),
          requestPersistentStorage()
        ]);
        if (!active) return;
        setRecords(loadedRecords);
        setSettingsState(loadedSettings);
        setSelectedDay(getTodayDayKey(loadedSettings.dayStartHour));
        setStoragePersisted(persisted);
      } catch (error) {
        if (active) {
          notify(errorMessage(error, "기록 저장소를 열지 못했습니다."), "error");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [notify]);

  const dayRecords = useMemo(() => {
    if (!settings || !selectedDay) return [];
    return records
      .filter(
        (record) =>
          getRecordDayKey(record, settings.dayStartHour) === selectedDay
      )
      .sort(
        (left, right) =>
          Date.parse(left.consumedAt) - Date.parse(right.consumedAt)
      );
  }, [records, selectedDay, settings]);

  const dailyTotals = useMemo(
    () => (dayRecords.length > 0 ? sumRecords(dayRecords) : EMPTY_TOTALS),
    [dayRecords]
  );

  const selectedRecord =
    screen.name === "detail" || screen.name === "editor"
      ? records.find((record) => record.id === screen.recordId)
      : undefined;

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    void (async () => {
      const entries = await Promise.all(
        dayRecords.map(async (record) => {
          if (record.photoIds.length === 0) return [record.id, ""] as const;
          const photos = await getPhotosForRecord(record.id);
          if (!photos[0]) return [record.id, ""] as const;
          const url = URL.createObjectURL(photos[0].blob);
          urls.push(url);
          return [record.id, url] as const;
        })
      );
      if (active) {
        setHomePhotoUrls(Object.fromEntries(entries));
      } else {
        urls.forEach((url) => URL.revokeObjectURL(url));
      }
    })().catch(() => {
      if (active) setHomePhotoUrls({});
    });

    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [dayRecords]);

  useEffect(() => {
    if (screen.name !== "detail") {
      setDetailPhotoUrls([]);
      return;
    }
    let active = true;
    const urls: string[] = [];
    void getPhotosForRecord(screen.recordId).then((photos) => {
      for (const photo of photos) {
        urls.push(URL.createObjectURL(photo.blob));
      }
      if (active) setDetailPhotoUrls(urls);
      else urls.forEach((url) => URL.revokeObjectURL(url));
    });
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [screen]);

  const openEditor = async (record?: FoodRecord) => {
    if (!record) {
      setEditorPhotos([]);
      setScreen({ name: "editor" });
      return;
    }
    try {
      const photos = await getPhotosForRecord(record.id);
      setEditorPhotos(photos.map(photoAssetToPending));
      setScreen({ name: "editor", recordId: record.id });
    } catch (error) {
      notify(errorMessage(error, "사진을 불러오지 못했습니다."), "error");
    }
  };

  const saveManualRecord = async (payload: RecordEditorPayload) => {
    setBusy(true);
    try {
      const previous = payload.existingRecordId
        ? records.find((record) => record.id === payload.existingRecordId)
        : undefined;
      const now = new Date().toISOString();
      const id = previous?.id ?? createId("record");
      const record: FoodRecord = {
        id,
        consumedAt: payload.consumedAt.toISOString(),
        timezoneOffsetMinutes: payload.timezoneOffsetMinutes,
        note: payload.note,
        photoIds: payload.photos.map((photo) => photo.id),
        foods: payload.foods,
        analysis: {
          status: "not_requested",
          assumptions: []
        },
        createdAt: previous?.createdAt ?? now,
        updatedAt: now
      };
      await saveRecord(record, pendingToAssets(id, payload.photos));
      await reloadRecords();
      if (settings) {
        setSelectedDay(getRecordDayKey(record, settings.dayStartHour));
      }
      setScreen({ name: "detail", recordId: id });
      notify("식단 기록을 저장했어요.");
    } catch (error) {
      notify(errorMessage(error, "기록을 저장하지 못했습니다."), "error");
    } finally {
      setBusy(false);
    }
  };

  const analyzeAndSaveRecord = async (payload: RecordEditorPayload) => {
    if (!credential.apiKey || !settings) return;
    setBusy(true);
    let pendingSaved = false;
    const previous = payload.existingRecordId
      ? records.find((record) => record.id === payload.existingRecordId)
      : undefined;
    const now = new Date().toISOString();
    const id = previous?.id ?? createId("record");
    const pendingRecord: FoodRecord = {
      id,
      consumedAt: payload.consumedAt.toISOString(),
      timezoneOffsetMinutes: payload.timezoneOffsetMinutes,
      note: payload.note,
      photoIds: payload.photos.map((photo) => photo.id),
      foods: previous?.foods ?? [],
      analysis: {
        ...(previous?.analysis ?? { assumptions: [] }),
        status: "pending",
        error: undefined
      },
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };

    try {
      await saveRecord(pendingRecord, pendingToAssets(id, payload.photos));
      pendingSaved = true;
      const result = await analyzeFoodRecord({
        apiKey: credential.apiKey,
        modelId: settings.modelId,
        note: payload.note,
        photos: payload.photos
      });
      const completed: FoodRecord = {
        ...pendingRecord,
        foods: result.foods,
        analysis: {
          status: "complete",
          modelId: result.modelId,
          analyzedAt: new Date().toISOString(),
          assumptions: result.assumptions,
          confidence: result.confidence,
          inputTokens: result.usage.totalInputTokens,
          outputTokens: result.usage.outputTokens
        },
        updatedAt: new Date().toISOString()
      };
      await saveRecord(completed);
      await reloadRecords();
      setSelectedDay(getRecordDayKey(completed, settings.dayStartHour));
      setScreen({ name: "detail", recordId: id });
      notify("AI 분석을 완료했어요. 추정값을 확인해주세요.");
    } catch (error) {
      const failed: FoodRecord = {
        ...pendingRecord,
        analysis: {
          ...pendingRecord.analysis,
          status: "failed",
          error: errorMessage(error, "AI 분석을 완료하지 못했습니다.")
        },
        updatedAt: new Date().toISOString()
      };
      if (pendingSaved) {
        await saveRecord(failed).catch(() => undefined);
        await reloadRecords().catch(() => undefined);
        setScreen({ name: "detail", recordId: id });
      }
      notify(failed.analysis.error ?? "AI 분석에 실패했습니다.", "error");
    } finally {
      setBusy(false);
    }
  };

  const copyPreviousRecord = async (record: FoodRecord) => {
    const photos = await getPhotosForRecord(record.id);
    return {
      note: record.note,
      foods: record.foods,
      photos: photos.map((photo) =>
        photoAssetToPending({
          ...photo,
          id: createId("photo"),
          recordId: ""
        })
      )
    };
  };

  const deleteSelectedRecord = async () => {
    if (!selectedRecord) return;
    setBusy(true);
    try {
      await deleteRecordWithPhotos(selectedRecord.id);
      await reloadRecords();
      setScreen({ name: "home" });
      notify("기록과 사진을 삭제했어요.");
    } catch (error) {
      notify(errorMessage(error, "기록을 삭제하지 못했습니다."), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveSelectedFoods = async (foods: FoodItem[]): Promise<boolean> => {
    if (!selectedRecord) return false;
    setBusy(true);
    try {
      await saveRecord({
        ...selectedRecord,
        foods,
        updatedAt: new Date().toISOString()
      });
      await reloadRecords();
      notify("수정한 영양성분을 저장했어요.");
      return true;
    } catch (error) {
      notify(errorMessage(error, "수정 내용을 저장하지 못했습니다."), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const reanalyzeSelected = async (): Promise<FoodAnalysisResult | null> => {
    if (!selectedRecord || !settings) return null;
    if (!credential.apiKey) {
      notify("설정에서 본인의 Claude API 키를 먼저 입력해주세요.", "error");
      return null;
    }
    setBusy(true);
    try {
      const photos = await getPhotosForRecord(selectedRecord.id);
      const result = await analyzeFoodRecord({
        apiKey: credential.apiKey,
        modelId: settings.modelId,
        note: selectedRecord.note,
        photos
      });
      return {
        foods: result.foods,
        assumptions: result.assumptions,
        confidence: result.confidence,
        modelId: result.modelId,
        inputTokens: result.usage.totalInputTokens,
        outputTokens: result.usage.outputTokens
      };
    } catch (error) {
      notify(errorMessage(error, "재분석을 완료하지 못했습니다."), "error");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const applyReanalysis = async (
    result: FoodAnalysisResult
  ): Promise<boolean> => {
    if (!selectedRecord) return false;
    setBusy(true);
    try {
      await saveRecord({
        ...selectedRecord,
        foods: result.foods,
        analysis: {
          status: "complete",
          modelId: result.modelId,
          analyzedAt: new Date().toISOString(),
          assumptions: result.assumptions,
          confidence: result.confidence,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens
        },
        updatedAt: new Date().toISOString()
      });
      await reloadRecords();
      notify("새 분석 결과를 적용했어요.");
      return true;
    } catch (error) {
      notify(errorMessage(error, "새 분석 결과를 저장하지 못했습니다."), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const updateApiKey = (apiKey: string, remember: boolean) => {
    saveApiKey(apiKey, remember);
    setCredential({ apiKey: apiKey.trim(), remembered: remember });
    notify(remember ? "API 키를 이 기기에 저장했어요." : "API 키를 이번 세션에 저장했어요.");
  };

  const removeApiKey = () => {
    clearApiKey();
    setCredential({ apiKey: "", remembered: false });
    notify("이 기기에서 API 키를 삭제했어요.");
  };

  const checkApiKey = async (apiKey: string): Promise<boolean> => {
    try {
      await testApiKey(apiKey);
      notify("Claude API 연결을 확인했어요.");
      return true;
    } catch (error) {
      notify(errorMessage(error, "API 키 연결을 확인하지 못했습니다."), "error");
      return false;
    }
  };

  const updateSettings = async (next: AppSettings) => {
    setBusy(true);
    try {
      const saved = await saveSettings(next);
      setSettingsState(saved);
      notify("분석과 날짜 설정을 저장했어요.");
    } catch (error) {
      notify(errorMessage(error, "설정을 저장하지 못했습니다."), "error");
    } finally {
      setBusy(false);
    }
  };

  const exportFullBackup = async (includePhotos: boolean) => {
    setBusy(true);
    try {
      const json = await exportBackup("json", { includePhotos });
      downloadTextFile(
        json,
        `식단관리-백업-${
          includePhotos ? "사진포함" : "기록만"
        }-${localDateValue(new Date())}.json`,
        "application/json;charset=utf-8"
      );
      notify(
        includePhotos
          ? "사진이 포함된 전체 백업을 만들었어요."
          : "가벼운 기록 백업을 만들었어요."
      );
    } catch (error) {
      notify(errorMessage(error, "백업을 만들지 못했습니다."), "error");
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (file: File, mode: ImportMode) => {
    setBusy(true);
    try {
      const result = await importBackup(file, mode);
      const loadedSettings = await getSettings();
      setSettingsState(loadedSettings);
      await reloadRecords();
      setSelectedDay(getTodayDayKey(loadedSettings.dayStartHour));
      notify(
        `${result.recordsImported}개 기록과 ${result.photosImported}개 사진을 ${
          mode === "replace" ? "복원" : "병합"
        }했어요.${
          result.recordsSkipped > 0
            ? ` 더 최신인 기존 기록 ${result.recordsSkipped}개는 유지했어요.`
            : ""
        }`
      );
    } catch (error) {
      notify(errorMessage(error, "백업 파일을 복원하지 못했습니다."), "error");
    } finally {
      setBusy(false);
    }
  };

  const recordsInRange = (from: string, to: string) => {
    if (!settings) return [];
    if (!from || !to || from > to) {
      throw new Error("내보낼 시작일과 종료일을 확인해주세요.");
    }
    return records.filter((record) =>
      isDayKeyInRange(
        getRecordDayKey(record, settings.dayStartHour),
        from,
        to
      )
    );
  };

  const copyMarkdown = async (from: string, to: string) => {
    try {
      const selected = recordsInRange(from, to);
      if (selected.length === 0) throw new Error("선택한 기간에 기록이 없습니다.");
      const markdown = buildMarkdown(selected, settings?.dayStartHour ?? 2);
      await copyText(markdown);
      notify("LLM 분석용 식단 기록을 복사했어요.");
    } catch (error) {
      notify(errorMessage(error, "마크다운을 복사하지 못했습니다."), "error");
    }
  };

  const shareMarkdown = async (from: string, to: string) => {
    try {
      const selected = recordsInRange(from, to);
      if (selected.length === 0) throw new Error("선택한 기간에 기록이 없습니다.");
      const text = buildMarkdown(selected, settings?.dayStartHour ?? 2);
      if (navigator.share) {
        await navigator.share({ title: "식단 기록", text });
        return;
      }
      await copyText(text);
      notify("공유 기능을 지원하지 않아 클립보드에 복사했어요.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify(errorMessage(error, "식단 기록을 공유하지 못했습니다."), "error");
    }
  };

  const downloadCsv = async (from: string, to: string) => {
    try {
      const selected = recordsInRange(from, to);
      if (selected.length === 0) throw new Error("선택한 기간에 기록이 없습니다.");
      const csv = buildCsv(selected, settings?.dayStartHour ?? 2);
      downloadTextFile(
        csv,
        `식단기록-${from}-${to}.csv`,
        "text/csv;charset=utf-8"
      );
      notify("엑셀에서 열 수 있는 CSV 파일을 만들었어요.");
    } catch (error) {
      notify(errorMessage(error, "CSV를 만들지 못했습니다."), "error");
    }
  };

  if (loading || !settings || !selectedDay) {
    return (
      <div className="app-shell">
        <div className="loading-screen">
          <LoaderCircle className="spin" size={25} aria-hidden="true" />
          <strong>식단관리</strong>
          <span>내 기록을 불러오는 중…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {screen.name === "home" && (
        <HomeScreen
          dateLabel={formatDayLabel(selectedDay)}
          isToday={selectedDay === getTodayDayKey(settings.dayStartHour)}
          records={dayRecords}
          totals={dailyTotals}
          photoUrls={homePhotoUrls}
          onPreviousDate={() => setSelectedDay(addDays(selectedDay, -1))}
          onNextDate={() => setSelectedDay(addDays(selectedDay, 1))}
          onToday={() => setSelectedDay(getTodayDayKey(settings.dayStartHour))}
          onOpenSettings={() => setScreen({ name: "settings" })}
          onAddRecord={() => void openEditor()}
          onOpenRecord={(recordId) => setScreen({ name: "detail", recordId })}
        />
      )}

      {screen.name === "editor" && (
        <RecordEditorScreen
          key={screen.recordId ?? "new"}
          initialRecord={selectedRecord}
          initialPhotos={editorPhotos}
          recentRecords={records.filter(
            (record) => record.id !== selectedRecord?.id
          )}
          isBusy={busy}
          apiKeyAvailable={Boolean(credential.apiKey)}
          onCancel={() =>
            setScreen(
              selectedRecord
                ? { name: "detail", recordId: selectedRecord.id }
                : { name: "home" }
            )
          }
          onSaveManual={saveManualRecord}
          onAnalyze={analyzeAndSaveRecord}
          onCopyRecord={copyPreviousRecord}
          onSaveApiKey={updateApiKey}
          onNotify={notify}
        />
      )}

      {screen.name === "detail" &&
        (selectedRecord ? (
          <RecordDetailScreen
            key={`${selectedRecord.id}-${selectedRecord.updatedAt}`}
            record={selectedRecord}
            photoUrls={detailPhotoUrls}
            isBusy={busy}
            onBack={() => setScreen({ name: "home" })}
            onEdit={() => void openEditor(selectedRecord)}
            onDelete={deleteSelectedRecord}
            onSaveFoods={saveSelectedFoods}
            onReanalyze={reanalyzeSelected}
            onApplyReanalysis={applyReanalysis}
            onNotify={notify}
          />
        ) : (
          <div className="loading-screen">
            <p>기록을 찾을 수 없습니다.</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setScreen({ name: "home" })}
            >
              타임라인으로 돌아가기
            </button>
          </div>
        ))}

      {screen.name === "settings" && (
        <SettingsScreen
          settings={settings}
          apiKey={credential.apiKey}
          remembered={credential.remembered}
          recordCount={records.length}
          storagePersisted={storagePersisted}
          isBusy={busy}
          onBack={() => setScreen({ name: "home" })}
          onSaveApiKey={updateApiKey}
          onClearApiKey={removeApiKey}
          onTestApiKey={checkApiKey}
          onSaveSettings={updateSettings}
          onExportBackup={exportFullBackup}
          onRestoreBackup={restoreBackup}
          onCopyMarkdown={copyMarkdown}
          onShareMarkdown={shareMarkdown}
          onDownloadCsv={downloadCsv}
          onNotify={notify}
        />
      )}

      {toast && (
        <div
          className={`toast ${toast.tone === "error" ? "toast--error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function pendingToAssets(
  recordId: string,
  photos: readonly PendingPhoto[]
): PhotoAsset[] {
  const now = Date.now();
  return photos.map((photo, index) => ({
    id: photo.id,
    recordId,
    blob: photo.blob,
    width: photo.width,
    height: photo.height,
    createdAt: new Date(now + index).toISOString()
  }));
}

function photoAssetToPending(photo: PhotoAsset): PendingPhoto {
  return {
    id: photo.id,
    blob: photo.blob,
    width: photo.width,
    height: photo.height,
    previewUrl: URL.createObjectURL(photo.blob)
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function localDateValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("클립보드 복사를 지원하지 않는 브라우저입니다.");
}
