import { Flame, Target, Utensils } from "lucide-react";

export type PrimarySection = "diet" | "goal" | "metabolism";

interface AppNavigationProps {
  active: PrimarySection;
  onChange: (section: PrimarySection) => void;
}

export default function AppNavigation({
  active,
  onChange
}: AppNavigationProps) {
  return (
    <nav className="app-navigation" aria-label="주요 메뉴">
      <button
        className={active === "diet" ? "is-active" : ""}
        type="button"
        aria-current={active === "diet" ? "page" : undefined}
        onClick={() => onChange("diet")}
      >
        <Utensils size={19} aria-hidden="true" />
        <span>식단</span>
      </button>
      <button
        className={active === "goal" ? "is-active" : ""}
        type="button"
        aria-current={active === "goal" ? "page" : undefined}
        onClick={() => onChange("goal")}
      >
        <Target size={19} aria-hidden="true" />
        <span>목표</span>
      </button>
      <button
        className={active === "metabolism" ? "is-active" : ""}
        type="button"
        aria-current={active === "metabolism" ? "page" : undefined}
        onClick={() => onChange("metabolism")}
      >
        <Flame size={19} aria-hidden="true" />
        <span>대사량</span>
      </button>
    </nav>
  );
}
