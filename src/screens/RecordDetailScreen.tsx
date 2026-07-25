import {
  AlertCircle,
  ArrowLeft,
  Check,
  Edit3,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { useState } from "react";
import FoodEditor from "../components/FoodEditor";
import {
  formatKcal,
  formatMacroLine,
  formatNumber,
  formatRecordDateTime
} from "../lib/format";
import type {
  FoodAnalysisResult,
  FoodItem,
  FoodRecord,
  Nutrients
} from "../types";

interface RecordDetailScreenProps {
  record: FoodRecord;
  photoUrls: string[];
  isBusy: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onSaveFoods: (foods: FoodItem[]) => Promise<boolean>;
  onReanalyze: () => Promise<FoodAnalysisResult | null>;
  onApplyReanalysis: (result: FoodAnalysisResult) => Promise<boolean>;
  onNotify: (message: string, tone?: "default" | "error") => void;
}

export default function RecordDetailScreen({
  record,
  photoUrls,
  isBusy,
  onBack,
  onEdit,
  onDelete,
  onSaveFoods,
  onReanalyze,
  onApplyReanalysis,
  onNotify
}: RecordDetailScreenProps) {
  const [editingNumbers, setEditingNumbers] = useState(false);
  const [draftFoods, setDraftFoods] = useState<FoodItem[]>(record.foods);
  const [showExtras, setShowExtras] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [candidate, setCandidate] = useState<FoodAnalysisResult | null>(null);

  const totals = sumFoods(record.foods);

  const handleDelete = async () => {
    if (
      !window.confirm(
        "이 기록과 저장된 사진을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다."
      )
    ) {
      return;
    }
    await onDelete();
  };

  const saveNumbers = async () => {
    const valid = draftFoods.filter((food) => food.name.trim());
    if (valid.length === 0) {
      onNotify("음식이 최소 하나는 필요합니다.", "error");
      return;
    }
    const saved = await onSaveFoods(
      valid.map((food) => ({ ...food, userEdited: true }))
    );
    if (saved) setEditingNumbers(false);
  };

  const reanalyze = async () => {
    setReanalyzing(true);
    try {
      const result = await onReanalyze();
      if (result) setCandidate(result);
    } finally {
      setReanalyzing(false);
    }
  };

  const applyCandidate = async () => {
    if (!candidate) return;
    const applied = await onApplyReanalysis(candidate);
    if (applied) setCandidate(null);
  };

  return (
    <main className="screen detail-screen">
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
          <p className="eyebrow">기록 상세</p>
          <h1>
            {formatRecordDateTime(
              record.consumedAt,
              record.timezoneOffsetMinutes
            )}
          </h1>
        </div>
        <div className="topbar__actions">
          <button
            className="icon-button icon-button--ghost"
            type="button"
            aria-label="기록 전체 수정"
            onClick={onEdit}
          >
            <Edit3 size={19} aria-hidden="true" />
          </button>
          <button
            className="icon-button icon-button--ghost icon-button--danger"
            type="button"
            aria-label="기록 삭제"
            onClick={() => void handleDelete()}
          >
            <Trash2 size={19} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="detail-screen__body">
        {photoUrls.length > 0 && (
          <section className="detail-photos" aria-label="음식 사진">
            {photoUrls.map((url, index) => (
              <img src={url} alt={`음식 사진 ${index + 1}`} key={url} />
            ))}
          </section>
        )}

        {record.note && (
          <section className="detail-note">
            <span className="eyebrow">입력한 내용</span>
            <p>{record.note}</p>
          </section>
        )}

        {record.analysis.status === "pending" && (
          <div className="analysis-banner">
            <LoaderCircle className="spin" size={19} aria-hidden="true" />
            <div>
              <strong>AI 분석을 기다리고 있어요</strong>
              <p>기록은 이미 안전하게 저장되었습니다.</p>
            </div>
          </div>
        )}

        {record.analysis.status === "failed" && (
          <div className="analysis-banner analysis-banner--error">
            <AlertCircle size={19} aria-hidden="true" />
            <div>
              <strong>분석을 완료하지 못했어요</strong>
              <p>
                {record.analysis.error ??
                  "인터넷 연결과 API 키를 확인한 뒤 다시 시도해주세요."}
              </p>
            </div>
          </div>
        )}

        {editingNumbers ? (
          <section className="form-section form-section--food-editor">
            <div className="section-heading">
              <div>
                <h2>음식과 숫자 수정</h2>
                <p>수정한 값은 다음 재분석 전까지 유지됩니다.</p>
              </div>
              <button
                className="icon-button icon-button--small"
                type="button"
                aria-label="수정 취소"
                onClick={() => {
                  setDraftFoods(record.foods);
                  setEditingNumbers(false);
                }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <FoodEditor foods={draftFoods} onChange={setDraftFoods} compact />
            <button
              className="primary-button"
              type="button"
              disabled={isBusy}
              onClick={() => void saveNumbers()}
            >
              {isBusy ? (
                <LoaderCircle className="spin" size={18} aria-hidden="true" />
              ) : (
                <Check size={18} aria-hidden="true" />
              )}
              수정 내용 저장
            </button>
          </section>
        ) : (
          <section className="food-detail-list">
            <div className="section-heading">
              <div>
                <h2>음식별 추정</h2>
                <p>{record.foods.length}개 음식</p>
              </div>
              {record.analysis.confidence && (
                <span className="confidence-chip">
                  신뢰도 {confidenceLabel(record.analysis.confidence)}
                </span>
              )}
            </div>

            {record.foods.length === 0 ? (
              <div className="empty-inline">
                <p>아직 입력된 영양성분이 없습니다.</p>
              </div>
            ) : (
              record.foods.map((food) => (
                <article className="food-detail-row" key={food.id}>
                  <div className="food-detail-row__heading">
                    <div>
                      <h3>{food.name}</h3>
                      <p>{food.amountText || "양 미입력"}</p>
                    </div>
                    <strong>{formatKcal(food.nutrients.energyKcal)}</strong>
                  </div>
                  <p className="food-detail-row__macros">
                    {formatMacroLine(food.nutrients)}
                  </p>
                  {showExtras && (
                    <dl className="extra-nutrients">
                      <div>
                        <dt>당류</dt>
                        <dd>{formatNumber(food.nutrients.sugarG, 1)}g</dd>
                      </div>
                      <div>
                        <dt>나트륨</dt>
                        <dd>{formatNumber(food.nutrients.sodiumMg)}mg</dd>
                      </div>
                      <div>
                        <dt>식이섬유</dt>
                        <dd>{formatNumber(food.nutrients.fiberG, 1)}g</dd>
                      </div>
                      <div>
                        <dt>포화지방</dt>
                        <dd>
                          {formatNumber(food.nutrients.saturatedFatG, 1)}g
                        </dd>
                      </div>
                    </dl>
                  )}
                </article>
              ))
            )}

            {record.foods.length > 0 && (
              <button
                className="text-button text-button--muted detail-extras-toggle"
                type="button"
                onClick={() => setShowExtras((value) => !value)}
              >
                {showExtras ? "추가 영양소 숨기기" : "추가 영양소 보기"}
              </button>
            )}

            <div className="record-total">
              <span>합계</span>
              <strong>{formatKcal(totals.energyKcal)}</strong>
              <p>{formatMacroLine(totals)}</p>
            </div>
          </section>
        )}

        {record.analysis.assumptions.length > 0 && (
          <section className="assumptions">
            <div>
              <Sparkles size={17} aria-hidden="true" />
              <h2>AI가 이렇게 가정했어요</h2>
            </div>
            <ul>
              {record.analysis.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
            <p>영양성분은 추정값이며 실제 조리법과 양에 따라 달라질 수 있어요.</p>
          </section>
        )}

        {record.analysis.modelId && (
          <p className="analysis-meta">
            {record.analysis.modelId}
            {record.analysis.inputTokens != null &&
              ` · 입력 ${record.analysis.inputTokens.toLocaleString("ko-KR")}토큰`}
            {record.analysis.outputTokens != null &&
              ` · 출력 ${record.analysis.outputTokens.toLocaleString("ko-KR")}토큰`}
          </p>
        )}
      </div>

      {!editingNumbers && (
        <footer className="sticky-actions sticky-actions--row">
          <button
            className="secondary-button"
            type="button"
            disabled={isBusy || reanalyzing}
            onClick={() => {
              setDraftFoods(record.foods);
              setEditingNumbers(true);
            }}
          >
            <Edit3 size={18} aria-hidden="true" />
            숫자 수정
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={isBusy || reanalyzing}
            onClick={() => void reanalyze()}
          >
            {reanalyzing ? (
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
            ) : (
              <RefreshCw size={18} aria-hidden="true" />
            )}
            재분석
          </button>
        </footer>
      )}

      {candidate && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="bottom-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="candidate-title"
          >
            <header className="bottom-sheet__header">
              <div>
                <p className="eyebrow">현재 기록은 아직 그대로예요</p>
                <h2 id="candidate-title">새 분석 결과 확인</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="새 분석 결과 닫기"
                onClick={() => setCandidate(null)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <div className="candidate-list">
              {candidate.foods.map((food) => (
                <div key={food.id}>
                  <span>
                    <strong>{food.name}</strong>
                    <small>{food.amountText}</small>
                  </span>
                  <b>{formatKcal(food.nutrients.energyKcal)}</b>
                </div>
              ))}
            </div>
            <div className="record-total record-total--candidate">
              <span>새 합계</span>
              <strong>{formatKcal(sumFoods(candidate.foods).energyKcal)}</strong>
            </div>
            <div className="bottom-sheet__actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setCandidate(null)}
              >
                기존 값 유지
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={isBusy}
                onClick={() => void applyCandidate()}
              >
                새 결과 적용
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function sumFoods(foods: FoodItem[]): Nutrients {
  const keys: (keyof Nutrients)[] = [
    "energyKcal",
    "carbsG",
    "proteinG",
    "fatG",
    "sugarG",
    "sodiumMg",
    "fiberG",
    "saturatedFatG"
  ];
  return Object.fromEntries(
    keys.map((key) => {
      const values = foods
        .map((food) => food.nutrients[key])
        .filter((value): value is number => value != null);
      return [
        key,
        values.length > 0
          ? values.reduce((sum, value) => sum + value, 0)
          : null
      ];
    })
  ) as unknown as Nutrients;
}

function confidenceLabel(value: "high" | "medium" | "low"): string {
  if (value === "high") return "높음";
  if (value === "medium") return "보통";
  return "낮음";
}
