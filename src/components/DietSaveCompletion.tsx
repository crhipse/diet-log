import { useSyncExternalStore } from "react";
import { Check, RefreshCw } from "lucide-react";
import { chronicleSync } from "../lib/chronicleSync";
import { chronicleStatusText } from "./ChronicleSyncCard";

export default function DietSaveCompletion({ complete, manual, disabled, onComplete, onCancel }: {
  complete: boolean; manual: boolean; disabled?: boolean;
  onComplete: () => void; onCancel: () => void;
}) {
  const sync = useSyncExternalStore(chronicleSync.subscribe, chronicleSync.getStatus, chronicleSync.getStatus);
  const syncing = sync.phase === "pending" || sync.phase === "syncing";
  const text = sync.phase === "disconnected"
    ? "설정에서 위버맨쉬를 연결하면 식단 수치를 자동 전송해요."
    : sync.connected && sync.phase === "synced" && !sync.needsReview
      ? "위버맨쉬 전송 완료" : chronicleStatusText(sync);
  return <section className="diet-save-completion" aria-label="식단 저장완료 및 연동">
    <div className="diet-save-completion__actions">
      <button className="primary-button" type="button" disabled={disabled} onClick={onComplete}>
        <Check size={18} aria-hidden="true" />식단 저장완료
      </button>
      {complete && <button className="text-button text-button--muted" type="button" disabled={disabled} onClick={onCancel}>완료 취소</button>}
    </div>
    {complete && <small>{manual ? "직접 완료됨" : "자동 완료됨 · 저장완료 버튼으로 직접 확정할 수 있어요"}</small>}
    <p className="diet-save-completion__sync" role="status" aria-live="polite">
      {syncing && <RefreshCw size={13} className="spin" aria-hidden="true" />}{text}
    </p>
  </section>;
}
