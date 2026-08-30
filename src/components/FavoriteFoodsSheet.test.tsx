import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EMPTY_NUTRIENTS } from "../constants";
import { db } from "../lib/db";
import { saveFavoriteFood } from "../lib/favorites";
import FavoriteFoodsSheet from "./FavoriteFoodsSheet";
import SaveFavoriteButton from "./SaveFavoriteButton";

beforeEach(async () => { await db.favoriteFoods.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

test("음식별 저장 버튼은 해당 음식의 모든 영양소를 저장한다", async () => {
  const notify = vi.fn();
  render(<SaveFavoriteButton onNotify={notify} food={{ id: "ai-food", name: "삶은 달걀", amountText: "1개",
    nutrients: { ...EMPTY_NUTRIENTS, energyKcal: 75, proteinG: 6, sodiumMg: 60 }, source: "ai", userEdited: false }} />);
  fireEvent.click(screen.getByRole("button", { name: "삶은 달걀 즐겨찾기에 저장" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("즐겨찾기에 저장했어요."));
  const [saved] = await db.favoriteFoods.toArray();
  expect(saved).toMatchObject({ name: "삶은 달걀", amountText: "1개", nutrients: { energyKcal: 75, proteinG: 6, sodiumMg: 60, fiberG: null } });
  expect(saved.id).not.toBe("ai-food");
});

test("즐겨찾기를 직접 등록하고 검색하여 기록에 추가할 수 있다", async () => {
  const pick = vi.fn();
  const close = vi.fn();
  render(<FavoriteFoodsSheet onPick={pick} onClose={close} onNotify={vi.fn()} />);
  await screen.findByText("자주 먹는 음식을 저장해보세요.");
  fireEvent.click(screen.getByRole("button", { name: "새 즐겨찾기 직접 입력" }));
  fireEvent.change(screen.getByLabelText("음식명"), { target: { value: "현미밥" } });
  fireEvent.change(screen.getByLabelText("먹은 양"), { target: { value: "반 공기" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: /칼로리/ }), { target: { value: "150" } });
  fireEvent.click(screen.getByRole("button", { name: "즐겨찾기 저장" }));
  await screen.findByRole("button", { name: "현미밥 추가" });
  fireEvent.change(screen.getByLabelText("즐겨찾기 검색"), { target: { value: "없는 음식" } });
  expect(screen.getByText("검색 결과가 없습니다.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("즐겨찾기 검색"), { target: { value: "반 공기" } });
  fireEvent.click(screen.getByRole("button", { name: "현미밥 추가" }));
  expect(pick).toHaveBeenCalledWith(expect.objectContaining({ name: "현미밥", source: "copied", nutrients: expect.objectContaining({ energyKcal: 150, proteinG: null }) }));
  expect(close).toHaveBeenCalledTimes(1);
});

test("즐겨찾기 수정 후 삭제 확인을 거친다", async () => {
  const original = await saveFavoriteFood({ name: "요거트", amountText: "1개", nutrients: { ...EMPTY_NUTRIENTS, energyKcal: 100 } });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<FavoriteFoodsSheet onPick={vi.fn()} onClose={vi.fn()} onNotify={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "요거트 즐겨찾기 수정" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: /칼로리/ }), { target: { value: "120" } });
  fireEvent.click(screen.getByRole("button", { name: "즐겨찾기 저장" }));
  await screen.findByRole("button", { name: "요거트 추가" });
  expect((await db.favoriteFoods.get(original.id))?.nutrients.energyKcal).toBe(120);
  fireEvent.click(screen.getByRole("button", { name: "요거트 즐겨찾기 삭제" }));
  expect(await db.favoriteFoods.count()).toBe(1);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "요거트 즐겨찾기 삭제" }));
  await screen.findByText("자주 먹는 음식을 저장해보세요.");
  expect(await db.favoriteFoods.count()).toBe(0);
});

test("키보드로 닫고 원래 포커스로 돌아올 수 있다", async () => {
  const close = vi.fn();
  render(<FavoriteFoodsSheet onPick={vi.fn()} onClose={close} onNotify={vi.fn()} />);
  const dialog = screen.getByRole("dialog", { name: "음식 즐겨찾기" });
  await within(dialog).findByText("자주 먹는 음식을 저장해보세요.");
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(close).toHaveBeenCalledTimes(1);
});
