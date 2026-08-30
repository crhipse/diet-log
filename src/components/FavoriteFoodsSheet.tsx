import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Edit3, Plus, Star, Trash2, X } from "lucide-react";
import type { FavoriteFood, FoodItem } from "../types";
import { deleteFavoriteFood, foodFromFavorite, listFavoriteFoods, saveFavoriteFood } from "../lib/favorites";
import { formatKcal, formatMacroLine } from "../lib/format";
import FoodEditor, { createEmptyFood } from "./FoodEditor";
import type { Notify } from "./NutrientScaleControl";

export default function FavoriteFoodsSheet({ onClose, onPick, onNotify }: {
  onClose: () => void;
  onPick: (food: FoodItem) => void;
  onNotify: Notify;
}) {
  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id?: string; foods: FoodItem[] } | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void listFavoriteFoods().then((items) => {
      if (active) setFavorites(items);
    }).catch(() => {
      if (active) setError("즐겨찾기를 불러오지 못했어요. 닫고 다시 열어주세요.");
    }).finally(() => { if (active) setLoading(false); });
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchRef.current?.focus();
    return () => {
      active = false;
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const close = () => {
    if (busy) return;
    if (editing && !window.confirm("저장하지 않은 즐겨찾기 수정을 닫을까요?")) return;
    onClose();
  };

  const handleKeys = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const focusable = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex="0"]'
    ) ?? []).filter((element) => !element.matches(":disabled"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await saveFavoriteFood(editing.foods[0], editing.id);
      setFavorites(await listFavoriteFoods());
      setEditing(null);
      setQuery("");
      onNotify("즐겨찾기를 저장했어요. 식단에는 추가 버튼으로 넣어주세요.");
    } catch (err) { setError(err instanceof Error ? err.message : "즐겨찾기를 저장하지 못했어요."); }
    finally { setBusy(false); }
  };

  const remove = async (favorite: FavoriteFood) => {
    if (!window.confirm(`‘${favorite.name}’ 즐겨찾기를 삭제할까요? 이미 저장한 식단 기록은 유지됩니다.`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteFavoriteFood(favorite.id);
      setFavorites((items) => items.filter((item) => item.id !== favorite.id));
      onNotify("즐겨찾기만 삭제했어요. 기존 식단 기록은 그대로예요.");
    } catch { setError("삭제하지 못했어요. 다시 시도해주세요."); }
    finally { setBusy(false); }
  };

  const visible = favorites.filter((favorite) =>
    `${favorite.name} ${favorite.amountText}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="bottom-sheet favorite-sheet" role="dialog" aria-modal="true"
        aria-labelledby="favorites-title" ref={sheetRef} onKeyDown={handleKeys}>
        <header className="bottom-sheet__header">
          <div><p className="eyebrow">내 기기에 저장 · API 사용 없음</p><h2 id="favorites-title">음식 즐겨찾기</h2></div>
          <button className="icon-button" type="button" aria-label="즐겨찾기 닫기" disabled={busy} onClick={close}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {error && <p className="favorite-error" role="alert">{error}</p>}
        {editing ? (
          <div className="favorite-sheet__body">
            <p className="field-help">이 양을 기준으로 영양성분을 저장해요. 기존 식단에는 영향을 주지 않아요.</p>
            <FoodEditor foods={editing.foods} onChange={(foods) => setEditing({ ...editing, foods })}
              disabled={busy} singleFood allowFavorites={false} />
            <div className="bottom-sheet__actions">
              <button type="button" className="secondary-button" disabled={busy}
                onClick={() => { setEditing(null); setError(""); }}>수정 취소</button>
              <button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>즐겨찾기 저장</button>
            </div>
          </div>
        ) : (
          <>
            <label className="field"><span>즐겨찾기 검색</span>
              <input ref={searchRef} type="search" value={query} placeholder="음식 이름이나 양 검색"
                onChange={(event) => setQuery(event.target.value)} />
            </label>
            <button className="secondary-button favorite-new" type="button" disabled={busy || loading}
              onClick={() => { setEditing({ foods: [createEmptyFood()] }); setError(""); }}>
              <Plus size={17} aria-hidden="true" />새 즐겨찾기 직접 입력
            </button>
            <div className="favorite-sheet__body">
              {loading ? <p role="status">즐겨찾기를 불러오는 중…</p> : (
                <>
                  <p className="field-help">{visible.length}개 음식 · 추가 후 양과 배율을 조정할 수 있어요.</p>
                  {!favorites.length && <div className="empty-inline"><Star size={24} aria-hidden="true" />
                    <p>자주 먹는 음식을 저장해보세요.</p><p>기록 상세나 숫자 입력 화면의 ‘즐겨찾기에 저장’을 누르거나, 위에서 직접 입력하세요.</p>
                  </div>}
                  {favorites.length > 0 && !visible.length && <p className="empty-inline">검색 결과가 없습니다.</p>}
                  <div className="favorite-list">
                    {visible.map((favorite) => (
                      <article className="favorite-item" key={favorite.id}>
                        <strong>{favorite.name}</strong><p>{favorite.amountText || "양 미입력"} · {formatKcal(favorite.nutrients.energyKcal)}</p>
                        <p>{formatMacroLine(favorite.nutrients)}</p>
                        <div className="favorite-item__actions">
                          <button type="button" className="secondary-button" disabled={busy}
                            aria-label={`${favorite.name} 추가`} onClick={() => { onPick(foodFromFavorite(favorite)); onClose(); }}>
                            <Plus size={16} aria-hidden="true" />추가
                          </button>
                          <button type="button" className="icon-button" disabled={busy} aria-label={`${favorite.name} 즐겨찾기 수정`}
                            onClick={() => { setEditing({ id: favorite.id, foods: [foodFromFavorite(favorite)] }); setError(""); }}>
                            <Edit3 size={18} aria-hidden="true" />
                          </button>
                          <button type="button" className="icon-button icon-button--danger" disabled={busy}
                            aria-label={`${favorite.name} 즐겨찾기 삭제`} onClick={() => void remove(favorite)}>
                            <Trash2 size={18} aria-hidden="true" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
