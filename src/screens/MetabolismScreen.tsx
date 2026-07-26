import {
  Activity,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Footprints,
  Gauge,
  Info,
  Plus,
  Save,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  Weight
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import CalendarSheet from "../components/CalendarSheet";
import {
  calculateBmr,
  calculateSimpleTdee,
  estimateDailyEnergy,
  estimatePersonalizedTdee
} from "../lib/metabolism";
import { createId } from "../lib/id";
import type {
  DailyExercise,
  DailyMetabolismEntry,
  DailyWorkActivity,
  ExerciseCategory,
  ExerciseIntensity,
  ExerciseTemplate,
  MetabolismProfile,
  SimpleActivityLevel,
  WorkActivityType,
  WorkTemplate
} from "../types";
import "../metabolism.css";

type MetabolismMode = "simple" | "detail" | "learning";

interface MetabolismScreenProps {
  selectedDay: string;
  todayDay: string;
  dateLabel: string;
  isToday: boolean;
  dietRecordDays: readonly string[];
  metabolismRecordDays: readonly string[];
  profile: MetabolismProfile | null;
  entry: DailyMetabolismEntry | null;
  history: DailyMetabolismEntry[];
  intakeByDate: Readonly<Record<string, number>>;
  isBusy?: boolean;
  onPreviousDate: () => void;
  onNextDate: () => void;
  onSelectDate: (dayKey: string) => void;
  onOpenSettings: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveProfile: (
    profile: MetabolismProfile
  ) => void | boolean | Promise<void | boolean>;
  onSaveDay: (
    profile: MetabolismProfile,
    entry: DailyMetabolismEntry
  ) => void | Promise<void>;
}

const ACTIVITY_LEVELS: Array<{
  id: SimpleActivityLevel;
  title: string;
  factor: number;
  summary: string;
}> = [
  {
    id: "sedentary",
    title: "거의 활동 없음",
    factor: 1.2,
    summary: "하루 대부분 앉아서 지내고, 별도 운동과 긴 이동이 거의 없어요."
  },
  {
    id: "light",
    title: "가벼운 활동",
    factor: 1.375,
    summary: "앉아서 일하지만 가벼운 걷기나 운동을 주 1~3회 해요."
  },
  {
    id: "moderate",
    title: "보통 활동",
    factor: 1.55,
    summary: "일상 이동이 꾸준하고, 중간 강도 운동을 주 3~5회 해요."
  },
  {
    id: "high",
    title: "높은 활동",
    factor: 1.725,
    summary: "많이 걷는 일을 하거나 강한 운동을 주 6~7회 해요."
  },
  {
    id: "very_high",
    title: "매우 높은 활동",
    factor: 1.9,
    summary: "육체노동과 고강도 운동을 병행하거나 하루 두 번 훈련해요."
  }
];

const WORK_TYPES: Array<{
  value: WorkActivityType;
  label: string;
  description: string;
}> = [
  {
    value: "seated",
    label: "주로 앉음",
    description: "사무·재택처럼 대부분 앉아서 일함"
  },
  {
    value: "standing",
    label: "앉기·서기 섞임",
    description: "서비스·교육처럼 자세를 자주 바꿈"
  },
  {
    value: "walking",
    label: "자주 걷기",
    description: "외근·영업처럼 이동과 걷기가 잦음"
  },
  {
    value: "physical",
    label: "육체 활동",
    description: "현장·운반처럼 힘쓰는 일이 많음"
  }
];

const EXERCISE_CATEGORIES: Array<{
  value: ExerciseCategory;
  label: string;
}> = [
  { value: "walking", label: "걷기" },
  { value: "running", label: "달리기" },
  { value: "cycling", label: "자전거" },
  { value: "strength", label: "근력운동" },
  { value: "swimming", label: "수영" },
  { value: "sports", label: "구기·스포츠" },
  { value: "yoga", label: "요가·필라테스" },
  { value: "other", label: "기타" }
];

const INTENSITIES: Array<{ value: ExerciseIntensity; label: string }> = [
  { value: "low", label: "가볍게" },
  { value: "moderate", label: "보통" },
  { value: "high", label: "강하게" }
];

const JOB_EXAMPLES: Array<{
  name: string;
  activityType: WorkActivityType;
  hours: number;
}> = [
  {
    name: "사무·재택",
    activityType: "seated",
    hours: 8
  },
  {
    name: "서비스·교육",
    activityType: "standing",
    hours: 8
  },
  {
    name: "외근·영업",
    activityType: "walking",
    hours: 6
  },
  {
    name: "현장·운반",
    activityType: "physical",
    hours: 8
  }
];

const EXERCISE_EXAMPLES: Array<{
  name: string;
  category: ExerciseCategory;
  intensity: ExerciseIntensity;
  durationMinutes: number;
}> = [
  {
    name: "빠르게 걷기",
    category: "walking",
    intensity: "moderate",
    durationMinutes: 30
  },
  {
    name: "달리기",
    category: "running",
    intensity: "moderate",
    durationMinutes: 30
  },
  {
    name: "자전거",
    category: "cycling",
    intensity: "moderate",
    durationMinutes: 45
  },
  {
    name: "웨이트트레이닝",
    category: "strength",
    intensity: "moderate",
    durationMinutes: 60
  },
  {
    name: "수영",
    category: "swimming",
    intensity: "moderate",
    durationMinutes: 45
  },
  {
    name: "구기 운동",
    category: "sports",
    intensity: "moderate",
    durationMinutes: 60
  }
];

export default function MetabolismScreen({
  selectedDay,
  todayDay,
  dateLabel,
  isToday,
  dietRecordDays,
  metabolismRecordDays,
  profile,
  entry,
  history,
  intakeByDate,
  isBusy = false,
  onPreviousDate,
  onNextDate,
  onSelectDate,
  onOpenSettings,
  onDirtyChange,
  onSaveProfile,
  onSaveDay
}: MetabolismScreenProps) {
  const [mode, setMode] = useState<MetabolismMode>("detail");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [entryDirty, setEntryDirty] = useState(false);
  const [heightEditorOpen, setHeightEditorOpen] = useState(
    !profile?.heightCm
  );
  const [heightDraft, setHeightDraft] = useState<number | undefined>();
  const [simpleLevel, setSimpleLevel] =
    useState<SimpleActivityLevel>("moderate");
  const [sexConfirmed, setSexConfirmed] = useState(Boolean(profile));
  const [profileDraft, setProfileDraft] = useState<MetabolismProfile>(() =>
    profile ?? emptyProfile()
  );
  const [entryDraft, setEntryDraft] = useState<DailyMetabolismEntry>(() =>
    entry ?? emptyEntry(selectedDay)
  );

  useEffect(() => {
    setProfileDraft(profile ?? emptyProfile());
    setSexConfirmed(Boolean(profile));
    setProfileDirty(false);
    setHeightEditorOpen(!profile?.heightCm);
    setHeightDraft(undefined);
  }, [profile]);

  useEffect(() => {
    setEntryDraft(entry ?? emptyEntry(selectedDay));
    setEntryDirty(false);
  }, [entry, selectedDay]);

  useEffect(() => {
    onDirtyChange?.(
      profileDirty ||
        entryDirty ||
        (Boolean(profile?.heightCm) &&
          heightEditorOpen &&
          heightDraft !== undefined)
    );
  }, [
    entryDirty,
    heightDraft,
    heightEditorOpen,
    onDirtyChange,
    profile?.heightCm,
    profileDirty
  ]);

  const changeProfileDraft = (next: MetabolismProfile) => {
    setProfileDraft(next);
    setProfileDirty(true);
  };

  const changeEntryDraft = (next: DailyMetabolismEntry) => {
    setEntryDraft(next);
    setEntryDirty(true);
  };

  const requestDiscard = (
    change: () => void,
    message: string
  ): boolean => {
    if (
      (profileDirty || entryDirty) &&
      !window.confirm(message)
    ) {
      return false;
    }
    setProfileDirty(false);
    setEntryDirty(false);
    setHeightEditorOpen(!profile?.heightCm);
    setHeightDraft(undefined);
    onDirtyChange?.(false);
    change();
    return true;
  };

  const requestDateChange = (change: () => void): boolean =>
    requestDiscard(
      change,
      "저장하지 않은 대사량 입력이 있습니다. 변경사항을 버리고 날짜를 이동할까요?"
    );

  const bmr = useMemo(() => {
    if (
      !sexConfirmed ||
      !profileDraft.birthDate ||
      profileDraft.heightCm <= 0 ||
      entryDraft.weightKg <= 0
    ) {
      return null;
    }
    try {
      return calculateBmr({
        sex: profileDraft.sex,
        birthDate: profileDraft.birthDate,
        heightCm: profileDraft.heightCm,
        weightKg: entryDraft.weightKg,
        bodyFatPercent: entryDraft.bodyFatPercent,
        asOfDate: selectedDay
      });
    } catch {
      return null;
    }
  }, [
    entryDraft.bodyFatPercent,
    entryDraft.weightKg,
    profileDraft,
    selectedDay,
    sexConfirmed
  ]);

  const dailyEstimate = useMemo(() => {
    if (!bmr) return null;
    try {
      return estimateDailyEnergy(profileDraft, entryDraft);
    } catch {
      return null;
    }
  }, [bmr, entryDraft, profileDraft]);

  const simpleEstimate = useMemo(() => {
    if (!bmr) return null;
    return calculateSimpleTdee(bmr.kcal, simpleLevel);
  }, [bmr, simpleLevel]);

  const learning = useMemo(() => {
    try {
      return estimatePersonalizedTdee(history, intakeByDate);
    } catch {
      return null;
    }
  }, [history, intakeByDate]);

  const summaryEstimate = useMemo(() => {
    if (mode === "simple") return simpleEstimate;
    if (
      mode === "learning" &&
      learning?.status === "estimated" &&
      learning.tdeeKcal !== undefined
    ) {
      return {
        bmrKcal: bmr?.kcal,
        activityKcal: bmr ? learning.tdeeKcal - bmr.kcal : undefined,
        tdeeKcal: learning.tdeeKcal
      };
    }
    return dailyEstimate;
  }, [bmr, dailyEstimate, learning, mode, simpleEstimate]);

  const saveProfileDraft = async (
    nextDraft: MetabolismProfile = profileDraft
  ): Promise<boolean> => {
    const now = new Date().toISOString();
    const nextProfile = {
      ...nextDraft,
      createdAt: nextDraft.createdAt || now,
      updatedAt: now
    };
    const result = await onSaveProfile(nextProfile);
    if (result === false) return false;

    setProfileDraft(nextProfile);
    setProfileDirty(false);
    return true;
  };

  const saveHeightDraft = async (): Promise<void> => {
    if (
      heightDraft === undefined ||
      !Number.isFinite(heightDraft) ||
      heightDraft < 100 ||
      heightDraft > 230
    ) {
      return;
    }

    const saved = await saveProfileDraft({
      ...profileDraft,
      heightCm: heightDraft
    });
    if (!saved) return;

    setHeightDraft(undefined);
    setHeightEditorOpen(false);
  };

  const saveEntryDraft = async () => {
    if (!sexConfirmed || !bmr) return;
    const now = new Date().toISOString();
    await onSaveDay(
      {
        ...profileDraft,
        createdAt: profileDraft.createdAt || now,
        updatedAt: now
      },
      {
        ...entryDraft,
        id: selectedDay,
        date: selectedDay,
        createdAt: entryDraft.createdAt || now,
        updatedAt: now
      }
    );
  };

  return (
    <main className="screen metabolism-screen">
      <header className="topbar">
        <div>
          <p className="eyebrow">하루 에너지 사용 기록</p>
          <h1>대사량</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="설정 열기"
          onClick={() =>
            requestDiscard(
              onOpenSettings,
              "저장하지 않은 대사량 입력이 있습니다. 변경사항을 버리고 설정으로 이동할까요?"
            )
          }
        >
          <Settings size={21} aria-hidden="true" />
        </button>
      </header>

      <section className="date-navigation" aria-label="대사량 기록 날짜 선택">
        <button
          className="icon-button icon-button--ghost"
          type="button"
          aria-label="이전 날짜"
          onClick={() => requestDateChange(onPreviousDate)}
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <button
          className="date-navigation__label"
          type="button"
          aria-label={`${dateLabel}, 달력 열기`}
          onClick={() => setCalendarOpen(true)}
        >
          <span>{dateLabel}</span>
          <small>
            <CalendarDays size={12} aria-hidden="true" />
            달력에서 찾기
          </small>
        </button>
        <button
          className="icon-button icon-button--ghost"
          type="button"
          aria-label="다음 날짜"
          disabled={isToday}
          onClick={() => requestDateChange(onNextDate)}
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </section>

      <EnergySummary
        bmrKcal={bmr?.kcal}
        activityKcal={summaryEstimate?.activityKcal}
        tdeeKcal={summaryEstimate?.tdeeKcal}
      />

      <div className="metabolism-screen__body">
        <ProfileCard
          profile={profileDraft}
          hasSavedHeight={Boolean(profile?.heightCm)}
          bmr={bmr}
          sexConfirmed={sexConfirmed}
          bodyFatPercent={entryDraft.bodyFatPercent}
          isBusy={isBusy}
          heightEditorOpen={heightEditorOpen}
          heightDraft={heightDraft}
          onChange={changeProfileDraft}
          onConfirmSex={(sex) => {
            setSexConfirmed(true);
            setProfileDraft((current) => ({ ...current, sex }));
            setProfileDirty(true);
          }}
          onBeginHeightEdit={() => {
            setHeightDraft(undefined);
            setHeightEditorOpen(true);
          }}
          onCancelHeightEdit={() => {
            setHeightDraft(undefined);
            setHeightEditorOpen(false);
          }}
          onHeightDraftChange={setHeightDraft}
          onSaveHeight={() => void saveHeightDraft()}
          onSave={() => void saveProfileDraft()}
        />

        <nav className="metabolism-tabs" aria-label="대사량 계산 방식" role="tablist">
          <ModeTab
            active={mode === "simple"}
            icon={<Gauge size={17} aria-hidden="true" />}
            label="간편 추정"
            onClick={() => setMode("simple")}
          />
          <ModeTab
            active={mode === "detail"}
            icon={<Activity size={17} aria-hidden="true" />}
            label="오늘 상세"
            onClick={() => setMode("detail")}
          />
          <ModeTab
            active={mode === "learning"}
            icon={<Sparkles size={17} aria-hidden="true" />}
            label="개인화 학습"
            onClick={() => setMode("learning")}
          />
        </nav>

        {mode === "simple" && (
          <SimplePanel
            level={simpleLevel}
            estimate={simpleEstimate}
            hasBmr={Boolean(bmr)}
            onChange={setSimpleLevel}
            onOpenDetail={() => setMode("detail")}
          />
        )}

        {mode === "detail" && (
          <DetailPanel
            profile={profileDraft}
            entry={entryDraft}
            estimate={dailyEstimate}
            isBusy={isBusy}
            onProfileChange={changeProfileDraft}
            onEntryChange={changeEntryDraft}
            onSaveProfile={() => void saveProfileDraft()}
            onSaveEntry={() => void saveEntryDraft()}
          />
        )}

        {mode === "learning" && (
          <LearningPanel
            learning={learning}
            entry={entryDraft}
            isBusy={isBusy}
            canSave={Boolean(bmr)}
            onEntryChange={changeEntryDraft}
            onSaveEntry={() => void saveEntryDraft()}
          />
        )}
      </div>

      {calendarOpen && (
        <CalendarSheet
          selectedDay={selectedDay}
          todayDay={todayDay}
          dietRecordDays={dietRecordDays}
          metabolismRecordDays={metabolismRecordDays}
          onSelectDay={(dayKey) =>
            dayKey === selectedDay
              ? true
              : requestDateChange(() => onSelectDate(dayKey))
          }
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </main>
  );
}

function EnergySummary({
  bmrKcal,
  activityKcal,
  tdeeKcal
}: {
  bmrKcal?: number;
  activityKcal?: number;
  tdeeKcal?: number;
}) {
  return (
    <section className="metabolism-summary" aria-label="오늘의 대사량 요약">
      <div>
        <span>BMR</span>
        <strong>{formatEnergy(bmrKcal)}</strong>
        <small>기초대사량</small>
      </div>
      <div>
        <span>활동</span>
        <strong>{formatEnergy(activityKcal)}</strong>
        <small>추가 소모</small>
      </div>
      <div className="metabolism-summary__total">
        <span>TDEE</span>
        <strong>{formatEnergy(tdeeKcal)}</strong>
        <small>하루 총소모</small>
      </div>
    </section>
  );
}

function ProfileCard({
  profile,
  hasSavedHeight,
  bmr,
  sexConfirmed,
  bodyFatPercent,
  isBusy,
  heightEditorOpen,
  heightDraft,
  onChange,
  onConfirmSex,
  onBeginHeightEdit,
  onCancelHeightEdit,
  onHeightDraftChange,
  onSaveHeight,
  onSave
}: {
  profile: MetabolismProfile;
  hasSavedHeight: boolean;
  bmr: ReturnType<typeof calculateBmr> | null;
  sexConfirmed: boolean;
  bodyFatPercent?: number;
  isBusy: boolean;
  heightEditorOpen: boolean;
  heightDraft?: number;
  onChange: (profile: MetabolismProfile) => void;
  onConfirmSex: (sex: MetabolismProfile["sex"]) => void;
  onBeginHeightEdit: () => void;
  onCancelHeightEdit: () => void;
  onHeightDraftChange: (heightCm: number | undefined) => void;
  onSaveHeight: () => void;
  onSave: () => void;
}) {
  const [isOpen, setIsOpen] = useState(!bmr);

  return (
    <details
      className="metabolism-card metabolism-profile"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="metabolism-card__icon">
          <UserRound size={19} aria-hidden="true" />
        </span>
        <span>
          <strong>내 기본 정보</strong>
          <small>
            {bmr
              ? `${bmr.ageYears}세 · 신장 입력 완료 · ${bmrMethodLabel(bmr.method)}`
              : hasSavedHeight
                ? "신장 입력 완료 · 체중 입력 후 BMR을 계산해요"
                : "성별·생년월일·신장을 먼저 입력해 주세요"}
          </small>
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>

      <div className="metabolism-profile__content">
        <fieldset className="segmented-field">
          <legend>계산 기준 성별</legend>
          <div>
            <button
              className={
                sexConfirmed && profile.sex === "male" ? "is-selected" : ""
              }
              type="button"
              aria-pressed={sexConfirmed && profile.sex === "male"}
              onClick={() => onConfirmSex("male")}
            >
              남성
            </button>
            <button
              className={
                sexConfirmed && profile.sex === "female" ? "is-selected" : ""
              }
              type="button"
              aria-pressed={sexConfirmed && profile.sex === "female"}
              onClick={() => onConfirmSex("female")}
            >
              여성
            </button>
          </div>
        </fieldset>

        <div className="metabolism-field-grid">
          <label className="field">
            <span>생년월일</span>
            <input
              type="date"
              value={profile.birthDate}
              max={localTodayValue()}
              aria-label="생년월일"
              onChange={(event) =>
                onChange({ ...profile, birthDate: event.target.value })
              }
            />
          </label>
          {!hasSavedHeight ? (
            <NumberField
              label="신장"
              unit="cm"
              value={profile.heightCm}
              min={100}
              max={230}
              step={0.1}
              onChange={(heightCm) => onChange({ ...profile, heightCm })}
            />
          ) : heightEditorOpen ? (
            <div className="height-editor">
              <label className="field field--number">
                <span>새 신장</span>
                <span className="number-input">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={heightDraft ?? ""}
                    min={100}
                    max={230}
                    step={0.1}
                    autoComplete="off"
                    aria-label="새 신장 (cm)"
                    onChange={(event) =>
                      onHeightDraftChange(
                        event.target.value === ""
                          ? undefined
                          : Number(event.target.value)
                      )
                    }
                  />
                  <span>cm</span>
                </span>
              </label>
              <div className="height-editor__actions">
                <button
                  className="text-button text-button--muted"
                  type="button"
                  onClick={onCancelHeightEdit}
                >
                  취소
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={
                    isBusy ||
                    heightDraft === undefined ||
                    heightDraft < 100 ||
                    heightDraft > 230
                  }
                  onClick={onSaveHeight}
                >
                  신장 변경 저장
                </button>
              </div>
            </div>
          ) : (
            <div className="saved-height" role="status">
              <span>
                <strong>신장 입력 완료</strong>
                <small>저장된 수치는 평소 화면에 표시하지 않아요.</small>
              </span>
              <button
                className="secondary-button"
                type="button"
                onClick={onBeginHeightEdit}
              >
                신장 변경
              </button>
            </div>
          )}
        </div>

        <div className="formula-note">
          <Info size={16} aria-hidden="true" />
          <p>
            체지방률이 있으면 <strong>370 + 21.6 × 제지방량</strong>을,
            없으면 성별·나이·신장·체중을 이용한 공식을 적용해요.
            {bodyFatPercent != null && bmr?.leanBodyMassKg != null && (
              <>
                {" "}
                현재 제지방량은 약 <strong>{round(bmr.leanBodyMassKg, 1)}kg</strong>
                이에요.
              </>
            )}
          </p>
        </div>

        <button
          className="secondary-button metabolism-save-button"
          type="button"
          disabled={
            isBusy ||
            !sexConfirmed ||
            !profile.birthDate ||
            profile.heightCm <= 0 ||
            (hasSavedHeight && heightEditorOpen)
          }
          onClick={onSave}
        >
          <Save size={17} aria-hidden="true" />
          기본 정보 저장
        </button>
      </div>
    </details>
  );
}

function ModeTab({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "is-selected" : ""}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SimplePanel({
  level,
  estimate,
  hasBmr,
  onChange,
  onOpenDetail
}: {
  level: SimpleActivityLevel;
  estimate: ReturnType<typeof calculateSimpleTdee> | null;
  hasBmr: boolean;
  onChange: (level: SimpleActivityLevel) => void;
  onOpenDetail: () => void;
}) {
  return (
    <section className="metabolism-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">빠르게 평균을 보고 싶을 때</p>
          <h2>평소 생활과 가장 가까운 항목</h2>
        </div>
        <Gauge size={21} aria-hidden="true" />
      </div>

      <div className="activity-level-list">
        {ACTIVITY_LEVELS.map((item) => (
          <button
            className={level === item.id ? "is-selected" : ""}
            type="button"
            aria-pressed={level === item.id}
            key={item.id}
            onClick={() => onChange(item.id)}
          >
            <span className="activity-level-list__radio" aria-hidden="true" />
            <span>
              <strong>{item.title}</strong>
              <small>{item.summary}</small>
            </span>
            <b>× {item.factor}</b>
          </button>
        ))}
      </div>

      <div className="instant-result" aria-live="polite">
        <span>간편 추정 TDEE</span>
        <strong>
          {hasBmr ? formatEnergy(estimate?.tdeeKcal) : "기본 정보와 체중 필요"}
        </strong>
        <small>
          BMR × 선택한 활동계수로 계산한 평소 하루 평균이에요. 오늘의 실제
          이동과 운동은 ‘오늘 상세’에서 더 세밀하게 반영할 수 있어요.
        </small>
        {!hasBmr && (
          <button type="button" onClick={onOpenDetail}>
            오늘 상세에서 체중 입력하기
          </button>
        )}
      </div>
    </section>
  );
}

function DetailPanel({
  profile,
  entry,
  estimate,
  isBusy,
  onProfileChange,
  onEntryChange,
  onSaveProfile,
  onSaveEntry
}: {
  profile: MetabolismProfile;
  entry: DailyMetabolismEntry;
  estimate: ReturnType<typeof estimateDailyEnergy> | null;
  isBusy: boolean;
  onProfileChange: (profile: MetabolismProfile) => void;
  onEntryChange: (entry: DailyMetabolismEntry) => void;
  onSaveProfile: () => void;
  onSaveEntry: () => void;
}) {
  return (
    <section className="metabolism-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">오늘 실제로 한 만큼</p>
          <h2>체중과 활동 기록</h2>
        </div>
        <Activity size={21} aria-hidden="true" />
      </div>

      <div className="metabolism-subcard">
        <div className="subcard-heading">
          <span className="subcard-heading__icon">
            <Weight size={18} aria-hidden="true" />
          </span>
          <div>
            <h3>오늘 아침 측정</h3>
            <p>가능하면 기상 후 같은 조건에서 기록해 주세요.</p>
          </div>
        </div>
        <div className="metabolism-field-grid metabolism-field-grid--three">
          <NumberField
            label="체중"
            unit="kg"
            value={entry.weightKg}
            min={30}
            max={350}
            step={0.1}
            onChange={(weightKg) => onEntryChange({ ...entry, weightKg })}
          />
          <OptionalNumberField
            label="체지방률"
            unit="%"
            value={entry.bodyFatPercent}
            min={2}
            max={75}
            step={0.1}
            onChange={(bodyFatPercent) =>
              onEntryChange({ ...entry, bodyFatPercent })
            }
          />
          <OptionalNumberField
            label="오늘 걸음 수"
            unit="보"
            value={entry.steps}
            min={0}
            max={100000}
            step={100}
            onChange={(steps) => onEntryChange({ ...entry, steps })}
          />
        </div>
      </div>

      <WorkToday
        templates={profile.jobTemplates}
        activities={entry.jobActivities}
        onChange={(jobActivities) => onEntryChange({ ...entry, jobActivities })}
      />

      <ExerciseToday
        templates={profile.exerciseTemplates}
        exercises={entry.exercises}
        onChange={(exercises) => onEntryChange({ ...entry, exercises })}
      />

      <TemplateManager
        profile={profile}
        isBusy={isBusy}
        onChange={onProfileChange}
        onSave={onSaveProfile}
      />

      <EstimateExplanation estimate={estimate} entry={entry} />

      <label className="completion-toggle">
        <input
          type="checkbox"
          checked={entry.dietComplete}
          onChange={(event) =>
            onEntryChange({ ...entry, dietComplete: event.target.checked })
          }
        />
        <span>
          <CalendarCheck size={20} aria-hidden="true" />
          <span>
            <strong>오늘 식단 기록 완료</strong>
            <small>하루 섭취량이 모두 기록됐다면 켜 주세요. 개인화 학습에 사용해요.</small>
          </span>
        </span>
      </label>

      <button
        className="primary-button primary-button--full"
        type="button"
        disabled={isBusy || !estimate}
        onClick={onSaveEntry}
      >
        <Save size={18} aria-hidden="true" />
        오늘 대사량 기록 저장
      </button>
    </section>
  );
}

function WorkToday({
  templates,
  activities,
  onChange
}: {
  templates: WorkTemplate[];
  activities: DailyWorkActivity[];
  onChange: (activities: DailyWorkActivity[]) => void;
}) {
  const addTemplate = (template: WorkTemplate) => {
    onChange([
      ...activities,
      {
        id: createId("work"),
        templateId: template.id,
        name: template.name,
        activityType: template.activityType,
        hours: template.defaultHours
      }
    ]);
  };
  const addExample = (example: (typeof JOB_EXAMPLES)[number]) => {
    onChange([
      ...activities,
      {
        id: createId("work"),
        name: example.name,
        activityType: example.activityType,
        hours: example.hours
      }
    ]);
  };
  const totalHours = activities.reduce(
    (sum, activity) => sum + activity.hours,
    0
  );

  return (
    <div className="metabolism-subcard">
      <div className="subcard-heading">
        <span className="subcard-heading__icon">
          <BriefcaseBusiness size={18} aria-hidden="true" />
        </span>
        <div>
          <h3>오늘의 직업 활동</h3>
          <p>같은 날 서로 다른 업무를 했다면 각각 실제 시간만큼 추가하세요.</p>
        </div>
      </div>

      {templates.length > 0 && (
        <>
          <p className="quick-add-label">내 직업 템플릿</p>
          <div className="quick-add-row" aria-label="저장한 직업 템플릿으로 추가">
            {templates.map((template) => (
              <button
                type="button"
                key={template.id}
                onClick={() => addTemplate(template)}
              >
                <Plus size={14} aria-hidden="true" />
                {template.name}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="quick-add-label">일반적인 직업 예시</p>
      <div className="quick-add-row" aria-label="일반적인 직업 예시로 추가">
        {JOB_EXAMPLES.map((example) => (
          <button
            type="button"
            key={example.name}
            onClick={() => addExample(example)}
          >
            <Plus size={14} aria-hidden="true" />
            {example.name}
          </button>
        ))}
      </div>

      <div className="today-activity-list">
        {activities.map((activity) => (
          <div className="today-activity" key={activity.id}>
            <div className="today-activity__heading">
              <label className="field">
                <span>활동 이름</span>
                <input
                  value={activity.name}
                  aria-label="오늘 직업 활동 이름"
                  onChange={(event) =>
                    onChange(
                      activities.map((item) =>
                        item.id === activity.id
                          ? { ...item, name: event.target.value }
                          : item
                      )
                    )
                  }
                />
              </label>
              <button
                className="icon-button icon-button--small icon-button--danger"
                type="button"
                aria-label={`${activity.name || "직업 활동"} 삭제`}
                onClick={() =>
                  onChange(activities.filter((item) => item.id !== activity.id))
                }
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="metabolism-field-grid">
              <label className="field">
                <span>활동 형태</span>
                <select
                  value={activity.activityType}
                  aria-label={`${activity.name} 활동 형태`}
                  onChange={(event) =>
                    onChange(
                      activities.map((item) =>
                        item.id === activity.id
                          ? {
                              ...item,
                              activityType: event.target.value as WorkActivityType
                            }
                          : item
                      )
                    )
                  }
                >
                  {WORK_TYPES.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="오늘 시간"
                unit="시간"
                value={activity.hours}
                min={0.25}
                max={24}
                step={0.25}
                onChange={(hours) =>
                  onChange(
                    activities.map((item) =>
                      item.id === activity.id ? { ...item, hours } : item
                    )
                  )
                }
              />
            </div>
          </div>
        ))}
      </div>

      {activities.length > 0 && (
        <p
          className={`activity-total ${
            totalHours > 24 ? "activity-total--error" : ""
          }`}
          role={totalHours > 24 ? "alert" : undefined}
        >
          오늘 직업 활동 합계 {round(totalHours, 2)}시간
          {totalHours > 24 && " · 24시간 이하로 조정해 주세요"}
        </p>
      )}

      <button
        className="secondary-button secondary-button--dashed"
        type="button"
        onClick={() =>
          onChange([
            ...activities,
            {
              id: createId("work"),
              name: "오늘의 활동",
              activityType: "standing",
              hours: 1
            }
          ])
        }
      >
        <Plus size={17} aria-hidden="true" />
        직업 활동 직접 추가
      </button>
    </div>
  );
}

function ExerciseToday({
  templates,
  exercises,
  onChange
}: {
  templates: ExerciseTemplate[];
  exercises: DailyExercise[];
  onChange: (exercises: DailyExercise[]) => void;
}) {
  const addTemplate = (template: ExerciseTemplate) => {
    onChange([
      ...exercises,
      {
        id: createId("exercise"),
        templateId: template.id,
        name: template.name,
        category: template.category,
        intensity: template.intensity,
        durationMinutes: template.defaultDurationMinutes
      }
    ]);
  };
  const addExample = (example: (typeof EXERCISE_EXAMPLES)[number]) => {
    onChange([
      ...exercises,
      {
        id: createId("exercise"),
        name: example.name,
        category: example.category,
        intensity: example.intensity,
        durationMinutes: example.durationMinutes
      }
    ]);
  };

  return (
    <div className="metabolism-subcard">
      <div className="subcard-heading">
        <span className="subcard-heading__icon">
          <Dumbbell size={18} aria-hidden="true" />
        </span>
        <div>
          <h3>오늘 실제 운동</h3>
          <p>주간 계획이 아니라 오늘 완료한 운동만 추가해요.</p>
        </div>
      </div>

      {templates.length > 0 && (
        <>
          <p className="quick-add-label">내 운동 템플릿</p>
          <div className="quick-add-row" aria-label="저장한 운동 템플릿으로 추가">
            {templates.map((template) => (
              <button
                type="button"
                key={template.id}
                onClick={() => addTemplate(template)}
              >
                <Plus size={14} aria-hidden="true" />
                {template.name}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="quick-add-label">일반적인 운동 예시</p>
      <div className="quick-add-row" aria-label="일반적인 운동 예시로 추가">
        {EXERCISE_EXAMPLES.map((example) => (
          <button
            type="button"
            key={example.name}
            onClick={() => addExample(example)}
          >
            <Plus size={14} aria-hidden="true" />
            {example.name}
          </button>
        ))}
      </div>

      <div className="today-activity-list">
        {exercises.map((exercise) => (
          <div className="today-activity" key={exercise.id}>
            <div className="today-activity__heading">
              <label className="field">
                <span>운동 이름</span>
                <input
                  value={exercise.name}
                  aria-label="오늘 운동 이름"
                  onChange={(event) =>
                    onChange(
                      exercises.map((item) =>
                        item.id === exercise.id
                          ? { ...item, name: event.target.value }
                          : item
                      )
                    )
                  }
                />
              </label>
              <button
                className="icon-button icon-button--small icon-button--danger"
                type="button"
                aria-label={`${exercise.name || "운동"} 삭제`}
                onClick={() =>
                  onChange(exercises.filter((item) => item.id !== exercise.id))
                }
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="metabolism-field-grid metabolism-field-grid--three">
              <label className="field">
                <span>종류</span>
                <select
                  value={exercise.category}
                  aria-label={`${exercise.name} 운동 종류`}
                  onChange={(event) =>
                    onChange(
                      exercises.map((item) =>
                        item.id === exercise.id
                          ? {
                              ...item,
                              category: event.target.value as ExerciseCategory
                            }
                          : item
                      )
                    )
                  }
                >
                  {EXERCISE_CATEGORIES.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>강도</span>
                <select
                  value={exercise.intensity}
                  aria-label={`${exercise.name} 운동 강도`}
                  onChange={(event) =>
                    onChange(
                      exercises.map((item) =>
                        item.id === exercise.id
                          ? {
                              ...item,
                              intensity: event.target.value as ExerciseIntensity
                            }
                          : item
                      )
                    )
                  }
                >
                  {INTENSITIES.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="오늘 시간"
                unit="분"
                value={exercise.durationMinutes}
                min={1}
                max={600}
                step={5}
                onChange={(durationMinutes) =>
                  onChange(
                    exercises.map((item) =>
                      item.id === exercise.id
                        ? { ...item, durationMinutes }
                        : item
                    )
                  )
                }
              />
            </div>
          </div>
        ))}
      </div>

      <button
        className="secondary-button secondary-button--dashed"
        type="button"
        onClick={() =>
          onChange([
            ...exercises,
            {
              id: createId("exercise"),
              name: "오늘의 운동",
              category: "other",
              intensity: "moderate",
              durationMinutes: 30
            }
          ])
        }
      >
        <Plus size={17} aria-hidden="true" />
        운동 직접 추가
      </button>
    </div>
  );
}

function TemplateManager({
  profile,
  isBusy,
  onChange,
  onSave
}: {
  profile: MetabolismProfile;
  isBusy: boolean;
  onChange: (profile: MetabolismProfile) => void;
  onSave: () => void;
}) {
  return (
    <details className="template-manager">
      <summary>
        <span>
          <strong>자주 쓰는 직업·운동 관리</strong>
          <small>한 번 저장하면 오늘 기록에서 버튼으로 바로 추가할 수 있어요.</small>
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>

      <div className="template-manager__body">
        <div className="template-section">
          <div className="template-section__heading">
            <div>
              <h3>직업 템플릿</h3>
              <p>요일마다 직업이 달라도 템플릿을 여러 개 저장할 수 있어요.</p>
            </div>
            <BriefcaseBusiness size={18} aria-hidden="true" />
          </div>

          <div className="template-list">
            {profile.jobTemplates.map((template) => (
              <WorkTemplateEditor
                template={template}
                key={template.id}
                onChange={(next) =>
                  onChange({
                    ...profile,
                    jobTemplates: profile.jobTemplates.map((item) =>
                      item.id === next.id ? next : item
                    )
                  })
                }
                onDelete={() =>
                  onChange({
                    ...profile,
                    jobTemplates: profile.jobTemplates.filter(
                      (item) => item.id !== template.id
                    )
                  })
                }
              />
            ))}
          </div>

          <button
            className="secondary-button secondary-button--dashed"
            type="button"
            onClick={() =>
              onChange({
                ...profile,
                jobTemplates: [
                  ...profile.jobTemplates,
                  {
                    id: createId("job-template"),
                    name: "새 직업",
                    activityType: "seated",
                    defaultHours: 8
                  }
                ]
              })
            }
          >
            <Plus size={17} aria-hidden="true" />
            직업 템플릿 추가
          </button>
        </div>

        <div className="template-section">
          <div className="template-section__heading">
            <div>
              <h3>운동 템플릿</h3>
              <p>종류·강도·기본 시간과 평소 주당 횟수를 저장해요.</p>
            </div>
            <Dumbbell size={18} aria-hidden="true" />
          </div>

          <div className="template-list">
            {profile.exerciseTemplates.map((template) => (
              <ExerciseTemplateEditor
                template={template}
                key={template.id}
                onChange={(next) =>
                  onChange({
                    ...profile,
                    exerciseTemplates: profile.exerciseTemplates.map((item) =>
                      item.id === next.id ? next : item
                    )
                  })
                }
                onDelete={() =>
                  onChange({
                    ...profile,
                    exerciseTemplates: profile.exerciseTemplates.filter(
                      (item) => item.id !== template.id
                    )
                  })
                }
              />
            ))}
          </div>

          <button
            className="secondary-button secondary-button--dashed"
            type="button"
            onClick={() =>
              onChange({
                ...profile,
                exerciseTemplates: [
                  ...profile.exerciseTemplates,
                  {
                    id: createId("exercise-template"),
                    name: "새 운동",
                    category: "strength",
                    intensity: "moderate",
                    defaultDurationMinutes: 60,
                    weeklyFrequency: 3
                  }
                ]
              })
            }
          >
            <Plus size={17} aria-hidden="true" />
            운동 템플릿 추가
          </button>
        </div>

        <button
          className="secondary-button metabolism-save-button"
          type="button"
          disabled={isBusy}
          onClick={onSave}
        >
          <Save size={17} aria-hidden="true" />
          템플릿 저장
        </button>
      </div>
    </details>
  );
}

function WorkTemplateEditor({
  template,
  onChange,
  onDelete
}: {
  template: WorkTemplate;
  onChange: (template: WorkTemplate) => void;
  onDelete: () => void;
}) {
  return (
    <div className="template-edit-card">
      <div className="template-edit-card__top">
        <label className="field">
          <span>직업 이름</span>
          <input
            value={template.name}
            aria-label="직업 템플릿 이름"
            onChange={(event) => onChange({ ...template, name: event.target.value })}
          />
        </label>
        <button
          className="icon-button icon-button--small icon-button--danger"
          type="button"
          aria-label={`${template.name} 템플릿 삭제`}
          onClick={onDelete}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="metabolism-field-grid">
        <label className="field">
          <span>기본 활동 형태</span>
          <select
            value={template.activityType}
            onChange={(event) =>
              onChange({
                ...template,
                activityType: event.target.value as WorkActivityType
              })
            }
          >
            {WORK_TYPES.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label} · {option.description}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="기본 시간"
          unit="시간"
          value={template.defaultHours}
          min={0.25}
          max={24}
          step={0.25}
          onChange={(defaultHours) => onChange({ ...template, defaultHours })}
        />
      </div>
    </div>
  );
}

function ExerciseTemplateEditor({
  template,
  onChange,
  onDelete
}: {
  template: ExerciseTemplate;
  onChange: (template: ExerciseTemplate) => void;
  onDelete: () => void;
}) {
  return (
    <div className="template-edit-card">
      <div className="template-edit-card__top">
        <label className="field">
          <span>운동 이름</span>
          <input
            value={template.name}
            aria-label="운동 템플릿 이름"
            onChange={(event) => onChange({ ...template, name: event.target.value })}
          />
        </label>
        <button
          className="icon-button icon-button--small icon-button--danger"
          type="button"
          aria-label={`${template.name} 템플릿 삭제`}
          onClick={onDelete}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="metabolism-field-grid metabolism-field-grid--template">
        <label className="field">
          <span>종류</span>
          <select
            value={template.category}
            onChange={(event) =>
              onChange({
                ...template,
                category: event.target.value as ExerciseCategory
              })
            }
          >
            {EXERCISE_CATEGORIES.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>강도</span>
          <select
            value={template.intensity}
            onChange={(event) =>
              onChange({
                ...template,
                intensity: event.target.value as ExerciseIntensity
              })
            }
          >
            {INTENSITIES.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="기본 시간"
          unit="분"
          value={template.defaultDurationMinutes}
          min={1}
          max={600}
          step={5}
          onChange={(defaultDurationMinutes) =>
            onChange({ ...template, defaultDurationMinutes })
          }
        />
        <NumberField
          label="평소 횟수"
          unit="회/주"
          value={template.weeklyFrequency}
          min={0}
          max={14}
          step={1}
          onChange={(weeklyFrequency) =>
            onChange({ ...template, weeklyFrequency })
          }
        />
      </div>
    </div>
  );
}

function EstimateExplanation({
  estimate,
  entry
}: {
  estimate: ReturnType<typeof estimateDailyEnergy> | null;
  entry: DailyMetabolismEntry;
}) {
  return (
    <div className="estimate-card" aria-live="polite">
      <div className="estimate-card__heading">
        <div>
          <span>오늘 상세 추정</span>
          <strong>{formatEnergy(estimate?.tdeeKcal)}</strong>
        </div>
        {estimate && <b>활동계수 {round(estimate.pal, 2)}</b>}
      </div>
      {estimate ? (
        <>
          <div className="estimate-bar" aria-hidden="true">
            <span
              style={{
                width: `${Math.min(
                  100,
                  Math.max(8, (estimate.bmrKcal / estimate.tdeeKcal) * 100)
                )}%`
              }}
            />
          </div>
          <p>
            BMR {formatEnergy(estimate.bmrKcal)}에 활동 추가 소모{" "}
            {formatEnergy(estimate.activityKcal)}를 더했어요.
          </p>
          <ul>
            {entry.jobActivities.map((activity) => (
              <li key={activity.id}>
                {activity.name} {round(activity.hours, 1)}시간 ·{" "}
                {workTypeLabel(activity.activityType)}
              </li>
            ))}
            {entry.steps != null && entry.steps > 0 && (
              <li>오늘 걸음 수 {Math.round(entry.steps).toLocaleString("ko-KR")}보</li>
            )}
            {entry.exercises.map((exercise) => (
              <li key={exercise.id}>
                {exercise.name} {exercise.durationMinutes}분 ·{" "}
                {intensityLabel(exercise.intensity)}
              </li>
            ))}
            {entry.jobActivities.length === 0 &&
              !entry.steps &&
              entry.exercises.length === 0 && (
                <li>활동을 추가하면 계산 근거가 여기에 표시돼요.</li>
              )}
          </ul>
        </>
      ) : (
        <p>기본 정보와 오늘 체중을 입력하면 바로 계산해 드려요.</p>
      )}
      <small className="estimate-card__notice">
        활동 소모량은 입력 자료를 바탕으로 한 추정값이며 의료적 측정값이 아니에요.
      </small>
    </div>
  );
}

function LearningPanel({
  learning,
  entry,
  isBusy,
  canSave,
  onEntryChange,
  onSaveEntry
}: {
  learning: ReturnType<typeof estimatePersonalizedTdee> | null;
  entry: DailyMetabolismEntry;
  isBusy: boolean;
  canSave: boolean;
  onEntryChange: (entry: DailyMetabolismEntry) => void;
  onSaveEntry: () => void;
}) {
  const validDays = learning?.validIntakeDays ?? 0;
  const firstGoal = Math.min(14, validDays);
  const fullGoal = Math.min(28, validDays);
  const confidence =
    learning?.status === "estimated"
      ? learning.confidence === "high"
        ? "높음"
        : learning.confidence === "medium"
          ? "보통"
          : "낮음"
      : "자료 모으는 중";

  return (
    <section className="metabolism-panel learning-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">내 실제 변화로 보정</p>
          <h2>개인화 TDEE 학습</h2>
        </div>
        <Sparkles size={21} aria-hidden="true" />
      </div>

      <div className="learning-hero">
        <span className="learning-hero__icon">
          <Sparkles size={22} aria-hidden="true" />
        </span>
        <p>현재 개인화 추정 범위</p>
        <strong>{personalizedRange(learning)}</strong>
        <div>
          <span>신뢰도</span>
          <b>{confidence}</b>
        </div>
        <small>
          아침 체중과 완성된 식단 기록이 함께 있는 날만 학습에 사용해요.
        </small>
      </div>

      {learning?.status === "estimated" ? (
        <dl className="learning-details">
          <div>
            <dt>평균 섭취</dt>
            <dd>{formatEnergy(learning.averageIntakeKcal)}</dd>
          </div>
          <div>
            <dt>주간 체중 추세</dt>
            <dd>{formatWeightTrend(learning.weightTrendKgPerWeek)}</dd>
          </div>
          <div>
            <dt>학습 기간</dt>
            <dd>{learning.windowDays}일</dd>
          </div>
        </dl>
      ) : learning?.reason ? (
        <div className="learning-guidance">
          <Info size={16} aria-hidden="true" />
          <p>{learning.reason}</p>
        </div>
      ) : null}

      <div className="learning-progress-list">
        <ProgressCard
          label="첫 추정"
          value={firstGoal}
          goal={14}
          description="14일이 모이면 체중 흐름과 섭취량을 처음 비교해요."
        />
        <ProgressCard
          label="안정적인 추정"
          value={fullGoal}
          goal={28}
          description="28일 이상이면 단기 체중 변동의 영향을 더 줄일 수 있어요."
        />
      </div>

      <div className="learning-today">
        <h3>오늘 학습 자료 채우기</h3>
        <div className="metabolism-field-grid">
          <NumberField
            label="아침 체중"
            unit="kg"
            value={entry.weightKg}
            min={30}
            max={350}
            step={0.1}
            onChange={(weightKg) => onEntryChange({ ...entry, weightKg })}
          />
          <OptionalNumberField
            label="체지방률"
            unit="%"
            value={entry.bodyFatPercent}
            min={2}
            max={75}
            step={0.1}
            onChange={(bodyFatPercent) =>
              onEntryChange({ ...entry, bodyFatPercent })
            }
          />
        </div>
        <label className="completion-toggle completion-toggle--compact">
          <input
            type="checkbox"
            checked={entry.dietComplete}
            onChange={(event) =>
              onEntryChange({ ...entry, dietComplete: event.target.checked })
            }
          />
          <span>
            <CalendarCheck size={19} aria-hidden="true" />
            <span>
              <strong>오늘 식단 기록 완료</strong>
              <small>빠뜨린 음식이 없을 때 체크해 주세요.</small>
            </span>
          </span>
        </label>
        <button
          className="secondary-button metabolism-save-button"
          type="button"
          disabled={isBusy || entry.weightKg <= 0 || !canSave}
          onClick={onSaveEntry}
        >
          <Save size={17} aria-hidden="true" />
          오늘 학습 자료 저장
        </button>
        {!canSave && (
          <small className="learning-save-hint">
            위의 ‘내 기본 정보’를 먼저 입력하면 함께 저장할 수 있어요.
          </small>
        )}
      </div>

      <div className="formula-note">
        <Info size={16} aria-hidden="true" />
        <p>
          하루 체중 변화는 수분·염분에 크게 흔들려요. 앱은 최소 14일, 권장 28일의
          흐름을 이용해 이 앱의 식단 기록 방식에 맞는 유지칼로리를 찾아요.
        </p>
      </div>
    </section>
  );
}

function ProgressCard({
  label,
  value,
  goal,
  description
}: {
  label: string;
  value: number;
  goal: number;
  description: string;
}) {
  const percent = Math.min(100, Math.round((value / goal) * 100));
  return (
    <div className="progress-card">
      <div>
        <strong>{label}</strong>
        <span>
          {value}/{goal}일
        </span>
      </div>
      <div
        className="progress-card__bar"
        role="progressbar"
        aria-label={`${label} 데이터 진행`}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={value}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p>{description}</p>
    </div>
  );
}

function NumberField({
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
  value: number;
  min: number;
  max: number;
  step: number;
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
          aria-label={`${label} (${unit})`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span>{unit}</span>
      </span>
    </label>
  );
}

function OptionalNumberField({
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
          aria-label={`${label} (${unit}), 선택 입력`}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : Number(event.target.value))
          }
        />
        <span>{unit}</span>
      </span>
    </label>
  );
}

function emptyProfile(): MetabolismProfile {
  const now = new Date().toISOString();
  return {
    id: "metabolism",
    sex: "male",
    birthDate: "",
    heightCm: 0,
    jobTemplates: [],
    exerciseTemplates: [],
    createdAt: now,
    updatedAt: now
  };
}

function emptyEntry(day: string): DailyMetabolismEntry {
  const now = new Date().toISOString();
  return {
    id: day,
    date: day,
    weightKg: 0,
    dietComplete: false,
    jobActivities: [],
    exercises: [],
    createdAt: now,
    updatedAt: now
  };
}

function formatEnergy(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("ko-KR")} kcal`;
}

function round(value: number, digits: number): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function bmrMethodLabel(method: ReturnType<typeof calculateBmr>["method"]): string {
  return method === "katch-mcardle" ? "체지방률 기반" : "일반 공식";
}

function workTypeLabel(type: WorkActivityType): string {
  return WORK_TYPES.find((item) => item.value === type)?.label ?? type;
}

function intensityLabel(intensity: ExerciseIntensity): string {
  return INTENSITIES.find((item) => item.value === intensity)?.label ?? intensity;
}

function personalizedRange(
  learning: ReturnType<typeof estimatePersonalizedTdee> | null
): string {
  if (!learning || learning.status !== "estimated") {
    return "자료를 모으는 중";
  }
  if (learning.lowerKcal != null && learning.upperKcal != null) {
    return `${Math.round(learning.lowerKcal).toLocaleString(
      "ko-KR"
    )}~${Math.round(learning.upperKcal).toLocaleString(
      "ko-KR"
    )} kcal`;
  }
  return learning.tdeeKcal != null
    ? `약 ${formatEnergy(learning.tdeeKcal)}`
    : "자료를 모으는 중";
}

function formatWeightTrend(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${round(value, 2)} kg/주`;
}

function localTodayValue(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}
