import {
  appendGoalTarget,
  goalTargetFromRecommendation
} from "./goalHistory";
import { calculateGoalRecommendation, type GoalPlan } from "./goals";
import {
  db,
  getSettings,
  saveGoalSettings,
  saveSettings
} from "./db";

describe("목표 설정 저장", () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  afterAll(async () => {
    db.close();
    await db.delete();
  });

  it("일반 설정을 바꿔도 목표 이력을 보존한다", async () => {
    const plan: GoalPlan = {
      goalType: "fat_loss",
      pace: "moderate",
      resistanceTrainingDaysPerWeek: 3
    };
    const target = goalTargetFromRecommendation({
      id: "goal-1",
      effectiveFrom: "2026-07-26",
      plan,
      recommendation: calculateGoalRecommendation({
        tdeeKcal: 2400,
        weightKg: 75,
        plan
      }),
      tdeeSource: "detailed",
      createdAt: "2026-07-26T00:00:00.000Z"
    });
    await saveGoalSettings(appendGoalTarget(undefined, target));

    await saveSettings({ dayStartHour: 4 });

    const settings = await getSettings();
    expect(settings.dayStartHour).toBe(4);
    expect(settings.goalSettings?.targets).toEqual([target]);
  });
});
