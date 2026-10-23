import { useMemo, useRef, useState, type PointerEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Minus, Plus, Settings } from "lucide-react";
import { addDays } from "../lib/date";
import { aggregateEnergy, movePeriod, periodStart, type EnergyPoint, type StatisticsUnit } from "../lib/energyBalance";
import "./StatisticsScreen.css";

const labels = { day: "일", week: "주", month: "월" } as const;
const number = (value: number) => Math.round(value).toLocaleString("ko-KR");
export const balanceLabel = (value: number) => value < 0 ? `적자 ${number(-value)} kcal`
  : value > 0 ? `흑자 ${number(value)} kcal` : "균형 0 kcal";

export default function StatisticsScreen({ points, todayDay, selectedDay, onOpenDay, onOpenSettings }: {
  points: EnergyPoint[];
  todayDay: string;
  selectedDay: string;
  onOpenDay: (date: string, section: "diet" | "metabolism") => void;
  onOpenSettings: () => void;
}) {
  const [unit, setUnit] = useState<StatisticsUnit>("day");
  const [end, setEnd] = useState(selectedDay || todayDay);
  const [count, setCount] = useState(30);
  const [focus, setFocus] = useState(selectedDay || todayDay);
  const grouped = useMemo(() => aggregateEnergy(points, unit), [points, unit]);
  const todayPeriod = periodStart(todayDay, unit);
  const endPeriod = periodStart(end > todayDay ? todayDay : end, unit);
  const earliest = grouped[0]?.date ?? todayPeriod;
  const maxCount = Math.max(3, unit === "day" ? Math.round((Date.parse(todayPeriod) - Date.parse(earliest)) / 86400000) + 1
    : unit === "week" ? Math.round((Date.parse(todayPeriod) - Date.parse(earliest)) / (7 * 86400000)) + 1
      : (Number(todayPeriod.slice(0, 4)) - Number(earliest.slice(0, 4))) * 12 + Number(todayPeriod.slice(5, 7)) - Number(earliest.slice(5, 7)) + 1);
  const visibleCount = Math.max(3, Math.min(count, Math.max(30, maxCount)));
  const start = movePeriod(endPeriod, -(visibleCount - 1), unit);
  const byDate = new Map(grouped.map((point) => [point.date, point]));
  const dates = Array.from({ length: visibleCount }, (_, index) => movePeriod(start, index, unit));
  const visible = dates.flatMap((date) => byDate.has(date) ? [byDate.get(date)!] : []);
  const selected = byDate.get(periodStart(focus, unit));
  const sum = visible.reduce((total, point) => total + point.balance, 0);
  const scale = Math.max(100, ...visible.map((point) => Math.abs(point.balance))) * 1.15;
  const x = (index: number) => 48 + index / Math.max(1, visibleCount - 1) * 292;
  const y = (balance: number) => 114 - balance / scale * 83;
  const paths: string[] = [];
  let segment = "";
  dates.forEach((date, index) => {
    const point = byDate.get(date);
    if (!point) { if (segment) paths.push(segment); segment = ""; return; }
    segment += `${segment ? " L" : "M"}${x(index)} ${y(point.balance)}`;
  });
  if (segment) paths.push(segment);
  const selectedIndex = dates.indexOf(periodStart(focus, unit));
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ x: 0, end: endPeriod, count: visibleCount, distance: 0, moved: false, pinch: false });
  const clampEnd = (date: string) => date > todayPeriod ? todayPeriod : date < earliest ? earliest : date;
  const navigate = (amount: number) => {
    const date = clampEnd(movePeriod(endPeriod, amount, unit));
    setEnd(date); setFocus(date);
  };
  const zoom = (next: number) => setCount(Math.max(3, Math.min(Math.max(30, maxCount), Math.round(next))));
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const pointerDown = (event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) gesture.current = { x: event.clientX, end: endPeriod, count: visibleCount, distance: 0, moved: false, pinch: false };
    if (pointers.current.size === 2) gesture.current = { ...gesture.current, distance: distance(), count: visibleCount, moved: true, pinch: true };
  };
  const pointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const currentDistance = distance();
      if (currentDistance > 5 && gesture.current.distance > 5) zoom(gesture.current.count * gesture.current.distance / currentDistance);
    } else if (!gesture.current.pinch) {
      const delta = event.clientX - gesture.current.x;
      if (Math.abs(delta) > 8) {
        gesture.current.moved = true;
        const width = event.currentTarget.getBoundingClientRect().width || 360;
        setEnd(clampEnd(movePeriod(gesture.current.end, -Math.round(delta / width * gesture.current.count), unit)));
      }
    }
  };
  const pointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    if (!gesture.current.moved && !gesture.current.pinch) {
      const rect = event.currentTarget.getBoundingClientRect();
      const viewX = (event.clientX - rect.left) / (rect.width || 360) * 360;
      const index = Math.max(0, Math.min(visibleCount - 1, Math.round((viewX - 48) / 292 * (visibleCount - 1))));
      setFocus(dates[index]);
    }
    pointers.current.delete(event.pointerId);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const dateLabel = (date: string) => unit === "month" ? date.slice(0, 7).replace("-", ".")
    : unit === "week" ? `${date.slice(5).replace("-", ".")} 주` : date.slice(5).replace("-", ".");
  const focusPeriod = periodStart(focus, unit);
  const focusEnd = addDays(movePeriod(focusPeriod, 1, unit), -1);

  return <main className="screen statistics-screen">
    <header className="topbar"><div><p className="eyebrow">섭취와 소모의 흐름</p><h1>통계</h1></div>
      <button className="icon-button" type="button" aria-label="설정 열기" onClick={onOpenSettings}><Settings size={21} aria-hidden="true" /></button>
    </header>
    <div className="statistics-body">
      <div className="statistics-toolbar">
        <div className="statistics-units" aria-label="차트 집계 단위">
          {(["day", "week", "month"] as const).map((value) => <button type="button" key={value}
            aria-pressed={unit === value} onClick={() => {
              setUnit(value); setCount(value === "day" ? 30 : 12); setEnd(focus); pointers.current.clear();
            }}>{labels[value]}</button>)}
        </div>
        <label className="statistics-date"><CalendarDays size={16} aria-hidden="true" />
          <input aria-label="통계 기준 날짜" type="date" value={end} min={earliest} max={todayDay}
            onChange={(event) => { const date = event.target.value;
              if (date && date <= todayDay && date >= earliest) { setEnd(date); setFocus(date); }
            }} />
        </label>
      </div>
      <section className="statistics-focus" aria-label="선택 기간 칼로리 수지">
        <p>{focusPeriod}{unit !== "day" ? ` ~ ${focusEnd > todayDay ? todayDay : focusEnd}` : ""}</p>
        <strong className={selected && selected.balance > 0 ? "energy-surplus" : "energy-deficit"}>
          {selected ? balanceLabel(selected.balance) : "완료한 기록 없음"}</strong>
        {selected && <div><span>섭취 <b>{number(selected.intake)}</b></span><span>TDEE <b>{number(selected.tdee)}</b></span><small>kcal</small></div>}
      </section>
      <section className="statistics-chart-card" aria-label="칼로리 수지 차트">
        <div className="statistics-chart-heading"><span>칼로리 흑자·적자</span><small>kcal</small></div>
        <svg viewBox="0 0 360 240" role="img" aria-label={`${labels[unit]}별 칼로리 수지 꺾은선 그래프`}
          className="statistics-chart" tabIndex={0} onPointerDown={pointerDown} onPointerMove={pointerMove}
          onPointerUp={pointerUp} onPointerCancel={(event) => { pointers.current.delete(event.pointerId); gesture.current.moved = true; }}
          onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault(); const date = clampEnd(movePeriod(focusPeriod, event.key === "ArrowLeft" ? -1 : 1, unit));
            setFocus(date); if (date < start || date > endPeriod) setEnd(date);
          } }}>
          <title>기간을 넓히려면 두 손가락을 오므리고, 좁히려면 벌리세요. 좌우로 밀어 과거로 이동할 수 있어요.</title>
          {[-1, 0, 1].map((value) => <g key={value}><line x1="48" x2="340" y1={y(value * scale / 1.15)} y2={y(value * scale / 1.15)}
            className={value === 0 ? "chart-zero" : "chart-grid"} /><text x="42" y={y(value * scale / 1.15) + 4} textAnchor="end">{number(value * scale / 1.15)}</text></g>)}
          {paths.map((path, index) => <path key={index} d={path} className="energy-line" />)}
          {dates.map((date, index) => { const point = byDate.get(date); return point ? <circle key={date} cx={x(index)} cy={y(point.balance)} r={visibleCount > 90 ? 1.5 : 3} className={point.balance > 0 ? "chart-surplus" : "chart-deficit"} /> : null; })}
          {selectedIndex >= 0 && <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1="20" y2="208" className="chart-crosshair" />}
          {[0, Math.floor((visibleCount - 1) / 2), visibleCount - 1].map((index) => <text key={index} x={x(index)} y="230" textAnchor="middle">{dateLabel(dates[index])}</text>)}
        </svg>
        <div className="statistics-chart-controls">
          <button type="button" className="icon-button" aria-label="이전 기간" disabled={endPeriod <= earliest} onClick={() => navigate(-Math.max(1, Math.floor(visibleCount / 2)))}><ChevronLeft size={19} /></button>
          <button type="button" className="icon-button" aria-label="기간 넓히기" disabled={visibleCount >= Math.max(30, maxCount)} onClick={() => zoom(visibleCount * 1.5)}><Minus size={18} /></button>
          <button type="button" className="icon-button" aria-label="기간 좁히기" disabled={visibleCount <= 3} onClick={() => zoom(visibleCount / 1.5)}><Plus size={18} /></button>
          <button type="button" className="icon-button" aria-label="다음 기간" disabled={endPeriod >= todayPeriod} onClick={() => navigate(Math.max(1, Math.floor(visibleCount / 2)))}><ChevronRight size={19} /></button>
        </div>
        <p className="statistics-gesture-help">좌우로 이동 · 두 손가락을 오므려 기간 늘리기</p>
      </section>
      <section className="statistics-range-summary">
        <span>화면 기간 합계</span><strong>{visible.length ? balanceLabel(sum) : "—"}</strong>
        <small>{start} ~ {addDays(movePeriod(endPeriod, 1, unit), -1) > todayDay ? todayDay : addDays(movePeriod(endPeriod, 1, unit), -1)}</small>
      </section>
      <section className="statistics-history" aria-label="과거 칼로리 수지">
        <h2>{labels[unit]}별 기록</h2>
        {!visible.length && <p className="empty-inline">식단과 대사량 기록을 완료하면 여기에 표시돼요.</p>}
        {[...visible].reverse().map((point) => <div className="statistics-row" key={point.date}>
          <button type="button" className="statistics-row-main" aria-label={`${point.date} 수지 보기`}
            onClick={() => setFocus(point.date)}><span>{dateLabel(point.date)}</span>
            <strong className={point.balance > 0 ? "energy-surplus" : "energy-deficit"}>{balanceLabel(point.balance)}</strong>
            <small>섭취 {number(point.intake)} · TDEE {number(point.tdee)}</small></button>
          <div className="statistics-row-links"><button type="button" onClick={() => onOpenDay(point.date, "diet")}>식단</button>
            <button type="button" onClick={() => onOpenDay(point.date, "metabolism")}>대사량</button></div>
        </div>)}
      </section>
    </div>
  </main>;
}
