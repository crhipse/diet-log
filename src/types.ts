import type { GoalSettings } from "./lib/goalHistory";

export type AnalysisStatus =
  | "not_requested"
  | "pending"
  | "complete"
  | "failed";

export type FoodSource = "ai" | "manual" | "copied";

export type Confidence = "high" | "medium" | "low";

export interface Nutrients {
  energyKcal: number | null;
  carbsG: number | null;
  proteinG: number | null;
  fatG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  fiberG: number | null;
  saturatedFatG: number | null;
}

export interface FoodItem {
  id: string;
  name: string;
  amountText: string;
  nutrients: Nutrients;
  source: FoodSource;
  userEdited: boolean;
}

export interface AnalysisMeta {
  status: AnalysisStatus;
  modelId?: string;
  analyzedAt?: string;
  assumptions: string[];
  confidence?: Confidence;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface FoodRecord {
  id: string;
  consumedAt: string;
  timezoneOffsetMinutes: number;
  note: string;
  photoIds: string[];
  foods: FoodItem[];
  analysis: AnalysisMeta;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoAsset {
  id: string;
  recordId: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: string;
}

export interface AppSettings {
  id: "app";
  dayStartHour: number;
  modelId: string;
  goalSettings?: GoalSettings;
  updatedAt: string;
}

export interface BackupPhoto {
  id: string;
  recordId: string;
  dataUrl: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface DietLogBackup {
  app: "식단관리";
  schemaVersion: 2;
  photosIncluded: boolean;
  exportedAt: string;
  settings: AppSettings;
  records: FoodRecord[];
  photos: BackupPhoto[];
  metabolismProfile: MetabolismProfile | null;
  metabolismEntries: DailyMetabolismEntry[];
}

export interface DailyTotals extends Nutrients {
  hasMissingCoreValues: boolean;
}

export interface PendingPhoto {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
}

export interface FoodAnalysisResult {
  foods: FoodItem[];
  assumptions: string[];
  confidence: Confidence;
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
}

export type Sex = "male" | "female";

export type WorkActivityType =
  | "seated"
  | "standing"
  | "walking"
  | "physical";

export type ExerciseCategory =
  | "walking"
  | "running"
  | "cycling"
  | "strength"
  | "swimming"
  | "sports"
  | "yoga"
  | "other";

export type ExerciseIntensity = "low" | "moderate" | "high";

export type SimpleActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "high"
  | "very_high";

export interface WorkTemplate {
  id: string;
  name: string;
  activityType: WorkActivityType;
  defaultHours: number;
}

export interface ExerciseTemplate {
  id: string;
  name: string;
  category: ExerciseCategory;
  intensity: ExerciseIntensity;
  defaultDurationMinutes: number;
  weeklyFrequency: number;
}

export interface MetabolismProfile {
  id: "metabolism";
  sex: Sex;
  birthDate: string;
  heightCm: number;
  jobTemplates: WorkTemplate[];
  exerciseTemplates: ExerciseTemplate[];
  createdAt: string;
  updatedAt: string;
}

/**
 * A snapshot of one kind of work performed on a particular day. Keeping the
 * name and activity type here means old entries remain meaningful after a
 * template is renamed or deleted.
 */
export interface DailyWorkActivity {
  id: string;
  templateId?: string;
  name: string;
  activityType: WorkActivityType;
  hours: number;
}

/**
 * A snapshot of exercise actually completed on a particular day.
 */
export interface DailyExercise {
  id: string;
  templateId?: string;
  name: string;
  category: ExerciseCategory;
  intensity: ExerciseIntensity;
  durationMinutes: number;
}

export interface DailyMetabolismEntry {
  /** Calendar date in YYYY-MM-DD form. The ID is intentionally the date. */
  id: string;
  date: string;
  weightKg: number;
  bodyFatPercent?: number;
  steps?: number;
  dietComplete: boolean;
  jobActivities: DailyWorkActivity[];
  exercises: DailyExercise[];
  createdAt: string;
  updatedAt: string;
}

export type BmrMethod = "mifflin-st-jeor" | "katch-mcardle";

export interface BmrCalculation {
  method: BmrMethod;
  kcal: number;
  ageYears: number;
  leanBodyMassKg?: number;
}

export interface SimpleTdeeEstimate {
  level: SimpleActivityLevel;
  factor: number;
  bmrKcal: number;
  activityKcal: number;
  tdeeKcal: number;
}

export interface DailyEnergyEstimate {
  date: string;
  bmr: BmrCalculation;
  bmrKcal: number;
  /** Everyday movement and the thermic effect already represented by PAL 1.2. */
  baselineActivityKcal: number;
  stepsKcal: number;
  workKcal: number;
  exerciseKcal: number;
  activityKcal: number;
  tdeeKcal: number;
  pal: number;
  assumptions: string[];
}

export interface PersonalizedTdeeEstimate {
  status: "insufficient" | "estimated";
  windowDays: 14 | 28;
  startDate: string;
  endDate: string;
  validIntakeDays: number;
  weightMeasurementDays: number;
  averageIntakeKcal?: number;
  weightTrendKgPerWeek?: number;
  tdeeKcal?: number;
  lowerKcal?: number;
  upperKcal?: number;
  confidence: Confidence;
  reason?: string;
}
