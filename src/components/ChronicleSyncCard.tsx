import { Link2, RefreshCw, Unplug } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { chronicleSync } from "../lib/chronicleSync";
import type { ChronicleSyncStatus } from "../lib/chronicleSyncTypes";

export function chronicleStatusText(status: ChronicleSyncStatus): string {
  if (status.phase === "reconnect") return "연결이 만료되었거나 해제됐습니다. 새 연결 코드를 붙여넣어 주세요.";
  if (status.phase === "too_large") return "전송할 기록이 너무 큽니다. 기록은 기기에 보관 중이며 전송 대기는 유지됩니다.";
  if (status.phase === "empty_source") return "이 앱의 기록이 비어 있습니다. 기록이 있는 기존 아이폰 홈 화면 식단 앱에서 연결해 주세요.";
  if (status.phase === "error") return "전송을 완료하지 못했습니다. 기록은 보관 중입니다. 다시 시도해 주세요.";
  if (status.phase === "offline") return "오프라인 · 앱을 다시 열거나 인터넷이 연결되면 전송합니다.";
  if (status.phase === "retry") return "연결 대기 · 잠시 후 자동으로 다시 시도합니다.";
  if (status.phase === "connecting") return "생활연대기에 연결 중…";
  if (status.phase === "syncing" || status.phase === "pending") return "수치 전송 대기 중 · 식단 입력을 계속할 수 있습니다.";
  if (status.needsReview) return "전송 완료 · 생활연대기에서 겹친 기록 확인이 필요합니다.";
  if (status.connected) return "연결됨 · 기록을 바꾸면 자동으로 전송합니다.";
  return "생활연대기에 식단 수치를 자동으로 보냅니다.";
}

export default function ChronicleSyncCard() {
  const status = useSyncExternalStore(chronicleSync.subscribe, chronicleSync.getStatus, chronicleSync.getStatus);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    setError("");
    try { await chronicleSync.connect(code); setCode(""); }
    catch { setError("연결 정보를 저장하지 못했습니다. 코드를 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    try { await chronicleSync.disconnect(); setError(""); }
    catch { setError("연결 정보를 지우지 못했습니다. 다시 시도해 주세요."); }
  };
  const canConnect = !status.connected || status.phase === "reconnect";
  return <section className="settings-card chronicle-sync-card" aria-labelledby="chronicle-sync-title">
    <div className="settings-card__title">
      <span className="settings-card__icon"><Link2 size={20} /></span>
      <div><h2 id="chronicle-sync-title">생활연대기 자동 연동</h2><p role="status" aria-live="polite">{chronicleStatusText(status)}</p></div>
    </div>
    {canConnect && <div className="chronicle-sync-card__connect">
      <p className="field-hint">생활연대기 설정 → 자동 연동 관리 → 연결 코드 만들기에서 코드를 복사해 이곳에 한 번 붙여넣으세요.</p>
      <label className="field-label" htmlFor="chronicle-pairing-code">생활연대기 연결 코드</label>
      <input id="chronicle-pairing-code" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={512} value={code} onChange={event => setCode(event.target.value)} placeholder="연결 코드 붙여넣기" />
      <button type="button" className="primary-button" disabled={busy || !code.trim()} onClick={() => void connect()}>{busy ? "저장 중…" : "연결하기"}</button>
    </div>}
    {error && <p role="alert">{error}</p>}
    {(status.connected || status.phase !== "disconnected") && <div className="settings-card__actions">
      {status.phase !== "reconnect" && <button type="button" className="secondary-button" onClick={() => { void chronicleSync.retry().catch(() => setError("다시 시도하지 못했습니다.")); }}><RefreshCw size={16} /> 지금 동기화</button>}
      <button type="button" className="secondary-button" onClick={() => void disconnect()}><Unplug size={16} /> 이 기기 연결 해제</button>
    </div>}
    {status.lastSyncAt && <p className="field-hint">마지막 전송 {new Date(status.lastSyncAt).toLocaleString("ko-KR")}</p>}
    <p className="field-hint">영양 수치·식단 완료 상태·날짜별 목표와 체중만 전송합니다. 사진·음식명·메모·AI 응답·API 키는 보내지 않습니다. 연결 해제는 원본 식단 기록을 지우지 않습니다.</p>
  </section>;
}
