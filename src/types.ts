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
  schemaVersion: 1;
  photosIncluded: boolean;
  exportedAt: string;
  settings: AppSettings;
  records: FoodRecord[];
  photos: BackupPhoto[];
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
