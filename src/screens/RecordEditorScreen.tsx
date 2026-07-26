import {
  ArrowLeft,
  Camera,
  Check,
  Clock3,
  Copy,
  ImagePlus,
  KeyRound,
  LoaderCircle,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import FoodEditor, { createEmptyFood } from "../components/FoodEditor";
import { MAX_PHOTOS_PER_RECORD } from "../constants";
import {
  composeDateTimeLocalValue,
  formatRecordDateTime,
  fromDateTimeLocalValue,
  toDateTimeLocalValue
} from "../lib/format";
import { createId } from "../lib/id";
import { compressImages, revokePendingPhoto } from "../lib/photos";
import type { FoodItem, FoodRecord, PendingPhoto } from "../types";

export interface RecordEditorPayload {
  existingRecordId?: string;
  consumedAt: Date;
  timezoneOffsetMinutes: number;
  note: string;
  photos: PendingPhoto[];
  foods: FoodItem[];
}

interface CopyResult {
  note: string;
  foods: FoodItem[];
  photos: PendingPhoto[];
}

interface RecordEditorScreenProps {
  initialRecord?: FoodRecord;
  initialPhotos?: PendingPhoto[];
  recentRecords: FoodRecord[];
  isBusy: boolean;
  apiKeyAvailable: boolean;
  onCancel: () => void;
  onSaveManual: (payload: RecordEditorPayload) => Promise<void>;
  onAnalyze: (payload: RecordEditorPayload) => Promise<void>;
  onCopyRecord: (record: FoodRecord) => Promise<CopyResult>;
  onSaveApiKey: (apiKey: string, remember: boolean) => void;
  onNotify: (message: string, tone?: "default" | "error") => void;
}

export default function RecordEditorScreen({
  initialRecord,
  initialPhotos = [],
  recentRecords,
  isBusy,
  apiKeyAvailable,
  onCancel,
  onSaveManual,
  onAnalyze,
  onCopyRecord,
  onSaveApiKey,
  onNotify
}: RecordEditorScreenProps) {
  const initialConsumedAt = useRef(
    toDateTimeLocalValue(
      initialRecord ? new Date(initialRecord.consumedAt) : new Date(),
      initialRecord?.timezoneOffsetMinutes
    )
  ).current;
  const [consumedDate, setConsumedDate] = useState(
    initialConsumedAt.slice(0, 10)
  );
  const [consumedHour, setConsumedHour] = useState(
    initialConsumedAt.slice(11, 13)
  );
  const preservedMinuteRef = useRef(initialConsumedAt.slice(14, 16));
  const [note, setNote] = useState(initialRecord?.note ?? "");
  const [photos, setPhotos] = useState<PendingPhoto[]>(initialPhotos);
  const [foods, setFoods] = useState<FoodItem[]>(
    initialRecord?.foods.map((food) => ({
      ...food,
      nutrients: { ...food.nutrients }
    })) ?? []
  );
  const [manualMode, setManualMode] = useState(
    Boolean(initialRecord?.foods.length)
  );
  const [copyOpen, setCopyOpen] = useState(false);
  const [quickKeyOpen, setQuickKeyOpen] = useState(false);
  const [quickKey, setQuickKey] = useState("");
  const [quickRemember, setQuickRemember] = useState(false);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const ownedPhotosRef = useRef<PendingPhoto[]>(initialPhotos);

  useEffect(() => {
    ownedPhotosRef.current = photos;
  }, [photos]);

  useEffect(
    () => () => {
      ownedPhotosRef.current.forEach(revokePendingPhoto);
    },
    []
  );

  const buildPayload = (): RecordEditorPayload | null => {
    try {
      const consumedAtValue = composeDateTimeLocalValue(
        consumedDate,
        consumedHour,
        preservedMinuteRef.current
      );
      const parsedConsumedAt = fromDateTimeLocalValue(
        consumedAtValue,
        initialRecord?.timezoneOffsetMinutes
      );
      return {
        existingRecordId: initialRecord?.id,
        consumedAt: parsedConsumedAt,
        timezoneOffsetMinutes:
          initialRecord?.timezoneOffsetMinutes ??
          parsedConsumedAt.getTimezoneOffset(),
        note: note.trim(),
        photos,
        foods
      };
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : "먹은 시각을 확인해주세요.",
        "error"
      );
      return null;
    }
  };

  const handleAnalyze = async () => {
    if (!note.trim() && photos.length === 0) {
      onNotify("사진이나 음식 설명을 하나 이상 입력해주세요.", "error");
      return;
    }
    if (!apiKeyAvailable) {
      setQuickKeyOpen(true);
      return;
    }
    const payload = buildPayload();
    if (payload) await onAnalyze(payload);
  };

  const handleManualSave = async () => {
    const validFoods = foods.filter((food) => food.name.trim());
    if (validFoods.length === 0) {
      onNotify("수동으로 저장할 음식명을 입력해주세요.", "error");
      return;
    }
    const payload = buildPayload();
    if (payload) await onSaveManual({ ...payload, foods: validFoods });
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const available = MAX_PHOTOS_PER_RECORD - photos.length;
    if (available <= 0) {
      onNotify(`사진은 최대 ${MAX_PHOTOS_PER_RECORD}장까지 추가할 수 있어요.`);
      return;
    }
    const selected = Array.from(fileList).slice(0, available);
    if (fileList.length > available) {
      onNotify(`사진은 최대 ${MAX_PHOTOS_PER_RECORD}장까지만 추가했어요.`);
    }

    setProcessingPhotos(true);
    try {
      const compressed = await compressImages(selected, photos.length);
      setPhotos((current) => [...current, ...compressed]);
    } catch (error) {
      onNotify(
        error instanceof Error
          ? error.message
          : "사진을 불러오지 못했습니다.",
        "error"
      );
    } finally {
      setProcessingPhotos(false);
    }
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target) revokePendingPhoto(target);
      return current.filter((photo) => photo.id !== id);
    });
  };

  const copyRecord = async (record: FoodRecord) => {
    try {
      const copied = await onCopyRecord(record);
      photos.forEach(revokePendingPhoto);
      setNote(copied.note);
      setFoods(
        copied.foods.map((food) => ({
          ...food,
          id: createId("food"),
          source: "copied",
          userEdited: false,
          nutrients: { ...food.nutrients }
        }))
      );
      setPhotos(copied.photos);
      setManualMode(true);
      setCopyOpen(false);
      onNotify("이전 기록을 불러왔어요. 양과 시간을 확인해주세요.");
    } catch {
      onNotify("이전 기록을 복사하지 못했습니다.", "error");
    }
  };

  return (
    <main className="screen editor-screen">
      <header className="topbar topbar--compact">
        <button
          className="icon-button icon-button--ghost"
          type="button"
          aria-label="뒤로 가기"
          disabled={isBusy}
          onClick={onCancel}
        >
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <h1>{initialRecord ? "기록 수정" : "기록 추가"}</h1>
        <span className="topbar__spacer" />
      </header>

      <div className="editor-screen__body">
        <section className="form-section">
          <div className="field-grid">
            <label className="field field--datetime">
              <span>
                <Clock3 size={16} aria-hidden="true" />
                먹은 날짜
              </span>
              <input
                type="date"
                required
                value={consumedDate}
                max="9999-12-31"
                onChange={(event) => setConsumedDate(event.target.value)}
              />
            </label>
            <label className="field field--datetime">
              <span>
                <Clock3 size={16} aria-hidden="true" />
                먹은 시간
              </span>
              <select
                required
                value={consumedHour}
                onChange={(event) => setConsumedHour(event.target.value)}
              >
                {Array.from({ length: 24 }, (_, hour) => {
                  const value = String(hour).padStart(2, "0");
                  return (
                    <option value={value} key={value}>
                      {hour}시
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading">
            <div>
              <h2>사진</h2>
              <p>선택 · 최대 {MAX_PHOTOS_PER_RECORD}장</p>
            </div>
            <span>
              {photos.length}/{MAX_PHOTOS_PER_RECORD}
            </span>
          </div>

          {photos.length > 0 && (
            <div className="photo-grid">
              {photos.map((photo, index) => (
                <div className="photo-tile" key={photo.id}>
                  <img src={photo.previewUrl} alt={`음식 사진 ${index + 1}`} />
                  <button
                    type="button"
                    aria-label={`음식 사진 ${index + 1} 삭제`}
                    onClick={() => removePhoto(photo.id)}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="photo-actions">
            <label
              className={`photo-action ${
                photos.length >= MAX_PHOTOS_PER_RECORD ? "is-disabled" : ""
              }`}
            >
              <Camera size={21} aria-hidden="true" />
              <span>사진 촬영</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={
                  photos.length >= MAX_PHOTOS_PER_RECORD || processingPhotos
                }
                onChange={(event) => {
                  void handleFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            <label
              className={`photo-action ${
                photos.length >= MAX_PHOTOS_PER_RECORD ? "is-disabled" : ""
              }`}
            >
              <ImagePlus size={21} aria-hidden="true" />
              <span>앨범에서 선택</span>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={
                  photos.length >= MAX_PHOTOS_PER_RECORD || processingPhotos
                }
                onChange={(event) => {
                  void handleFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {processingPhotos && (
            <p className="inline-status">
              <LoaderCircle className="spin" size={16} aria-hidden="true" />
              사진을 가볍게 줄이는 중…
            </p>
          )}
        </section>

        <section className="form-section">
          <label className="field">
            <span>먹은 음식과 양</span>
            <textarea
              rows={4}
              value={note}
              placeholder="예: 삼겹살 2인분 중 절반, 상추쌈 5개, 된장찌개 조금"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <p className="field-help">
            무게를 몰라도 괜찮아요. 여러 음식을 한 번에 자유롭게 적어주세요.
          </p>
        </section>

        {manualMode && (
          <section className="form-section form-section--food-editor">
            <div className="section-heading">
              <div>
                <h2>영양성분 직접 입력</h2>
                <p>모르는 값은 비워두세요.</p>
              </div>
              <Check size={19} aria-hidden="true" />
            </div>
            <FoodEditor
              foods={foods.length > 0 ? foods : [createEmptyFood()]}
              onChange={setFoods}
            />
          </section>
        )}
      </div>

      <footer className="sticky-actions">
        {manualMode ? (
          <button
            className="primary-button"
            type="button"
            disabled={isBusy || processingPhotos}
            onClick={() => void handleManualSave()}
          >
            {isBusy ? (
              <LoaderCircle className="spin" size={19} aria-hidden="true" />
            ) : (
              <Check size={19} aria-hidden="true" />
            )}
            수동 기록 저장
          </button>
        ) : (
          <>
            <button
              className="primary-button"
              type="button"
              disabled={isBusy || processingPhotos}
              onClick={() => void handleAnalyze()}
            >
              {isBusy ? (
                <LoaderCircle className="spin" size={19} aria-hidden="true" />
              ) : (
                <Sparkles size={19} aria-hidden="true" />
              )}
              {isBusy ? "AI가 살펴보는 중…" : "AI 분석으로 저장"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isBusy}
              onClick={() => {
                setFoods(foods.length > 0 ? foods : [createEmptyFood()]);
                setManualMode(true);
              }}
            >
              수동으로 입력
            </button>
          </>
        )}

        {recentRecords.length > 0 && !initialRecord && (
          <button
            className="text-button"
            type="button"
            disabled={isBusy}
            onClick={() => setCopyOpen(true)}
          >
            <Copy size={16} aria-hidden="true" />
            이전 기록에서 복사
          </button>
        )}
      </footer>

      {copyOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="bottom-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="copy-title"
          >
            <header className="bottom-sheet__header">
              <div>
                <p className="eyebrow">API 비용 없이 빠르게</p>
                <h2 id="copy-title">이전 기록 복사</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="닫기"
                onClick={() => setCopyOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className="copy-list">
              {recentRecords.slice(0, 12).map((record) => (
                <button
                  type="button"
                  key={record.id}
                  onClick={() => void copyRecord(record)}
                >
                  <span>
                    <strong>
                      {record.foods.map((food) => food.name).join(", ") ||
                        record.note}
                    </strong>
                    <small>
                      {formatRecordDateTime(
                        record.consumedAt,
                        record.timezoneOffsetMinutes
                      )}
                    </small>
                  </span>
                  <Copy size={17} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {quickKeyOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="bottom-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-key-title"
          >
            <header className="bottom-sheet__header">
              <div>
                <p className="eyebrow">내 비용은 내 계정에서</p>
                <h2 id="quick-key-title">Claude API 키 입력</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="API 키 입력 닫기"
                onClick={() => setQuickKeyOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <label className="field">
              <span>API 키</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck="false"
                value={quickKey}
                placeholder="sk-ant-..."
                onChange={(event) => setQuickKey(event.target.value)}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={quickRemember}
                onChange={(event) => setQuickRemember(event.target.checked)}
              />
              <span>
                <strong>이 기기에 기억</strong>
                <small>끄면 앱을 완전히 닫을 때 키가 사라집니다.</small>
              </span>
            </label>
            <div className="security-note">
              <KeyRound size={17} aria-hidden="true" />
              <p>
                이 키는 식단 백업이나 내보내기 파일에 포함되지 않습니다.
                각 사용자가 본인 키를 입력해야 합니다. GitHub Pages에서는
                가능하면 이 기기에 기억하지 않는 것을 권장합니다.
              </p>
            </div>
            <button
              className="primary-button primary-button--full"
              type="button"
              onClick={() => {
                if (!quickKey.trim()) {
                  onNotify("API 키를 입력해주세요.", "error");
                  return;
                }
                onSaveApiKey(quickKey, quickRemember);
                setQuickKeyOpen(false);
                onNotify("키를 저장했어요. AI 분석 버튼을 다시 눌러주세요.");
              }}
            >
              API 키 저장
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
