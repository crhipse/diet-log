import Dexie from "dexie";
import { DEFAULT_SETTINGS } from "../constants";
import { DietLogDatabase } from "./db";

test.each([
  ["claude-sonnet-5", "claude-sonnet-5-5"],
  ["claude-haiku-5-5", "claude-haiku-5-5"]
])("기존 설정 %s를 새 버전에서 %s로 읽는다", async (before, after) => {
  const name = `diet-log-settings-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(5).stores({
    records: "&id, consumedAt, updatedAt",
    photos: "&id, recordId, [recordId+createdAt], createdAt",
    settings: "&id",
    metabolismProfiles: "&id, updatedAt",
    dailyMetabolismEntries: "&id, date, updatedAt",
    favoriteFoods: "&id, name, updatedAt",
    chronicleSync: "&id",
    dailyCompletions: "&id, updatedAt"
  });
  const upgraded = new DietLogDatabase(name);
  const settings = { ...DEFAULT_SETTINGS, dayStartHour: 4, modelId: before };
  const completion = { id: "2026-11-10", dietComplete: true, updatedAt: settings.updatedAt };
  try {
    await legacy.table("settings").put(settings);
    await legacy.table("dailyCompletions").put(completion);
    legacy.close();

    await upgraded.open();
    expect(await upgraded.settings.get("app")).toEqual({ ...settings, modelId: after });
    expect(await upgraded.dailyCompletions.get(completion.id)).toEqual(completion);
  } finally {
    legacy.close();
    upgraded.close();
    await Dexie.delete(name);
  }
});
