import type { DietSyncPayload } from "./chronicleProjection";

export type SyncPhase = "disconnected" | "connecting" | "pending" | "syncing" | "synced" | "offline" | "retry" | "reconnect" | "too_large" | "empty_source" | "error";
export interface PendingSnapshot {
  revision: number;
  mutationId: string;
  payload: DietSyncPayload;
  digest: string;
}
/** Separate from every exportable source table. Never pass this object to UI, backups or logs. */
export interface ChronicleSyncState {
  id: "chronicle";
  deviceId: string;
  token?: string;
  pairingCode?: string;
  revision: number;
  ackDigest?: string;
  pending?: PendingSnapshot;
  rejectedDigest?: string;
  latest?: { payload: DietSyncPayload; digest: string };
  phase: SyncPhase;
  needsReview?: boolean;
  lastSyncAt?: string;
}
export interface ChronicleSyncStatus {
  connected: boolean;
  phase: SyncPhase;
  needsReview: boolean;
  lastSyncAt?: string;
}
