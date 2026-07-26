import {
  AlertTriangle,
  Check,
  ChevronRight,
  Gauge,
  Pencil,
  Sparkles,
  Target,
  X
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DailyTotals } from "../types";
import { addDays, parseDayKey } from "../lib/date";
import type {
  GoalSettings,
  GoalTargetSnapshot,
  GoalTdeeSource
} from "../lib/goalHistory";
import {
  goalTargetForDay,
  latestGoalTarget
} from "../lib/goalHistory";
import {
  calculateGoalRecommendation,
  type GoalPace,
  type GoalPlan,
  type GoalRecommendation,
  type GoalType,
  type TdeeRecommendationChange,
  validateGoalPlan
} from "../lib/goals";
import { useDialogFocus } from "../lib/useDialogFocus";
import "./GoalDashboard.css";

export interface GoalBasis {
  tdeeKcal: number;
  weightKg: number;
  heightCm?: number;
  source: Exclude<GoalTdeeSource, "manual">;
}

export interface SaveGoalInput {
  plan: GoalPlan;
  recommendation: GoalRecommendation;
  tdeeSource: GoalTdeeSource;
}

interface GoalDashboardProps {
  selectedDay: string;
  todayDay: string;
  selectedTotals: DailyTotals;
  totalsByDate: Readonly<Record<string, DailyTotals>>;
  goalSettings?: GoalSettings;
  currentBasis?: GoalBasis;
  recommendationChange?: TdeeRecommendationChange;
  onSaveGoal: (input: SaveGoalInput) => void | Promise<void>;
  onOpenMetabolism: () => void;
}

const GOAL_TYPES: Array<{
  value: GoalType;
  label: string;
  description: string;
}> = [
  {
    value: "fat_loss",
    label: "체중 감량",
    description: "칼로리 적자로 체중과 체지방을 줄여요."
  },
  {
    value: "maintenance_recomp",
    label: "유지·리컴프",
    description: "체중은 유지하며 체성분 개선을 노려요."
  },
  {
    value: "lean_mass_gain",
    label: "린매스업",
    description: "작은 열량 흑자로 근육 증가를 우선해요."
  },
  {
    value: "bulk",
    label: "벌크업",
    description: "더 빠른 증량과 지방 증가 가능성을 함께 봐요."
  },
  {
    value: "custom",
    label: "직접 설정",
    description: "칼로리와 단백질 목표를 직접 입력해요."
  }
];

const PACES: Array<{
  value: GoalPace;
  label: string;
  description: string;
}> = [
  { value: "gentle", label: "완만하게", description: "지속하기 편한 변화" },
  { value: "moderate", label: "보통", description: "균형 잡힌 기본 추천" },
  { value: "fast", label: "빠르게", description: "변화와 부담이 모두 큼" }
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const GOAL_DRAFT_KEY = "diet-log.goal-setup-draft.v1";

export default function GoalDashboard({
  selectedDay,
  todayDay,
  selectedTotals,
  totalsByDate,
  goalSettings,
  currentBasis,
  recommendationChange,
  onSaveGoal,
  onOpenMetabolism
}: GoalDashboardProps) {
  const [setupOpen, setSetupOpen] = useState(hasGoalSetupDraft);
  const selectedTarget = goalTargetForDay(goalSettings, selectedDay);
  const latestTarget = latestGoalTarget(goalSettings);
  const weekDays = weekDayKeys(selectedDay).map((dayKey) => ({
    dayKey,
    totals: totalsByDate[dayKey],
    target: goalTargetForDay(goalSettings, dayKey)
  }));

  if (!latestTarget) {
    return (
      <>
        <section className="goal-empty-card" aria-label="목표 설정">
          <span className="goal-empty-card__icon">
            <Target size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>나에게 맞는 목표를 설정해 보세요</strong>
            <p>
              감량·리컴프·증량 목적에 맞춰 칼로리 범위와 단백질 목표량을
              추천해 드려요.
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => setSetupOpen(true)}
          >
            목표 설정
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </section>

        {setupOpen && (
          <GoalSetupSheet
            todayDay={todayDay}
            basis={currentBasis}
            onOpenMetabolism={onOpenMetabolism}
            onClose={() => setSetupOpen(false)}
            onSave={async (input) => {
              await onSaveGoal(input);
              setSetupOpen(false);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <section className="goal-dashboard" aria-label="목표 달성 현황">
        <div className="goal-dashboard__heading">
          <div>
            <span>
              {goalTypeLabel(
                selectedTarget?.plan.goalType ?? latestTarget.plan.goalType
              )}
            </span>
            <h2>
              {selectedTarget
                ? selectedDay === todayDay
                  ? "오늘의 목표"
                  : "이 날의 목표"
                : "이 날짜에는 적용된 목표가 없어요"}
            </h2>
            {selectedTarget &&
              (selectedTarget.plan.targetWeightKg ||
                selectedTarget.plan.targetDate) && (
                <p className="goal-dashboard__destination">
                  {[
                    selectedTarget.plan.targetWeightKg
                      ? `목표 ${selectedTarget.plan.targetWeightKg}kg`
                      : "",
                    selectedTarget.plan.targetDate
                      ? selectedTarget.plan.targetDate.replaceAll("-", ".")
                      : ""
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
          </div>
          <button
            className="goal-dashboard__edit"
            type="button"
            onClick={() => setSetupOpen(true)}
          >
            <Pencil size={13} aria-hidden="true" />
            목표 수정
          </button>
        </div>

        {selectedDay === todayDay &&
          recommendationChange?.shouldUpdate &&
          recommendationChange.targetDeltaKcal !== 0 && (
            <button
              className="goal-update-banner"
              type="button"
              onClick={() => setSetupOpen(true)}
            >
              <Sparkles size={17} aria-hidden="true" />
              <span>
                <strong>새 TDEE 추천이 있어요</strong>
                <small>
                  현재 목표보다{" "}
                  {Math.abs(recommendationChange.targetDeltaKcal)}kcal{" "}
                  {recommendationChange.targetDeltaKcal > 0 ? "높게" : "낮게"}{" "}
                  조정할 수 있어요.
                </small>
              </span>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          )}

        {selectedTarget ? (
          <>
            <div className="goal-metrics">
              <GoalMetric
                kind="calories"
                label="칼로리"
                value={selectedTotals.energyKcal}
                min={selectedTarget.dailyCalories.minKcal}
                target={selectedTarget.dailyCalories.targetKcal}
                max={selectedTarget.dailyCalories.maxKcal}
                unit="kcal"
                isCurrentDay={selectedDay === todayDay}
                partial={selectedTotals.hasMissingCoreValues}
              />
              <GoalMetric
                kind="protein"
                label="단백질"
                value={selectedTotals.proteinG}
                min={selectedTarget.proteinMinimumG}
                target={selectedTarget.proteinMinimumG}
                max={selectedTarget.proteinMinimumG}
                unit="g"
                isCurrentDay={selectedDay === todayDay}
                partial={selectedTotals.hasMissingCoreValues}
              />
            </div>

            <WeekOverview
              days={weekDays}
              selectedDay={selectedDay}
              todayDay={todayDay}
            />
          </>
        ) : (
          <div className="goal-before-start">
            현재 목표는 {latestTarget.effectiveFrom.replaceAll("-", ".")}부터
            적용됩니다. 과거 기록은 당시 목표가 있을 때만 비교합니다.
          </div>
        )}
      </section>

      {setupOpen && (
        <GoalSetupSheet
          todayDay={todayDay}
          basis={currentBasis}
          existingTarget={latestTarget}
          onOpenMetabolism={onOpenMetabolism}
          onClose={() => setSetupOpen(false)}
          onSave={async (input) => {
            await onSaveGoal(input);
            setSetupOpen(false);
          }}
        />
      )}
    </>
  );
}

function GoalMetric({
  kind,
  label,
  value,
  min,
  target,
  max,
  unit,
  isCurrentDay,
  partial
}: {
  kind: "calories" | "protein";
  label: string;
  value: number | null;
  min: number;
  target: number;
  max: number;
  unit: string;
  isCurrentDay: boolean;
  partial: boolean;
}) {
  const isProtein = kind === "protein";
  const knownValue = value ?? 0;
  const status =
    value == null
      ? "missing"
      : value >= min && (isProtein || value <= max)
      ? "within"
      : !isProtein && value > max
        ? "over"
        : isCurrentDay
          ? "remaining"
          : "under";
  const scaleMax = Math.max(max * 1.2, knownValue, 1);
  const fillPercent = Math.min(100, (knownValue / scaleMax) * 100);
  const rangeLeft = (min / scaleMax) * 100;
  const rangeWidth = isProtein
    ? Math.max(2, 100 - rangeLeft)
    : Math.max(2, ((max - min) / scaleMax) * 100);
  const remaining = Math.max(0, (isProtein ? min : target) - knownValue);
  const message =
    status === "missing"
      ? isCurrentDay
        ? "아직 기록 없음"
        : "기록 없음"
      : status === "within"
      ? isProtein
        ? "목표 달성"
        : "권장 범위 달성"
      : status === "over"
        ? `${Math.round(knownValue - max).toLocaleString("ko-KR")}${unit} 초과`
        : `${Math.round(remaining).toLocaleString("ko-KR")}${unit} ${
            status === "remaining" ? "남음" : "부족"
          }`;

  return (
    <div className={`goal-metric goal-metric--${status}`}>
      <div className="goal-metric__labels">
        <span>{label}</span>
        <strong>
          {value == null ? "미기록" : Math.round(value).toLocaleString("ko-KR")}
          {value != null && <small>{unit}</small>}
        </strong>
      </div>
      <div
        className="goal-metric__track"
        role="progressbar"
        aria-label={`${label} 목표 진행`}
        aria-valuemin={0}
        aria-valuemax={Math.round(
          Math.max(isProtein ? min : max, knownValue)
        )}
        aria-valuenow={Math.round(knownValue)}
        aria-valuetext={message}
      >
        <span
          className="goal-metric__target-zone"
          style={{
            left: `${Math.min(100, rangeLeft)}%`,
            width: `${Math.min(100 - rangeLeft, rangeWidth)}%`
          }}
        />
        <span
          className="goal-metric__fill"
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      <div className="goal-metric__footer">
        <span className="goal-metric__status">
          {status === "within" && <Check size={12} aria-hidden="true" />}
          {message}
        </span>
        <span>
          {isProtein
            ? `목표 ${Math.round(min)}g`
            : min === max
              ? `목표 ${Math.round(target).toLocaleString("ko-KR")}kcal`
            : `${Math.round(min).toLocaleString("ko-KR")}~${Math.round(
                max
              ).toLocaleString("ko-KR")}kcal`}
        </span>
      </div>
      {partial && <p>일부 음식의 영양성분이 비어 있어 실제 합계와 다를 수 있어요.</p>}
    </div>
  );
}

function WeekOverview({
  days,
  selectedDay,
  todayDay
}: {
  days: Array<{
    dayKey: string;
    totals?: DailyTotals;
    target?: GoalTargetSnapshot;
  }>;
  selectedDay: string;
  todayDay: string;
}) {
  const eligible = days.filter((day) => day.target);
  const elapsed = eligible.filter((day) => day.dayKey <= todayDay);
  const actualCalories = elapsed.reduce(
    (sum, day) => sum + (day.totals?.energyKcal ?? 0),
    0
  );
  const targetCalories = eligible.reduce(
    (sum, day) => sum + (day.target?.dailyCalories.targetKcal ?? 0),
    0
  );
  const proteinRecordedDays = elapsed.filter(
    (day) => day.totals?.proteinG != null
  );
  const proteinMet = proteinRecordedDays.filter(
    (day) =>
      (day.totals?.proteinG ?? 0) >= (day.target?.proteinMinimumG ?? Infinity)
  ).length;
  const missingElapsedDays = elapsed.filter(
    (day) => day.totals == null
  ).length;
  const partialElapsedDays = elapsed.filter(
    (day) =>
      day.totals != null &&
      (day.totals.energyKcal == null ||
        day.totals.proteinG == null ||
        day.totals.hasMissingCoreValues)
  ).length;
  const weekIsCurrent = days.some((day) => day.dayKey === todayDay);
  const calorieDifference = targetCalories - actualCalories;
  const summary =
    missingElapsedDays > 0
      ? `${missingElapsedDays}일 미기록`
      : partialElapsedDays > 0
        ? "부분 기록 포함"
      : calorieDifference >= 0
      ? `${Math.round(calorieDifference).toLocaleString("ko-KR")}kcal ${
          weekIsCurrent ? "남음" : "부족"
        }`
      : `${Math.round(Math.abs(calorieDifference)).toLocaleString(
          "ko-KR"
        )}kcal 초과`;

  return (
    <div className="goal-week">
      <div className="goal-week__heading">
        <div>
          <strong>주간 목표</strong>
          <span>칼로리는 일주일 안에서 유연하게 조절할 수 있어요.</span>
        </div>
        <b>{summary}</b>
      </div>

      <div className="goal-week__days" aria-label="요일별 칼로리와 단백질 달성">
        {days.map((day) => {
          const weekday = WEEKDAYS[parseDayKey(day.dayKey).getUTCDay()];
          const value = day.totals?.energyKcal;
          const target = day.target;
          const ratio = target && value != null
            ? Math.min(1.15, value / target.dailyCalories.targetKcal)
            : 0;
          const calorieStatus =
            !target || day.dayKey > todayDay || value == null
              ? "empty"
              : value < target.dailyCalories.minKcal
                ? "under"
                : value > target.dailyCalories.maxKcal
                  ? "over"
                  : "within";
          const proteinMet =
            Boolean(target) &&
            (day.totals?.proteinG ?? 0) >= target!.proteinMinimumG;

          return (
            <div
              className={[
                "goal-week-day",
                day.dayKey === selectedDay ? "is-selected" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              key={day.dayKey}
            >
              <span>{weekday}</span>
              <div className="goal-week-day__bar">
                <i
                  className={`is-${calorieStatus}`}
                  style={{
                    height: `${Math.max(
                      value != null && value > 0 ? 8 : 0,
                      ratio * 100
                    )}%`
                  }}
                />
              </div>
              <small
                className={proteinMet ? "is-met" : ""}
                aria-label={
                  day.dayKey > todayDay
                    ? "단백질 목표 미집계"
                    : day.totals?.proteinG == null
                      ? "단백질 기록 없음"
                      : proteinMet
                        ? "단백질 목표 달성"
                        : "단백질 목표 미달성"
                }
              />
            </div>
          );
        })}
      </div>

      <div className="goal-week__totals">
        <span>
          칼로리{" "}
          <strong>
            {Math.round(actualCalories).toLocaleString("ko-KR")} /{" "}
            {Math.round(targetCalories).toLocaleString("ko-KR")}kcal
          </strong>
        </span>
        <span>
          단백질{" "}
          <strong>
            {proteinMet}/{proteinRecordedDays.length}기록일 달성
          </strong>
        </span>
        {missingElapsedDays > 0 && <span>{missingElapsedDays}일 미기록</span>}
        {partialElapsedDays > 0 && (
          <span>{partialElapsedDays}일 부분 기록</span>
        )}
      </div>
    </div>
  );
}

function GoalSetupSheet({
  todayDay,
  basis,
  existingTarget,
  onSave,
  onClose,
  onOpenMetabolism
}: {
  todayDay: string;
  basis?: GoalBasis;
  existingTarget?: GoalTargetSnapshot;
  onSave: (input: SaveGoalInput) => void | Promise<void>;
  onClose: () => void;
  onOpenMetabolism: () => void;
}) {
  const preservedDraft = readGoalSetupDraft();
  const initialPlan =
    preservedDraft?.plan ?? existingTarget?.plan ?? defaultGoalPlan();
  const [plan, setPlan] = useState<GoalPlan>(initialPlan);
  const [tdeeKcal, setTdeeKcal] = useState(
    preservedDraft?.tdeeKcal ||
      basis?.tdeeKcal ||
      existingTarget?.tdeeKcal ||
      0
  );
  const [weightKg, setWeightKg] = useState(
    preservedDraft?.weightKg ||
      basis?.weightKg ||
      existingTarget?.weightKg ||
      0
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const recommendation = useMemo(() => {
    try {
      return calculateGoalRecommendation({ tdeeKcal, weightKg, plan });
    } catch {
      return null;
    }
  }, [plan, tdeeKcal, weightKg]);

  const cancel = useCallback(() => {
    clearGoalSetupDraft();
    onClose();
  }, [onClose]);
  const dialogRef = useDialogFocus<HTMLDivElement>(cancel);

  const updatePlan = (patch: Partial<GoalPlan>) =>
    setPlan((current) => ({ ...current, ...patch }));

  const submit = async () => {
    if (plan.targetDate && plan.targetDate <= todayDay) {
      setError("목표 날짜는 내일 이후로 선택해 주세요.");
      return;
    }
    const destinationError = validateGoalDestination({
      plan,
      currentWeightKg: weightKg,
      heightCm: basis?.heightCm,
      todayDay
    });
    if (destinationError) {
      setError(destinationError);
      return;
    }
    if (!recommendation) {
      setError("TDEE와 체중, 목표 수치를 다시 확인해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const usesAutomaticBasis =
        basis != null &&
        tdeeKcal === basis.tdeeKcal &&
        weightKg === basis.weightKg;
      await onSave({
        plan,
        recommendation,
        tdeeSource: usesAutomaticBasis ? basis.source : "manual"
      });
      clearGoalSetupDraft();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "목표를 저장하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="modal-backdrop goal-setup-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) cancel();
      }}
    >
      <div
        ref={dialogRef}
        className="bottom-sheet goal-setup-sheet"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-setup-title"
      >
        <header className="bottom-sheet__header">
          <div>
            <p className="eyebrow">오늘부터 적용</p>
            <h2 id="goal-setup-title">목표 설정</h2>
          </div>
          <button
            className="icon-button icon-button--small"
            type="button"
            aria-label="목표 설정 닫기"
            onClick={cancel}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="goal-setup-section">
          <h3>어떤 변화를 원하나요?</h3>
          <div className="goal-type-grid">
            {GOAL_TYPES.map((option) => (
              <button
                className={plan.goalType === option.value ? "is-selected" : ""}
                type="button"
                key={option.value}
                onClick={() =>
                  updatePlan({
                    goalType: option.value,
                    customDailyKcal:
                      option.value === "custom"
                        ? plan.customDailyKcal
                        : undefined,
                    customProteinMinimumG:
                      option.value === "custom"
                        ? plan.customProteinMinimumG
                        : undefined
                  })
                }
              >
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
        </div>

        {plan.goalType !== "maintenance_recomp" &&
          plan.goalType !== "custom" && (
            <div className="goal-setup-section">
              <h3>목표 속도</h3>
              <div className="goal-pace-grid">
                {PACES.map((option) => (
                  <button
                    className={plan.pace === option.value ? "is-selected" : ""}
                    type="button"
                    key={option.value}
                    onClick={() => updatePlan({ pace: option.value })}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

        <div className="goal-setup-section">
          <div className="goal-setup-section__heading">
            <h3>추천 기준</h3>
            {basis && (
              <span>
                {basis.source === "personalized" ? "학습형 TDEE" : "최근 상세 TDEE"}
              </span>
            )}
          </div>
          <div className="goal-input-grid">
            <NumberInput
              label="하루 총소모"
              unit="kcal"
              value={tdeeKcal}
              min={1200}
              max={10000}
              step={10}
              onChange={setTdeeKcal}
            />
            <NumberInput
              label="현재 체중"
              unit="kg"
              value={weightKg}
              min={30}
              max={350}
              step={0.1}
              onChange={setWeightKg}
            />
          </div>
          {!basis && (
            <button
              className="goal-metabolism-link"
              type="button"
              onClick={() => {
                saveGoalSetupDraft({ plan, tdeeKcal: 0, weightKg: 0 });
                onOpenMetabolism();
              }}
            >
              <Gauge size={15} aria-hidden="true" />
              대사량을 먼저 기록하면 자동으로 채울 수 있어요
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="goal-setup-section">
          <h3>운동과 선택 목표</h3>
          <div className="goal-input-grid">
            <NumberInput
              label="주당 근력운동"
              unit="일"
              value={plan.resistanceTrainingDaysPerWeek}
              min={0}
              max={7}
              step={1}
              integer
              onChange={(value) =>
                updatePlan({ resistanceTrainingDaysPerWeek: value })
              }
            />
            <OptionalNumberInput
              label="목표 체중"
              unit="kg"
              value={plan.targetWeightKg}
              min={30}
              max={350}
              step={0.1}
              onChange={(value) => updatePlan({ targetWeightKg: value })}
            />
          </div>
          <label className="field goal-date-field">
            <span>목표 날짜 <em>선택</em></span>
            <input
              type="date"
              min={addDays(todayDay, 1)}
              value={plan.targetDate ?? ""}
              onChange={(event) =>
                updatePlan({ targetDate: event.target.value || undefined })
              }
            />
          </label>
          {(plan.targetWeightKg || plan.targetDate) && (
            <p className="goal-destination-note">
              목표 체중·날짜는 계획 확인용이며 추천 칼로리를 자동으로 바꾸지는
              않아요. 둘 다 입력하면 무리한 변화 속도인지 확인해 드려요.
            </p>
          )}
        </div>

        {plan.goalType === "custom" && (
          <div className="goal-setup-section">
            <h3>직접 설정할 수치</h3>
            <div className="goal-input-grid">
              <NumberInput
                label="일일 칼로리"
                unit="kcal"
                value={plan.customDailyKcal ?? 0}
                min={1200}
                max={10000}
                step={10}
                onChange={(value) => updatePlan({ customDailyKcal: value })}
              />
              <OptionalNumberInput
                label="단백질 목표량"
                unit="g"
                value={plan.customProteinMinimumG}
                min={1}
                max={500}
                step={1}
                onChange={(value) =>
                  updatePlan({ customProteinMinimumG: value })
                }
              />
            </div>
          </div>
        )}

        {recommendation && (
          <div className="goal-recommendation">
            <span>
              <Sparkles size={15} aria-hidden="true" />
              추천 목표
            </span>
            <div>
              <strong>
                {recommendation.dailyCalories.minKcal ===
                recommendation.dailyCalories.maxKcal
                  ? recommendation.dailyCalories.targetKcal.toLocaleString(
                      "ko-KR"
                    )
                  : `${recommendation.dailyCalories.minKcal.toLocaleString(
                      "ko-KR"
                    )}~${recommendation.dailyCalories.maxKcal.toLocaleString(
                      "ko-KR"
                    )}`}
                <small> kcal/일</small>
              </strong>
              <strong>
                단백질 {recommendation.proteinMinimumG}
                <small> g 목표/일</small>
              </strong>
            </div>
            <p>
              주간 기준 {recommendation.weeklyCalories.targetKcal.toLocaleString(
                "ko-KR"
              )}
              kcal · 일일 수치는 추정치이며 필요하면 언제든 수정할 수 있어요.
            </p>
            {recommendation.safetyAdjusted && (
              <p className="goal-recommendation__warning">
                <AlertTriangle size={13} aria-hidden="true" />
                과도한 적자·잉여를 막는 안전 범위가 적용됐어요.
              </p>
            )}
          </div>
        )}

        {(plan.goalType === "lean_mass_gain" || plan.goalType === "bulk") &&
          plan.resistanceTrainingDaysPerWeek === 0 && (
            <p className="goal-plan-note">
              근육 증가 목표는 근력운동 계획과 함께 사용할 때 더 의미가 있어요.
            </p>
          )}

        {error && (
          <p className="goal-setup-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="primary-button goal-save-button"
          type="button"
          disabled={saving || !recommendation}
          onClick={() => void submit()}
        >
          {saving ? "저장하는 중…" : existingTarget ? "새 추천으로 적용" : "이 목표로 시작"}
        </button>
        <p className="goal-disclaimer">
          신장질환·투석 중이거나 치료 목적의 식단이 필요하면 의료진과
          상의하세요. 앱의 값은 기록을 돕기 위한 추정치입니다.
        </p>
      </div>
    </div>,
    document.body
  );
}

function NumberInput({
  label,
  unit,
  value,
  min,
  max,
  step,
  integer = false,
  onChange
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field field--number">
      <span>{label}</span>
      <span className="number-input">
        <input
          type="number"
          inputMode="decimal"
          value={value || ""}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onChange(integer ? Math.round(parsed) : parsed);
          }}
        />
        <span>{unit}</span>
      </span>
    </label>
  );
}

function OptionalNumberInput({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  unit: string;
  value?: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="field field--number">
      <span>{label} <em>선택</em></span>
      <span className="number-input">
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          min={min}
          max={max}
          step={step}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? undefined : Number(event.target.value)
            )
          }
        />
        <span>{unit}</span>
      </span>
    </label>
  );
}

function defaultGoalPlan(): GoalPlan {
  return {
    goalType: "fat_loss",
    pace: "moderate",
    resistanceTrainingDaysPerWeek: 3
  };
}

function validateGoalDestination({
  plan,
  currentWeightKg,
  heightCm,
  todayDay
}: {
  plan: GoalPlan;
  currentWeightKg: number;
  heightCm?: number;
  todayDay: string;
}): string {
  const targetWeightKg = plan.targetWeightKg;

  if (
    heightCm &&
    heightCm >= 100 &&
    heightCm <= 250 &&
    plan.goalType === "fat_loss"
  ) {
    const heightM = heightCm / 100;
    const currentBmi = currentWeightKg / heightM ** 2;
    if (currentBmi < 18.5) {
      return "현재 체중이 BMI 저체중 범위에 해당해 감량 목표를 추천할 수 없어요.";
    }
    if (targetWeightKg && targetWeightKg / heightM ** 2 < 18.5) {
      return "목표 체중이 BMI 저체중 범위에 해당해 저장할 수 없어요.";
    }
  }

  if (!targetWeightKg) return "";
  if (plan.goalType === "fat_loss" && targetWeightKg >= currentWeightKg) {
    return "감량 목표 체중은 현재 체중보다 낮게 입력해 주세요.";
  }
  if (
    (plan.goalType === "lean_mass_gain" || plan.goalType === "bulk") &&
    targetWeightKg <= currentWeightKg
  ) {
    return "증량 목표 체중은 현재 체중보다 높게 입력해 주세요.";
  }
  if (!plan.targetDate || targetWeightKg >= currentWeightKg) return "";

  const days =
    (parseDayKey(plan.targetDate).getTime() -
      parseDayKey(todayDay).getTime()) /
    86_400_000;
  const weeklyLossKg =
    ((currentWeightKg - targetWeightKg) * 7) / Math.max(1, days);
  if (weeklyLossKg > 0.9) {
    return "주 0.9kg보다 빠른 감량 계획이에요. 목표 날짜를 더 여유 있게 잡아 주세요.";
  }
  return "";
}

function weekDayKeys(dayKey: string): string[] {
  const weekday = parseDayKey(dayKey).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = addDays(dayKey, -daysSinceMonday);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function goalTypeLabel(goalType: GoalType): string {
  return GOAL_TYPES.find((option) => option.value === goalType)?.label ?? "목표";
}

interface GoalSetupDraft {
  plan: GoalPlan;
  tdeeKcal: number;
  weightKg: number;
}

function hasGoalSetupDraft(): boolean {
  return readGoalSetupDraft() != null;
}

function readGoalSetupDraft(): GoalSetupDraft | undefined {
  try {
    const raw = sessionStorage.getItem(GOAL_DRAFT_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Partial<GoalSetupDraft>;
    validateGoalPlan(value.plan as GoalPlan);
    if (
      typeof value.tdeeKcal !== "number" ||
      !Number.isFinite(value.tdeeKcal) ||
      value.tdeeKcal < 0 ||
      typeof value.weightKg !== "number" ||
      !Number.isFinite(value.weightKg) ||
      value.weightKg < 0
    ) {
      throw new Error("목표 임시 입력값이 올바르지 않습니다.");
    }
    return value as GoalSetupDraft;
  } catch {
    clearGoalSetupDraft();
    return undefined;
  }
}

function saveGoalSetupDraft(draft: GoalSetupDraft): void {
  try {
    sessionStorage.setItem(GOAL_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // The form remains usable when session storage is unavailable.
  }
}

function clearGoalSetupDraft(): void {
  try {
    sessionStorage.removeItem(GOAL_DRAFT_KEY);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}
