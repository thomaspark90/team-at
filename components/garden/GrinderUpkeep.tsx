import Link from 'next/link';
import type { GrinderUpkeepRow } from '@/lib/garden/board';
import { BOARD_TYPES } from '@/lib/garden/board';

// 그라인더 관리 — 작업 보드 맨 아래 표. 분쇄도 측정·얼라인 점검은 정기 리마인더나
// '내 차례' 카드로 띄우지 않고, 지점별 마지막 기록일만 버튼으로 둔다(2026-11-19 대표 결정).
// 행 = 작업, 열 = 지점. 버튼을 누르면 캘리브레이션 화면으로 간다.

const colorOf = (id: 'measure' | 'align') => BOARD_TYPES.find((t) => t.id === id)!.color;

const TASKS: {
  id: 'measure' | 'align';
  title: string;
  caption: string;
  pick: (r: GrinderUpkeepRow) => string | null;
}[] = [
  { id: 'measure', title: '6/8/10 × 3샷 측정', caption: '마지막 입력', pick: (r) => r.lastMeasure },
  { id: 'align', title: 'EK43 얼라인 점검', caption: '마지막 점검', pick: (r) => r.lastInspect },
];

export default function GrinderUpkeep({ rows }: { rows: GrinderUpkeepRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="ta-panel min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="text-body font-medium text-foreground">그라인더 관리</span>
        <span className="text-caption text-muted-foreground">마지막 기록일 · 누르면 기록 화면으로</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th />
            {rows.map((r) => (
              <th
                key={r.store}
                className="text-caption text-muted-foreground"
                style={{ fontWeight: 400, textAlign: 'right', padding: '0 0 8px 12px', whiteSpace: 'nowrap' }}
              >
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TASKS.map((t) => (
            <tr key={t.id} className="border-t border-border">
              <td style={{ padding: '10px 0' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span
                    aria-hidden
                    style={{ width: 7, height: 7, borderRadius: 2, background: colorOf(t.id), flexShrink: 0 }}
                  />
                  <span className="text-body font-medium text-foreground">{t.title}</span>
                  <span className="text-caption text-muted-foreground">{t.caption}</span>
                </span>
              </td>
              {rows.map((r) => {
                const date = t.pick(r);
                return (
                  <td key={r.store} style={{ padding: '10px 0 10px 12px', textAlign: 'right', width: 1 }}>
                    <Link
                      href="/garden/calibration"
                      aria-label={`${r.label} ${t.title} — ${t.caption} ${date ?? '기록 없음'}`}
                      className={`ta-btn tabular whitespace-nowrap ${date ? '' : 'text-muted-foreground'}`}
                      style={{ height: 28, paddingLeft: 10, paddingRight: 10, fontSize: 13 }}
                    >
                      {date ?? '기록 없음'}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
