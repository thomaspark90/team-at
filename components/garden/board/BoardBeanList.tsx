'use client';

import type { BrewType } from '@/lib/types';
import { flavorColors } from '@/lib/flavor-colors';
import { restStage, restTitle, type RestStage, type RoastInfo } from '@/lib/garden/roast';

// 레시피 보드 첫 화면 — 원두 이름만 한 줄에 하나씩(2026-11-25 대표 결정 시안 B → 대기 중 시안 C).
// 판매 중이 위, 그 아래 「대기 중 N」 제목과 함께 대기 원두(판매 대기 + 레시피 없는 원두)를 투명도 50%로.
// 한 줄 = 노트 색 막대 · 원두명 · 로스팅일 +NN · 레시피가 있는 타입(없으면 '레시피 없음') · ›
// 레시피 숫자는 여기서 보이지 않는다. 줄을 누르면 이름 고르는 창(BrewerPicker) → 추출 화면(BrewScreen).
// 줄 모양은 globals.css 의 .fc-beanrow / .fc-beanrow-wait.

export interface BoardBeanRow {
  beanKey: string;
  bean: string;
  tasting: string;
  types: BrewType[]; // 이 지점에서 볼 수 있는 레시피 타입 — HOT 먼저. 비어 있으면 '레시피 없음'
  roast: RoastInfo | null; // 최근 발주의 로스팅일(안 적었으면 발주일+1 추정). 발주 기록이 없으면 null
}

// 줄 앞 세로 막대 — 노트 대표색 위에서 아래로. 노트가 없으면 회색
const barStyle = (tasting: string): React.CSSProperties => {
  const cs = flavorColors(tasting);
  if (cs.length === 0) return {};
  return { backgroundImage: `linear-gradient(180deg, ${cs[0]}, ${cs[cs.length - 1]})` };
};

// 「+NN」 글자색 — 필터커피 화면의 D+ 와 같은 단계 규칙(7일 미만 · 22~30일 주황, 7~21일 초록, 31일~ 빨강).
// 클래스 이름은 이 파일에 둔다 — Tailwind 가 app · components 만 훑어서 lib 에만 적은 클래스는 만들어지지 않는다
const restTextClass: Record<RestStage, string> = {
  resting: 'text-amber-700 dark:text-amber-400',
  peak: 'text-emerald-700 dark:text-emerald-400',
  late: 'text-amber-700 dark:text-amber-400',
  old: 'text-destructive',
};

// 'YYYY-MM-DD' → 'MM.DD'
const md = (ymd: string) => `${ymd.slice(5, 7)}.${ymd.slice(8, 10)}`;

function Row({ r, waiting, isMobile, onPick }: { r: BoardBeanRow; waiting: boolean; isMobile: boolean; onPick: (beanKey: string) => void }) {
  return (
    <button type="button" className={`fc-beanrow${waiting ? ' fc-beanrow-wait' : ''}`} onClick={() => onPick(r.beanKey)}>
      <span className="bg-muted" style={{ width: 8, height: 44, borderRadius: 999, flexShrink: 0, ...barStyle(r.tasting) }} />
      {/* 원두명 + 로스팅일 — 넓은 화면은 한 줄, 휴대폰은 로스팅일을 이름 아래 줄로 */}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'baseline',
          gap: isMobile ? 3 : 18,
        }}
      >
        {/* 원두명은 자르지 않고 줄바꿈 — 한글은 어절 단위 */}
        <span className="text-title font-medium" style={{ flex: isMobile ? 'none' : 1, minWidth: 0, lineHeight: 1.3, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
          {r.bean}
        </span>
        {r.roast && (
          <span className="tabular text-caption text-muted-foreground" style={{ whiteSpace: 'nowrap' }} title={restTitle(r.roast)}>
            로스팅 {md(r.roast.date)}
            {r.roast.estimated && ' 추정'}
            {/* 로스팅 후 지난 날수 — 색은 필터커피 화면의 D+ 와 같은 단계 규칙 */}
            <span
              className={`${isMobile ? 'text-caption' : 'text-body'} font-medium ${restTextClass[restStage(r.roast.days)]}`}
              style={{ display: 'inline-block', minWidth: isMobile ? 0 : 34, marginLeft: isMobile ? 6 : 8, textAlign: 'right' }}
            >
              +{r.roast.days}
            </span>
          </span>
        )}
      </span>
      <span className="text-caption text-muted-foreground" style={{ whiteSpace: 'nowrap', minWidth: isMobile ? 0 : 62, textAlign: 'right' }}>
        {r.types.length > 0 ? r.types.map((t) => t.toUpperCase()).join(' · ') : '레시피 없음'}
      </span>
      <span className="text-title text-muted-foreground" aria-hidden="true" style={{ lineHeight: 1 }}>
        ›
      </span>
    </button>
  );
}

export default function BoardBeanList({
  selling,
  waiting,
  isMobile,
  onPick,
}: {
  selling: BoardBeanRow[]; // 판매 중
  waiting: BoardBeanRow[]; // 대기 중 — 판매 대기(레시피 있음) 먼저, 레시피 없는 원두가 뒤
  isMobile: boolean;
  onPick: (beanKey: string) => void;
}) {
  return (
    // 아래 여백 — 오른쪽 아래 「아카이브」 고정 버튼이 마지막 줄을 가리지 않게
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobile ? '4px 16px 96px' : '4px 20px 96px' }}>
      {selling.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {selling.map((r) => (
            <Row key={r.beanKey} r={r} waiting={false} isMobile={isMobile} onPick={onPick} />
          ))}
        </div>
      )}
      {waiting.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: selling.length > 0 ? '28px 6px 10px' : '8px 6px 10px' }}>
            <span className="text-body font-medium">대기 중</span>
            <span className="tabular text-caption text-muted-foreground">{waiting.length} · 아직 판매 전</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {waiting.map((r) => (
              <Row key={r.beanKey} r={r} waiting isMobile={isMobile} onPick={onPick} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
