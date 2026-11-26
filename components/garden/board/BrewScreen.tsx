'use client';

import type { BrewType, DripRecipe, StoreId } from '@/lib/types';
import { flavorGradient } from '@/lib/flavor-colors';
import { honorific } from '@/lib/staff/names';
import { brewOnStyle } from '@/lib/garden/brew-colors';
import { EDIT_SUGGEST_MIN } from '@/lib/garden/brew-feedback';
import { bypassOf, drinkG } from '@/lib/garden/bypass';
import { pourName } from '@/lib/garden/pour-name';

// 추출 화면 — 이름을 누르고 들어오면 그 원두의 레시피가 화면 전체에 크게 뜬다(2026-11-25 대표 결정).
// 위쪽에 누가 추출 중인지, HOT · ICE 는 여기서 고른다(기본 HOT). 타이머 없음(저울 타이머 사용).
// 대기 중(판매 전) 원두는 연습 — 이름 옆에 「연습」 표시, 버튼은 [연습 끝 · 평가 남기기](2026-11-26).
// 지금 레시피에 수정 의견이 2건 이상 쌓인 타입은 HOT · ICE 위에 작은 말풍선 「수정 제안」(2026-11-26) — 누르면 의견 · 레시피 수정.
// 나가는 길은 [추출 끝 · 평가 남기기] — 평가 없이 닫는 버튼은 두지 않는다. 잘못 눌러 들어온 경우만 「← 라인업」.

const BREW_TYPES: BrewType[] = ['hot', 'ice'];
const plainBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' };
const rowGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr auto 88px', gap: 16, alignItems: 'baseline', padding: '13px 0' };

export default function BrewScreen({
  bean,
  tasting,
  store,
  staff,
  practice = false,
  bt,
  onBtChange,
  recipes,
  fallback,
  storeMesh,
  opinionCount,
  suggest = {},
  onSuggest,
  isMobile,
  onBack,
  onEdit,
  onFinish,
}: {
  bean: string;
  tasting: string;
  store: StoreId;
  staff: string; // 들어올 때 고른 이름
  practice?: boolean; // 대기 중(판매 전) 원두 — 레시피 세팅 · 연습 추출
  bt: BrewType;
  onBtChange: (bt: BrewType) => void;
  recipes: Record<BrewType, DripRecipe | null>; // 저장된 레시피만 — 없는 타입은 고를 수 없다
  fallback: Partial<Record<BrewType, boolean>>; // 판교 화면에서 양재천 레시피를 대신 보여주는 타입
  storeMesh: (r: DripRecipe) => { text: string | null; value: number | null };
  opinionCount: number; // 이 레시피 버전에 쌓인 의견 수
  suggest?: Partial<Record<BrewType, number>>; // 타입별 수정 의견 수(지금 레시피 버전) — 기준(2건) 이상이면 그 타입 위에 「수정 제안」 말풍선
  onSuggest?: (bt: BrewType) => void; // 말풍선을 누르면 그 타입의 의견 · 레시피 수정으로
  isMobile: boolean;
  onBack: () => void;
  onEdit: () => void; // 의견 · 레시피 수정
  onFinish: () => void; // 추출 끝 · 평가 남기기
}) {
  const r = recipes[bt];
  if (!r) return null;
  const mesh = storeMesh(r);
  const ratio = r.doseG && r.waterG ? `1:${(r.waterG / r.doseG).toFixed(1)}` : null;
  const pad = isMobile ? 16 : 28;
  const bubbleOn = (t: BrewType) => !!recipes[t] && (suggest[t] ?? 0) >= EDIT_SUGGEST_MIN;
  const anyBubble = BREW_TYPES.some(bubbleOn); // 말풍선이 뜰 때만 윗줄을 그만큼 높인다
  return (
    <div className="bg-background text-foreground" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          columnGap: 16,
          rowGap: 10,
          padding: `${anyBubble ? 38 : 14}px ${pad}px 14px`,
        }}
      >
        <button onClick={onBack} className="text-body text-muted-foreground hover:text-foreground" style={{ ...plainBtn, whiteSpace: 'nowrap' }}>
          ← 라인업
        </button>
        <h1
          className="text-title font-medium"
          style={{ margin: 0, flex: isMobile ? '1 0 100%' : 1, order: isMobile ? 3 : 0, minWidth: 0, lineHeight: 1.3, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
        >
          {bean}
        </h1>
        {isMobile && <span style={{ flex: 1 }} />}
        <div className="ta-seg" style={{ flexShrink: 0 }}>
          {BREW_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => onBtChange(t)}
              disabled={!recipes[t]}
              className={`ta-seg-item ${t === bt ? 'ta-seg-on' : ''} disabled:cursor-default disabled:opacity-30`}
              style={{ position: 'relative', minWidth: 64, ...(t === bt ? brewOnStyle(t) : {}) }}
              title={recipes[t] ? undefined : `${t.toUpperCase()} 레시피 없음`}
            >
              {t.toUpperCase()}
              {/* 수정 제안 — 이 레시피 버전에 수정 의견이 2건 이상 쌓였다(2026-11-26 대표 지시). 누르면 그 타입의 의견 · 레시피 수정으로 */}
              {bubbleOn(t) && (
                <span
                  className="fc-bubble text-caption"
                  title={`수정 의견 ${suggest[t]}건 — 눌러서 의견 · 레시피 수정으로`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSuggest?.(t);
                  }}
                >
                  수정 제안
                </span>
              )}
            </button>
          ))}
        </div>
        {practice && (
          <span className="fc-practice text-caption" title="대기 중(판매 전) 원두 — 레시피 세팅 · 연습 추출">
            연습
          </span>
        )}
        <span
          className="bg-primary text-body font-medium text-primary-foreground"
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 999, whiteSpace: 'nowrap' }}
          title="추출하는 사람"
        >
          {honorific(staff)}
        </span>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `0 ${pad}px 24px` }}>
        <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? 24 : 28 }}>
          {/* 노트 색 — 보드 카드와 같은 얇은 띠 */}
          <div className="bg-muted" style={{ height: 6, borderRadius: 999, backgroundImage: flavorGradient(tasting) ?? undefined }} />

          {fallback[bt] && (
            <p className="text-caption text-muted-foreground" style={{ margin: '-8px 0 0' }}>
              판교 레시피 없음 · 양재천 레시피 기준(분쇄도는 판교 환산)
            </p>
          )}

          {/* 큰 숫자 한 줄(모바일은 2 × 2) — 숫자 위, 라벨은 아래 옅게 */}
          <div className="tabular" style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, minmax(0, 1fr))`, columnGap: 16, rowGap: 24 }}>
            <Stat label="도징량" value={r.doseG != null ? `${r.doseG}g` : null} />
            <Stat label="추출량" value={r.waterG != null ? `${r.waterG}g` : null} />
            <Stat label="온도" value={r.tempC != null ? `${r.tempC}°` : null} />
            <Stat label="분쇄도 EK43" value={mesh.text} warn={mesh.text === '재측정 필요'} />
          </div>

          {r.pours && r.pours.length > 0 && (
            <div className="tabular text-title" style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--fc-line)' }}>
              {r.pours.map((s, i) => {
                const cum = r.pours!.slice(0, i + 1).reduce((a, x) => a + x.water, 0);
                return (
                  <div key={i} style={{ ...rowGrid, borderTop: '1px solid var(--fc-line)' }}>
                    <span className="text-muted-foreground">
                      {s.at ? `${s.at} ` : ''}
                      {pourName(s.label, i)}
                    </span>
                    <span>{s.water}g</span>
                    <span className="text-muted-foreground" style={{ textAlign: 'right' }}>
                      {cum}g
                    </span>
                  </div>
                );
              })}
              {/* 가수 — 추출이 끝난 뒤 서버에 더하는 물. 오른쪽은 음료량(추출량 + 가수) */}
              {bypassOf(r) > 0 && (
                <div style={{ ...rowGrid, borderTop: '1px solid var(--fc-line)' }}>
                  <span className="text-muted-foreground">가수 (추출 후)</span>
                  <span>+{bypassOf(r)}g</span>
                  <span className="text-muted-foreground" style={{ textAlign: 'right' }}>
                    {drinkG(r) != null ? `${drinkG(r)}g` : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {r.notes && (
            <p className="text-body text-muted-foreground" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {r.notes}
            </p>
          )}

          {/* 추출비 · 노트 · 추출 시간 */}
          <div
            className="tabular text-body"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 20, rowGap: 6 }}
          >
            <span style={{ whiteSpace: 'nowrap' }}>{ratio && `추출비: ${ratio}`}</span>
            {tasting && (
              <span className="text-muted-foreground" style={{ flex: isMobile ? '1 0 100%' : 1, order: isMobile ? 3 : 0, textAlign: isMobile ? 'left' : 'center', wordBreak: 'keep-all' }}>
                {tasting}
              </span>
            )}
            <span style={{ whiteSpace: 'nowrap' }}>{r.totalTime && `추출 시간: ${r.totalTime}`}</span>
          </div>
        </div>
      </div>

      {/* 아래 고정 줄 — 왼쪽 글자 버튼(의견 · 레시피 수정), 오른쪽이 이 화면의 주 버튼 */}
      <footer
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: `14px ${pad}px calc(14px + env(safe-area-inset-bottom, 0px))`,
          borderTop: '1px solid var(--fc-line)',
        }}
      >
        <button onClick={onEdit} className="tabular text-body text-muted-foreground underline hover:text-foreground" style={{ ...plainBtn, textUnderlineOffset: 4, whiteSpace: 'nowrap' }}>
          의견 {opinionCount} · 레시피 수정
        </button>
        <span style={{ flex: 1 }} />
        <button onClick={onFinish} className="ta-btn-primary font-medium" style={{ height: 52, padding: '0 26px' }}>
          {practice ? '연습 끝 · 평가 남기기' : '추출 끝 · 평가 남기기'}
        </button>
      </footer>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string | null; warn?: boolean }) {
  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        className={warn ? 'text-body text-amber-600 dark:text-amber-500' : 'text-display'}
        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 }}
      >
        {value ?? '—'}
      </div>
      <div className="text-caption text-muted-foreground" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </div>
    </div>
  );
}
