import Dexie, { liveQuery } from "dexie";
import { DEFAULT_SETTINGS } from "../constants";
import { db, type DietLogDatabase } from "./db";
import { dietSnapshotDigest, projectDietSnapshot } from "./chronicleProjection";
import type { ChronicleSyncState, ChronicleSyncStatus, SyncPhase } from "./chronicleSyncTypes";

export const CHRONICLE_ORIGIN = "https://life-chronicle.crhipse.workers.dev";
const MAX_BYTES = 24 * 1024 * 1024;
const heldPhases = new Set<SyncPhase>(["reconnect", "too_large", "empty_source", "error"]);
const disconnected: ChronicleSyncStatus = { connected: false, phase: "disconnected", needsReview: false };
type Options = {
  fetch?: typeof fetch;
  online?: () => boolean;
  uuid?: () => string;
  now?: () => string;
  timeoutMs?: number;
  debounceMs?: number;
};

/** A durable, immutable outbox. Source data transactions never wait for this client. */
export class ChronicleSyncClient {
  private readonly requestFetch: typeof fetch;
  private readonly online: () => boolean;
  private readonly uuid: () => string;
  private readonly now: () => string;
  private readonly timeoutMs: number;
  private readonly debounceMs: number;
  private status: ChronicleSyncStatus = disconnected;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private started = false;
  private retryDelay = 1500;
  private cleanups: (() => void)[] = [];

  constructor(readonly database: DietLogDatabase, options: Options = {}) {
    this.requestFetch = options.fetch ?? ((...args) => fetch(...args));
    this.online = options.online ?? (() => navigator.onLine);
    this.uuid = options.uuid ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => new Date().toISOString());
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.debounceMs = options.debounceMs ?? 650;
  }

  getStatus = (): ChronicleSyncStatus => this.status;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    const stateSubscription = liveQuery(() => this.database.chronicleSync.get("chronicle")).subscribe({
      next: state => this.publish(state), error: () => this.publishStorageError()
    });
    // Observe committed source changes, including backup replacement and goal/weight history.
    // The outbox is deliberately absent from this query, preventing an update loop.
    const sourceSubscription = liveQuery(() => this.database.transaction("r",
      [this.database.records, this.database.settings, this.database.dailyMetabolismEntries],
      () => Promise.all([this.database.records.toArray(), this.database.settings.get("app"), this.database.dailyMetabolismEntries.toArray()])
    )).subscribe({ next: () => this.schedule(this.debounceMs), error: () => this.publishStorageError() });
    const resume = () => { if (document.visibilityState !== "hidden") this.schedule(0); };
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    this.cleanups = [() => stateSubscription.unsubscribe(), () => sourceSubscription.unsubscribe(),
      () => window.removeEventListener("online", resume), () => window.removeEventListener("pageshow", resume),
      () => document.removeEventListener("visibilitychange", resume)];
    this.schedule(0);
  }

  stop(): void {
    this.started = false;
    clearTimeout(this.timer);
    this.cleanups.splice(0).forEach(cleanup => cleanup());
  }

  async connect(code: string): Promise<void> {
    const trimmed = code.trim();
    if (!trimmed || trimmed.length > 512) throw new Error("위버멘쉬에서 복사한 연결 코드를 입력해주세요.");
    await this.database.transaction("rw", this.database.chronicleSync, async () => {
      const previous = await this.database.chronicleSync.get("chronicle");
      // A lost exchange response must retry with the same device identity.
      if (previous?.pairingCode === trimmed) {
        await this.database.chronicleSync.put({ ...previous, phase: "connecting" });
      } else {
        await this.database.chronicleSync.put({ id: "chronicle", deviceId: this.uuid(), pairingCode: trimmed, revision: 0, phase: "connecting" });
      }
    });
    this.schedule(0);
  }

  async disconnect(): Promise<void> {
    await this.database.chronicleSync.delete("chronicle");
    this.publish(undefined);
    // In-flight responses check identity and cannot restore deleted connection metadata.
  }

  async retry(): Promise<void> {
    await this.database.transaction("rw", this.database.chronicleSync, async () => {
      const state = await this.database.chronicleSync.get("chronicle");
      if (!state || state.phase === "reconnect") return;
      await this.database.chronicleSync.put({ ...state, phase: state.pairingCode ? "connecting" : "pending" });
    });
    this.schedule(0);
  }

  /** Re-read current source data in the same transaction that updates the queue.
   * This also repairs a source commit followed immediately by an app crash.
   * IndexedDB serialization prevents two tabs assigning different bodies to one revision.
   */
  async refresh(): Promise<void> {
    await this.database.transaction("rw", [this.database.records, this.database.settings, this.database.dailyMetabolismEntries, this.database.chronicleSync], async () => {
      const state = await this.database.chronicleSync.get("chronicle");
      if (!state?.token) return;
      const [records, settings, entries] = await Promise.all([
        this.database.records.toArray(), this.database.settings.get("app"), this.database.dailyMetabolismEntries.toArray()
      ]);
      const payload = projectDietSnapshot(records, settings ?? DEFAULT_SETTINGS, entries, this.now());
      const digest = await Dexie.waitFor(dietSnapshotDigest(payload));
      let changed = false;
      if (state.pending && state.rejectedDigest === state.pending.digest && digest !== state.rejectedDigest) {
        // A definite rejection never reached the source ledger. A corrected source
        // may replace it, using a new revision; unknown network outcomes cannot.
        const revision = state.pending.revision + 1;
        if (!Number.isSafeInteger(revision)) state.phase = "reconnect";
        else {
          state.pending = { payload, digest, revision, mutationId: `${state.deviceId}:${revision}` };
          delete state.latest;
          delete state.rejectedDigest;
          state.phase = "pending";
        }
        changed = true;
      } else if (state.pending) {
        if (digest === state.pending.digest) {
          if (state.latest) { delete state.latest; changed = true; }
        } else if (state.latest?.digest !== digest) {
          state.latest = { payload, digest };
          changed = true;
        }
      } else if (digest !== state.ackDigest) {
        const revision = state.revision + 1;
        if (!Number.isSafeInteger(revision)) { state.phase = "reconnect"; }
        else {
          state.pending = { payload, digest, revision, mutationId: `${state.deviceId}:${revision}` };
          if (!heldPhases.has(state.phase)) state.phase = "pending";
        }
        changed = true;
      }
      if (changed) await this.database.chronicleSync.put(state);
    });
  }

  flush(): Promise<void> {
    if (this.running) return this.running;
    const execute = async () => {
      try {
        if (!this.online()) { await this.setPhase(undefined, "offline", true); return; }
        await this.exchangeCode();
        await this.refresh();
        // Bounded drain: continued input goes through another debounce, never blocks editing.
        for (let count = 0; count < 4; count += 1) {
          const state = await this.database.chronicleSync.get("chronicle");
          if (!state?.token || !state.pending || heldPhases.has(state.phase)) break;
          if (!await this.sendPending(state)) break;
        }
      } catch {
        // Storage errors are visible without exposing response bodies, tokens or source data.
        this.publishStorageError();
      }
    };
    const lockName = `diet-log-chronicle:${this.database.name}`;
    const work = typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(lockName, execute) : execute();
    this.running = work.finally(() => { this.running = undefined; });
    return this.running;
  }

  private async exchangeCode(): Promise<void> {
    const state = await this.database.chronicleSync.get("chronicle");
    if (!state?.pairingCode || heldPhases.has(state.phase)) return;
    await this.setPhase(state.deviceId, "connecting");
    try {
      const { response, result } = await this.request("/api/source/connect", { source: "diet-log", code: state.pairingCode, deviceId: state.deviceId });
      if (!response.ok || result.ok !== true || result.source !== "diet-log" || result.deviceId !== state.deviceId || typeof result.token !== "string" || !result.token || result.revision !== 0) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500 || response.ok;
        await this.setPhase(state.deviceId, retryable ? "retry" : "reconnect");
        if (retryable) this.scheduleRetry();
        return;
      }
      await this.database.transaction("rw", this.database.chronicleSync, async () => {
        const current = await this.database.chronicleSync.get("chronicle");
        if (!current || current.deviceId !== state.deviceId || current.pairingCode !== state.pairingCode) return;
        await this.database.chronicleSync.put({ id: "chronicle", deviceId: current.deviceId, token: result.token as string, revision: 0, phase: "pending" });
      });
    } catch {
      await this.setPhase(state.deviceId, this.online() ? "retry" : "offline");
      this.scheduleRetry();
    }
  }

  private async sendPending(state: ChronicleSyncState): Promise<boolean> {
    const pending = state.pending!;
    const body = { deviceId: state.deviceId, revision: pending.revision, mutationId: pending.mutationId, payload: pending.payload };
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_BYTES) {
      await this.updatePending(state, current => { current.phase = "too_large"; current.rejectedDigest = pending.digest; });
      return false;
    }
    await this.setPhase(state.deviceId, "syncing");
    try {
      const { response, result } = await this.request("/api/source/snapshot", body, state.token);
      if (response.status === 409 && result.code === "stale_revision" && Number.isSafeInteger(result.revision) && (result.revision as number) >= pending.revision) {
        await this.updatePending(state, current => {
          current.revision = result.revision as number;
          delete current.pending;
          delete current.latest;
          // The server has a different accepted base. Force a fresh authoritative projection.
          delete current.ackDigest;
          current.phase = "pending";
        });
        await this.refresh();
        return true;
      }
      if (!response.ok || result.ok !== true || result.revision !== pending.revision || typeof result.needsReview !== "boolean") {
        const phase = response.status === 401 || response.status === 403 ? "reconnect" : response.status === 413 ? "too_large" : result.code === "empty_initial_snapshot" ? "empty_source" : response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429 ? "error" : "retry";
        const definiteRejection = response.status === 400 || response.status === 422 || response.status === 413 || (response.status === 409 && result.code === "empty_initial_snapshot");
        await this.updatePending(state, current => {
          current.phase = phase;
          if (definiteRejection) current.rejectedDigest = pending.digest;
        });
        if (definiteRejection) await this.refresh();
        if (phase === "retry") this.scheduleRetry();
        return false;
      }
      await this.updatePending(state, current => {
        current.revision = pending.revision;
        current.ackDigest = pending.digest;
        current.lastSyncAt = this.now();
        current.needsReview = result.needsReview as boolean;
        delete current.rejectedDigest;
        delete current.pending;
        if (current.latest && current.latest.digest !== current.ackDigest) {
          const revision = current.revision + 1;
          if (Number.isSafeInteger(revision)) current.pending = { ...current.latest, revision, mutationId: `${current.deviceId}:${revision}` };
          else current.phase = "reconnect";
        }
        delete current.latest;
        if (current.phase !== "reconnect") current.phase = current.pending ? "pending" : "synced";
      });
      this.retryDelay = 1500;
      return true;
    } catch {
      await this.updatePending(state, current => { current.phase = this.online() ? "retry" : "offline"; });
      this.scheduleRetry();
      return false;
    }
  }

  private async updatePending(sent: ChronicleSyncState, update: (state: ChronicleSyncState) => void): Promise<void> {
    await this.database.transaction("rw", this.database.chronicleSync, async () => {
      const current = await this.database.chronicleSync.get("chronicle");
      if (!current || current.deviceId !== sent.deviceId || current.pending?.mutationId !== sent.pending?.mutationId || current.pending?.digest !== sent.pending?.digest) return;
      update(current);
      await this.database.chronicleSync.put(current);
    });
  }

  private async setPhase(deviceId: string | undefined, phase: SyncPhase, preserveHeld = false): Promise<void> {
    await this.database.transaction("rw", this.database.chronicleSync, async () => {
      const current = await this.database.chronicleSync.get("chronicle");
      if (!current || (deviceId && current.deviceId !== deviceId) || (preserveHeld && heldPhases.has(current.phase))) return;
      await this.database.chronicleSync.put({ ...current, phase });
    });
  }

  private async request(path: string, body: unknown, token?: string): Promise<{ response: Response; result: Record<string, unknown> }> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Promise.race also protects against a transport returning a late response after abort.
      return await Promise.race([
        this.requestFetch(`${CHRONICLE_ORIGIN}${path}`, {
          method: "POST", credentials: "omit", cache: "no-store", redirect: "error",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(body), signal: controller.signal
        }).then(async response => ({ response, result: await this.readResult(response) })),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error("sync timeout")); }, this.timeoutMs); })
      ]);
    } finally { clearTimeout(timeout); }
  }

  private async readResult(response: Response): Promise<Record<string, unknown>> {
    const result: unknown = await response.json().catch(() => null);
    return result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : {};
  }

  private schedule(delay: number): void {
    if (!this.started) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      // Refresh even while another request is running: its acknowledgement must see
      // the newest desired snapshot (including an undo back to the previous digest).
      void this.refresh().then(() => this.flush()).catch(() => this.publishStorageError()).finally(async () => {
        if (!this.started) return;
        const state = await this.database.chronicleSync.get("chronicle").catch(() => undefined);
        if (state?.pending && state.phase === "pending") this.schedule(this.debounceMs);
      });
    }, delay);
  }

  private scheduleRetry(): void {
    if (!this.online()) return;
    this.schedule(this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 60000);
  }

  private publish(state: ChronicleSyncState | undefined): void {
    this.status = state ? { connected: Boolean(state.token), phase: state.phase, needsReview: Boolean(state.needsReview), lastSyncAt: state.lastSyncAt } : disconnected;
    this.listeners.forEach(listener => listener());
  }
  private publishStorageError(): void {
    this.status = { ...this.status, phase: "error" };
    this.listeners.forEach(listener => listener());
  }
}

export const chronicleSync = new ChronicleSyncClient(db);
