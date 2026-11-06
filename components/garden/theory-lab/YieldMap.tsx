'use client';

import { BATALI_AXIS, MAP_ARROWS, MAP_AXIS, MAP_LABELS, MAP_STANDARD_BOX } from '@/lib/garden/extraction-lab';

// 수율–농도 맛 방향 지도 — 드립 패널 데이터(Guinard 2023). 눈금을 일부러 두지 않는다(에스프레소와 척도가 다름).
const W = 560;
const H = 400;
const M = { l: 56, t: 40, r: 16, b: 48 };
const x0 = M.l;
const x1 = W - M.r;
const y0 = M.t;
const y1 = H - M.b;
const fx = (ey: number) => x0 + ((ey - MAP_AXIS.ey[0]) / (MAP_AXIS.ey[1] - MAP_AXIS.ey[0])) * (x1 - x0);
const fy = (tds: number) => y1 - ((tds - MAP_AXIS.tds[0]) / (MAP_AXIS.tds[1] - MAP_AXIS.tds[0])) * (y1 - y0);
const AXIS = 'var(--chart-axis-text)';
const GRID = 'var(--chart-grid-stroke)';

export function YieldMap() {
  const box = MAP_STANDARD_BOX;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="수율과 농도에 따른 맛 방향 지도(드립 데이터)">
      <defs>
        <marker id="ymap-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={AXIS} />
        </marker>
      </defs>
      {/* 상단 안내 + 드립 표식 */}
      <text x={x0} y={y0 - 16} fontSize={11} fill={AXIS}>
        {"'단맛'은 당이 아니라 단 인상 · 글자 크기 = 패널 강도 · 점선 화살표 = 에스프레소 조작의 방향(해석)"}
      </text>
      <rect x={x1 - 88} y={y0 - 32} width={88} height={20} rx={10} fill="var(--chart-cat-8)" fillOpacity={0.12} />
      <text x={x1 - 44} y={y0 - 18} fontSize={12} fontWeight={500} fill="var(--chart-cat-8)" textAnchor="middle">드립 데이터</text>

      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke={GRID} />
      <line x1={(x0 + x1) / 2} x2={(x0 + x1) / 2} y1={y0} y2={y1} stroke={GRID} strokeDasharray="3 4" />
      <line x1={x0} x2={x1} y1={(y0 + y1) / 2} y2={(y0 + y1) / 2} stroke={GRID} strokeDasharray="3 4" />

      {/* 축 화살표 */}
      <line x1={x0} x2={x1 - 6} y1={y1 + 22} y2={y1 + 22} stroke={AXIS} markerEnd="url(#ymap-arrow)" />
      <text x={(x0 + x1) / 2} y={y1 + 40} fontSize={12} fill={AXIS} textAnchor="middle">수율 ↑ (더 많이 녹여냄)</text>
      <line x1={x0 - 22} x2={x0 - 22} y1={y1} y2={y0 + 6} stroke={AXIS} markerEnd="url(#ymap-arrow)" />
      <text x={x0 - 30} y={(y0 + y1) / 2} fontSize={12} fill={AXIS} textAnchor="middle" transform={`rotate(-90 ${x0 - 30} ${(y0 + y1) / 2})`}>농도 ↑ (더 진함)</text>

      {/* 저자들의 Classic Standard 상자 */}
      <rect x={fx(box.ey[0])} y={fy(box.tds[1])} width={fx(box.ey[1]) - fx(box.ey[0])} height={fy(box.tds[0]) - fy(box.tds[1])} fill="hsl(var(--accent))" stroke={AXIS} strokeDasharray="4 3" />
      <text x={fx((box.ey[0] + box.ey[1]) / 2)} y={fy((box.tds[0] + box.tds[1]) / 2) + 4} fontSize={12} fill={AXIS} textAnchor="middle">드립 표준 영역</text>

      {MAP_LABELS.map((l) => (
        <text key={l.text} x={fx(l.ey)} y={fy(l.tds)} fontSize={l.size} fill={l.color} fontWeight={l.strong ? 500 : 400} textAnchor="middle">
          {l.text}
        </text>
      ))}

      {MAP_ARROWS.map((a) => {
        const up = a.to[1] > a.from[1];
        return (
          <g key={a.text}>
            <line x1={fx(a.from[0])} y1={fy(a.from[1])} x2={fx(a.to[0])} y2={fy(a.to[1])} stroke="hsl(var(--foreground))" strokeWidth={1.5} strokeDasharray="5 4" markerEnd="url(#ymap-arrow)" />
            <text x={fx(a.to[0])} y={fy(a.to[1]) + (up ? -8 : 14)} fontSize={11} fill="hsl(var(--foreground))" textAnchor="middle">
              {a.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const th = 'px-3 py-1.5 text-left text-caption font-normal tracking-[0.04em] text-muted-foreground';
const td = 'border-t border-border px-3 py-1.5 align-top text-body';

export function BataliAxisTable() {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={th}>속성</th>
          <th className={`${th} text-right`}>농도 1.0→1.5%</th>
          <th className={`${th} text-right`}>수율 16→24%</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {BATALI_AXIS.map((r) => (
          <tr key={r.label}>
            <td className={td}>{r.label}</td>
            <td className={`${td} text-right ${r.tdsNs ? 'text-muted-foreground' : ''}`}>{r.tds}{r.tdsNs ? ' (n.s.)' : ''}</td>
            <td className={`${td} text-right ${r.peNs ? 'text-muted-foreground' : ''}`}>{r.pe}{r.peNs ? ' (n.s.)' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
