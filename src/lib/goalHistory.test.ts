import {
  appendGoalTarget,
  goalTargetForDay,
  goalTargetFromRecommendation,
  latestGoalTarget,
  mergeGoalSettings
} from "./goalHistory";
import { calculateGoalRecommendation, type GoalPlan } from "./goals";

const plan: GoalPlan = {
  goalType: "fat_loss",
  pace: "moderate",
  resistanceTrainingDaysPerWeek: 3
};

function target(id: string, day: string, tdeeKcal: number) {
  return goalTargetFromRecommendation({
    id,
    effectiveFrom: day,
    plan,
    recommendation: calculateGoalRecommendation({
      tdeeKcal,
      weightKg: 75,
      plan
    }),
    tdeeSource: "detailed",
    createdAt: `${day}T00:00:00.000Z`
  });
}

describe("목표 이력", () => {
  it("적용일 이전에는 목표가 없고 이후에는 당시 목표를 돌려준다", () => {
    let settings = appendGoalTarget(undefined, target("a", "2026-07-01", 2400));
    settings = appendGoalTarget(settings, target("b", "2026-07-15", 2200));

    expect(goalTargetForDay(settings, "2026-06-30")).toBeUndefined();
    expect(goalTargetForDay(settings, "2026-07-10")?.id).toBe("a");
    expect(goalTargetForDay(settings, "2026-07-26")?.id).toBe("b");
    expect(latestGoalTarget(settings)?.id).toBe("b");
  });

  it("같은 ID의 목표를 저장하면 중복하지 않고 교체한다", () => {
    let settings = appendGoalTarget(undefined, target("same", "2026-07-01", 2400));
    settings = appendGoalTarget(
      settings,
      target("same", "2026-07-02", 2300)
    );

    expect(settings.targets).toHaveLength(1);
    expect(settings.targets[0].effectiveFrom).toBe("2026-07-02");
  });

  it("백업 병합 시 서로 다른 목표 이력을 모두 보존한다", () => {
    const current = appendGoalTarget(
      undefined,
      target("current", "2026-07-01", 2400)
    );
    const incoming = appendGoalTarget(
      undefined,
      target("backup", "2026-07-15", 2200)
    );

    expect(
      mergeGoalSettings(current, incoming)?.targets.map((item) => item.id)
    ).toEqual(["current", "backup"]);
  });
});
