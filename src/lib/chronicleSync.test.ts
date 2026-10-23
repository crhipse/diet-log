import Dexie from "dexie";
import { DEFAULT_SETTINGS, EMPTY_NUTRIENTS } from "../constants";
import type { DailyMetabolismEntry, FoodRecord } from "../types";
import { DietLogDatabase, db, saveRecord, deleteRecordWithPhotos, saveGoalSettings, saveSettings, saveDailyMetabolismEntry, deleteDailyMetabolismEntry } from "./db";
import { createBackup, importBackup } from "./export";
import { appendGoalTarget, goalTargetFromRecommendation } from "./goalHistory";
import { calculateGoalRecommendation } from "./goals";
import { dietSnapshotDigest, projectDietSnapshot } from "./chronicleProjection";
import { CHRONICLE_ORIGIN, ChronicleSyncClient } from "./chronicleSync";

const at = "2026-09-13T16:30:00.000Z";
const record = (energy = 300): FoodRecord => ({
  id: "meal-a", consumedAt: at, timezoneOffsetMinutes: -540, note: "private-note", photoIds: [],
  foods: [{ id: "food-a", name: "private-food", amountText: "private-amount", nutrients: { ...EMPTY_NUTRIENTS, energyKcal: energy, proteinG: 25 }, source: "ai", userEdited: true }],
  analysis: { status: "complete", assumptions: ["private-ai-response"], modelId: "private-model" }, createdAt: at, updatedAt: at
});
const entry = (date = "2026-09-13", weightKg = 80): DailyMetabolismEntry => ({
  id: date, date, weightKg, dietComplete: false, jobActivities: [], exercises: [], createdAt: at, updatedAt: at
});
function goal(id = "goal-a", date = "2026-09-01", weightKg = 80) {
  const plan = { goalType: "fat_loss", pace: "moderate", resistanceTrainingDaysPerWeek: 3 } as const;
  return goalTargetFromRecommendation({ id, effectiveFrom: date, plan,
    recommendation: calculateGoalRecommendation({ tdeeKcal: 2400, weightKg, plan }), tdeeSource: "detailed", createdAt: `${date}T00:00:00.000Z` });
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
type Sent = { revision: number; mutationId: string; deviceId: string; payload: ReturnType<typeof projectDietSnapshot> };
function accepted(body: Sent, needsReview = false) { return json({ ok: true, revision: body.revision, changed: 1, needsReview }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let database: DietLogDatabase;
let clients: ChronicleSyncClient[];
beforeEach(async () => {
  database = new DietLogDatabase(`chronicle-test-${crypto.randomUUID()}`);
  clients = [];
  await database.open();
});
afterEach(async () => {
  clients.forEach(client => client.stop());
  await database.delete();
});
function client(fetcher: typeof fetch, options: { online?: () => boolean; timeoutMs?: number } = {}, target = database) {
  const result = new ChronicleSyncClient(target, { fetch: fetcher, online: () => true, uuid: () => crypto.randomUUID(), now: () => at, debounceMs: 5, ...options });
  clients.push(result);
  return result;
}
async function connected(target = database) {
  await target.chronicleSync.put({ id: "chronicle", token: "private-source-token", deviceId: "device-a", revision: 0, phase: "pending" });
}

describe("numeric projection", () => {
  it("allowlists only adapter fields, preserves missing nutrients and dated goals/weight", async () => {
    const source = record(); source.photoIds = ["private-photo"];
    const targets = appendGoalTarget(appendGoalTarget(undefined, goal()), goal("goal-b", "2026-09-14", 79));
    const payload = projectDietSnapshot([source], { ...DEFAULT_SETTINGS, goalSettings: targets }, [entry(), entry("2026-09-14", 79)], at);
    expect(JSON.stringify(payload)).not.toContain("private-");
    expect(payload.records[0].consumedAt).toBe(at);
    expect(payload.records[0].timezoneOffsetMinutes).toBe(-540);
    expect(payload.settings.dayStartHour).toBe(2);
    expect(payload.records[0].foods[0].nutrients.fatG).toBeNull();
    expect(payload.metabolismEntries.map(e => [e.date, e.weightKg, e.dietComplete])).toEqual([["2026-09-13", 80, false], ["2026-09-14", 79, false]]);
    expect(payload.settings.goalSettings.targets.map(g => [g.effectiveFrom, g.weightKg])).toEqual([["2026-09-01", 80], ["2026-09-14", 79]]);
    expect(Object.keys(payload.settings.goalSettings.targets[0])).toEqual(["id", "effectiveFrom", "createdAt", "weightKg", "dailyCalories", "proteinMinimumG"]);
  });
  it("ignores metadata timestamps and order, but detects dates, goals, weights and explicit completion", async () => {
    const a = record(); const b = { ...record(500), id: "meal-b" };
    const base = projectDietSnapshot([b, a], DEFAULT_SETTINGS, [entry()], at);
    const digest = await dietSnapshotDigest(base);
    expect(await dietSnapshotDigest(projectDietSnapshot([{ ...a, note: "changed", updatedAt: "2026-09-14T00:00:00.000Z" }, b], DEFAULT_SETTINGS, [entry()], "2026-09-15T00:00:00.000Z"))).toBe(digest);
    for (const changed of [
      projectDietSnapshot([a, b], { ...DEFAULT_SETTINGS, dayStartHour: 3 }, [entry()], at),
      projectDietSnapshot([a, b], DEFAULT_SETTINGS, [{ ...entry(), dietComplete: true }], at),
      projectDietSnapshot([a, b], DEFAULT_SETTINGS, [entry("2026-09-13", 81)], at),
      projectDietSnapshot([a, b], { ...DEFAULT_SETTINGS, goalSettings: appendGoalTarget(undefined, goal()) }, [entry()], at)
    ]) expect(await dietSnapshotDigest(changed)).not.toBe(digest);
  });
});

describe("durable outbox", () => {
  it("retries a lost code exchange with the same code/device and never sends cookies", async () => {
    const bodies: unknown[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(url.toString().startsWith(CHRONICLE_ORIGIN)).toBe(true);
      expect(init?.credentials).toBe("omit"); expect(init?.cache).toBe("no-store"); expect(init?.redirect).toBe("error");
      const body = JSON.parse(init!.body as string);
      if (url.toString().endsWith("connect")) {
        bodies.push(body);
        if (bodies.length === 1) throw new Error("response lost");
        return json({ ok: true, source: "diet-log", deviceId: body.deviceId, token: "private-source-token", revision: 0 });
      }
      expect(init?.headers).toMatchObject({ Authorization: "Bearer private-source-token" });
      return accepted(body);
    });
    const first = client(fetcher); await first.connect("one-time-code"); await first.flush();
    const second = client(fetcher); await second.flush();
    expect(bodies[0]).toEqual(bodies[1]);
    const state = await database.chronicleSync.get("chronicle");
    expect(state?.pairingCode).toBeUndefined(); expect(state?.revision).toBe(1); expect(state?.phase).toBe("synced");
  });
  it("queues while offline and recovers an unqueued source commit after restart", async () => {
    const sent: Sent[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_, init) => { const body = JSON.parse(init!.body as string); sent.push(body); return accepted(body); });
    await connected();
    const offline = client(fetcher, { online: () => false });
    await database.records.put(record()); await offline.refresh(); await offline.flush();
    expect(fetcher).not.toHaveBeenCalled();
    await client(fetcher).flush();
    await database.records.put(record(700)); // no queue callback: emulate closing immediately after source commit
    await client(fetcher).flush();
    expect(sent.map(s => [s.revision, s.payload.records[0].foods[0].nutrients.energyKcal])).toEqual([[1, 300], [2, 700]]);
  });
  it("retries byte-identical unknown requests before delivering the latest edit", async () => {
    const bodies: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_, init) => { const body = init!.body as string; bodies.push(body); if (bodies.length === 1) throw new Error("lost"); return accepted(JSON.parse(body)); });
    await connected(); await database.records.put(record());
    const sync = client(fetcher); await sync.flush();
    await database.records.put(record(800)); await sync.refresh(); await sync.flush();
    expect(bodies[1]).toBe(bodies[0]); expect(JSON.parse(bodies[2]).revision).toBe(2);
    expect(JSON.parse(bodies[2]).payload.records[0].foods[0].nutrients.energyKcal).toBe(800);
  });
  it("retains newer source changes during an in-flight request, including undo to acknowledged data", async () => {
    const gate = deferred<Response>(); const reached = deferred<void>(); const sent: Sent[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_, init) => { const body = JSON.parse(init!.body as string); sent.push(body); if (body.revision === 2) { reached.resolve(); return gate.promise; } return accepted(body); });
    await connected(); await database.records.put(record(300)); const sync = client(fetcher); await sync.flush();
    await database.records.put(record(500)); const running = sync.flush(); await reached.promise;
    await database.records.put(record(300)); await sync.refresh(); gate.resolve(accepted(sent[1])); await running;
    expect(sent.map(s => [s.revision, s.payload.records[0].foods[0].nutrients.energyKcal])).toEqual([[1, 300], [2, 500], [3, 300]]);
    expect((await database.chronicleSync.get("chronicle"))?.pending).toBeUndefined();
  });
  it("ignores a response arriving after timeout and keeps the immutable request for retry", async () => {
    const late = deferred<Response>(); let body!: Sent;
    const fetcher = vi.fn<typeof fetch>(async (_, init) => { body = JSON.parse(init!.body as string); return late.promise; });
    await connected(); const sync = client(fetcher, { timeoutMs: 15 }); await sync.flush();
    const pending = (await database.chronicleSync.get("chronicle"))?.pending;
    late.resolve(accepted(body)); await Promise.resolve();
    expect((await database.chronicleSync.get("chronicle"))?.pending).toEqual(pending);
    expect((await database.chronicleSync.get("chronicle"))?.revision).toBe(0);
  });
  it("times out a stalled response body as well as headers and releases the next flush", async () => {
    const bodyGate = deferred<unknown>();
    const delayed = json({}); vi.spyOn(delayed, "json").mockImplementation(() => bodyGate.promise);
    let requests = 0; let first!: Sent;
    const fetcher = vi.fn<typeof fetch>(async (_, init) => {
      const body = JSON.parse(init!.body as string); requests += 1;
      if (requests === 1) { first = body; return delayed; }
      expect(body).toEqual(first); return accepted(body);
    });
    await connected(); const sync = client(fetcher, { timeoutMs: 15 }); await sync.flush();
    expect((await database.chronicleSync.get("chronicle"))?.pending?.revision).toBe(1);
    await sync.flush(); expect((await database.chronicleSync.get("chronicle"))?.revision).toBe(1);
    bodyGate.resolve({ ok: true, revision: 1, needsReview: false }); await Promise.resolve();
    expect((await database.chronicleSync.get("chronicle"))?.pending).toBeUndefined();
  });
  it("does not resurrect a disconnected/replaced connection after a late response", async () => {
    const gate = deferred<Response>(); const reached = deferred<void>(); let body!: Sent;
    const fetcher = vi.fn<typeof fetch>(async (_, init) => { body = JSON.parse(init!.body as string); reached.resolve(); return gate.promise; });
    await connected(); const sync = client(fetcher); const running = sync.flush(); await reached.promise;
    await sync.disconnect(); gate.resolve(accepted(body)); await running;
    expect(await database.chronicleSync.get("chronicle")).toBeUndefined();
  });
  it("live observation keeps edits made while a scheduled send is already running", async () => {
    const gate = deferred<Response>(); const reached = deferred<void>(); const sent: Sent[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_, init) => {
      const body = JSON.parse(init!.body as string); sent.push(body);
      if (body.revision === 1) { reached.resolve(); return gate.promise; }
      return accepted(body);
    });
    await connected(); await database.records.put(record(300)); const sync = client(fetcher); sync.start();
    await reached.promise;
    await database.records.put(record(900));
    await vi.waitFor(async () => expect((await database.chronicleSync.get("chronicle"))?.latest?.payload.records[0].foods[0].nutrients.energyKcal).toBe(900));
    gate.resolve(accepted(sent[0]));
    await vi.waitFor(() => expect(sent.at(-1)?.payload.records[0].foods[0].nutrients.energyKcal).toBe(900));
    await sync.flush(); sync.stop();
  });
  it.each([[400, undefined], [422, undefined], [413, undefined], [409, "empty_initial_snapshot"]])("recovers a definite %s rejection only after source data changes", async (status, code) => {
    const sent: Sent[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_, init) => { const body = JSON.parse(init!.body as string); sent.push(body); return sent.length === 1 ? json({ error: "rejected", code }, status) : accepted(body); });
    await connected(); const sync = client(fetcher); await sync.flush(); await sync.flush();
    expect(sent).toHaveLength(1);
    await database.records.put(record()); await sync.flush();
    expect(sent.map(s => s.revision)).toEqual([1, 2]); expect((await database.chronicleSync.get("chronicle"))?.phase).toBe("synced");
  });
  it("a revoked token stops automatic retry and retains source and queue", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("unauthorized", { status: 401 }));
    await connected(); await database.records.put(record()); const sync = client(fetcher); await sync.flush();
    await database.records.put(record(400)); await sync.flush();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(await database.records.count()).toBe(1);
    expect((await database.chronicleSync.get("chronicle"))?.phase).toBe("reconnect");
  });
  it("advances from the server's stale revision with a current full projection", async () => {
    const sent: Sent[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_, init) => { const body = JSON.parse(init!.body as string); sent.push(body); return sent.length === 1 ? json({ code: "stale_revision", revision: 8 }, 409) : accepted(body, true); });
    await connected(); const sync = client(fetcher); await sync.flush();
    expect(sent.map(s => s.revision)).toEqual([1, 9]); expect((await database.chronicleSync.get("chronicle"))?.needsReview).toBe(true);
  });
  it("serializes revision allocation across clients and tolerates duplicate same-body sends", async () => {
    const sent: Sent[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_, init) => { const body = JSON.parse(init!.body as string); sent.push(body); return accepted(body); });
    await connected(); await database.records.put(record());
    const a = client(fetcher); const b = client(fetcher);
    await Promise.all([a.refresh(), b.refresh()]); await Promise.all([a.flush(), b.flush()]);
    const one = sent.filter(body => body.revision === 1);
    expect(one.length).toBeGreaterThan(0); expect(new Set(one.map(body => JSON.stringify(body))).size).toBe(1);
    expect((await database.chronicleSync.get("chronicle"))?.revision).toBe(1);
  });
});

describe("source storage integration", () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  afterEach(async () => { await db.delete(); });
  it("observes save/delete, dated goals/weight, day boundaries and backup replacement; never exports sync secrets", async () => {
    const sent: Sent[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_, init) => { const body = JSON.parse(init!.body as string); sent.push(body); return accepted(body); });
    await connected(db); const sync = client(fetcher, {}, db); sync.start();
    await saveRecord(record());
    await vi.waitFor(() => expect(sent.at(-1)?.payload.records).toHaveLength(1));
    await saveGoalSettings(appendGoalTarget(undefined, goal()));
    await saveDailyMetabolismEntry({ ...entry(), dietComplete: true });
    await saveSettings({ ...DEFAULT_SETTINGS, dayStartHour: 4 });
    await vi.waitFor(() => {
      const payload = sent.at(-1)?.payload;
      expect(payload?.settings.dayStartHour).toBe(4); expect(payload?.settings.goalSettings.targets).toHaveLength(1);
      expect(payload?.metabolismEntries[0].dietComplete).toBe(true);
    });
    const backup = await createBackup({ includePhotos: false });
    const withPhotos = await createBackup({ includePhotos: true });
    for (const value of [backup, withPhotos]) {
      expect(JSON.stringify(value)).not.toContain("private-source-token");
      expect(JSON.stringify(value)).not.toContain("chronicleSync");
      expect(JSON.stringify(value)).not.toContain("device-a");
    }
    await deleteRecordWithPhotos("meal-a"); await deleteDailyMetabolismEntry("2026-09-13");
    await vi.waitFor(() => { expect(sent.at(-1)?.payload.records).toHaveLength(0); expect(sent.at(-1)?.payload.metabolismEntries).toHaveLength(0); });
    await importBackup(backup, "replace");
    await vi.waitFor(() => { expect(sent.at(-1)?.payload.records).toHaveLength(1); expect(sent.at(-1)?.payload.metabolismEntries).toHaveLength(1); });
    expect((await db.chronicleSync.get("chronicle"))?.token).toBe("private-source-token");
    await sync.disconnect(); expect(await db.records.count()).toBe(1);
    sync.stop();
  });
  it("upgrades v3 storage without losing original records, photos, settings or favorites", async () => {
    const name = `chronicle-migration-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(3).stores({ records: "&id, consumedAt, updatedAt", photos: "&id, recordId, [recordId+createdAt], createdAt", settings: "&id", metabolismProfiles: "&id, updatedAt", dailyMetabolismEntries: "&id, date, updatedAt", favoriteFoods: "&id, name, updatedAt" });
    await old.open(); await old.table("records").put(record()); await old.table("settings").put(DEFAULT_SETTINGS);
    await old.table("photos").put({ id: "photo-a", recordId: "meal-a", blob: new Blob(["fixture"]), createdAt: at });
    await old.table("favoriteFoods").put({ id: "favorite-a", name: "saved favorite", updatedAt: at }); old.close();
    const upgraded = new DietLogDatabase(name); await upgraded.open();
    expect(await upgraded.records.get("meal-a")).toEqual(record()); expect(await upgraded.photos.count()).toBe(1);
    expect(await upgraded.favoriteFoods.count()).toBe(1); expect(await upgraded.settings.get("app")).toEqual(DEFAULT_SETTINGS);
    expect(await upgraded.chronicleSync.count()).toBe(0); await upgraded.delete();
  });
});
