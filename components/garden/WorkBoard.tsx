'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BoardCard, BoardScope, BoardType, GrinderUpkeepRow } from '@/lib/garden/board';
import { BOARD_COLUMNS, BOARD_TYPES } from '@/lib/garden/board';
import BeanReceiveDialog from './BeanReceiveDialog';
import BeanReceivePicker from './BeanReceivePicker';
import type { ReceiveTarget } from '@/lib/garden/receive';
import GrinderUpkeep from './GrinderUpkeep';

// 작업 보드 — 브랜드별로 나뉜다. 가든(scope='garden')은 발주·리뷰·투두(+맨 아래 그라인더 관리 표),
// 스탭밀(scope='staffmeal')은 메뉴 스토리·송금. 카드마다 흐름의 현재 단계를 표시하고,
// 내 차례인 일은 위쪽 '내 차례'에 먼저 모아준다.
// 데이터는 /api/garden-board 가 권한(섹션·가든 탭·재무 역할)까지 적용해 내려준다.

const typeOf = (t: BoardType) => BOARD_TYPES.find((x) => x.id === t)!;

const dot = (color: string) => (
  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
);

const initials = (email: string) => {
  const name = email.split('@')[0].replace(/[._-]/g, ' ').trim();
  const parts = name.split(' ').filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
};

function Steps({ steps }: { steps: BoardCard['steps'] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
      {steps.map((s, i) => (
        <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {i > 0 && <span className="text-caption text-muted-foreground/50">▸</span>}
          <span
            className={`text-caption ${
              s.state === 'current'
                ? 'font-medium text-foreground'
                : s.state === 'done'
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/60'
            }`}
          >
            {s.label}
            {s.state === 'done' && ' ✓'}
          </span>
        </span>
      ))}
    </div>
  );
}

function Card({ card, onReceive }: { card: BoardCard; onReceive: (c: BoardCard) => void }) {
  const t = typeOf(card.type);
  return (
    <div
      className="rounded-md bg-background shadow-soft-sm"
      style={{
        padding: '11px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        // 내 카드만 얇은 아웃라인(레이아웃 영향 없음) — 보더 대신 그림자로 면을 만드는 소프트 UI 규칙
        outline: card.mine ? '1px solid hsl(var(--foreground))' : undefined,
        outlineOffset: -1,
      }}
    >
      <span className="text-caption text-muted-foreground" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {dot(t.color)}
        {t.label}
      </span>
      <p className="text-body font-medium text-foreground" style={{ margin: 0, lineHeight: 1.45 }}>
        {card.title}
      </p>
      <Steps steps={card.steps} />
      {card.progress != null && (
        <div style={{ height: 3, borderRadius: 2, background: 'hsl(var(--muted))', overflow: 'hidden' }}>
          <span
            style={{
              display: 'block',
              height: '100%',
              width: `${Math.max(2, Math.round(card.progress * 100))}%`,
              background: 'hsl(var(--foreground))',
            }}
          />
        </div>
      )}
      {card.meta.length > 0 && (
        <div className="tabular" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {card.meta.map((m, i) => (
            <span
              key={i}
              className="text-caption"
              style={{
                color:
                  m.tone === 'late'
                    ? 'hsl(0 72% 45%)'
                    : m.tone === 'ok'
                      ? 'hsl(var(--number-colored))'
                      : 'hsl(var(--muted-foreground))',
              }}
            >
              {m.text}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="text-caption text-muted-foreground" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {card.mine ? (
            <>
              <span
                style={{
                  width: 18, height: 18, borderRadius: 999, display: 'grid', placeItems: 'center',
                  fontSize: 11, background: 'hsl(var(--foreground))', color: 'hsl(var(--background))',
                }}
              >
                나
              </span>
              내 차례
            </>
          ) : card.assignees.length > 0 ? (
            <>
              <span
                style={{
                  width: 18, height: 18, borderRadius: 999, display: 'grid', placeItems: 'center',
                  fontSize: 11, background: 'hsl(var(--muted-foreground))', color: 'hsl(var(--background))',
                }}
              >
                {initials(card.assignees[0])}
              </span>
              {card.assignees[0].split('@')[0]}
              {card.assignees.length > 1 && ` 외 ${card.assignees.length - 1}`}
            </>
          ) : (
            '담당자 미지정'
          )}
        </span>
        <span style={{ flex: 1 }} />
        {/* 수령 카드는 화면 이동 없이 수령 창을 바로 연다 — 누를 수 없는 사람에겐 버튼을 숨긴다 */}
        {card.receive ? (
          card.receive.allowed && (
            <button
              type="button"
              onClick={() => onReceive(card)}
              className={card.mine ? 'ta-btn-primary' : 'ta-btn'}
              style={{ height: 28, paddingLeft: 10, paddingRight: 10, fontSize: 13, display: 'inline-flex', alignItems: 'center' }}
            >
              {card.actionLabel}
            </button>
          )
        ) : card.column !== 'done' && (
          <Link
            href={card.href}
            className={card.mine ? 'ta-btn-primary' : 'ta-btn'}
            style={{ height: 28, paddingLeft: 10, paddingRight: 10, fontSize: 13, display: 'inline-flex', alignItems: 'center' }}
          >
            {card.actionLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function WorkBoard({ scope = 'garden' }: { scope?: BoardScope }) {
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  // 그라인더 측정·얼라인 점검 — 카드가 아니라 맨 아래 표의 날짜 버튼(리마인더 없음)
  const [grinder, setGrinder] = useState<GrinderUpkeepRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'mine' | BoardType>('all');
  // 팀 전체 보드는 접힌 한 줄로 시작 — 첫 화면은 '내 차례'만(2026-09-09 소프트 UI 4단계)
  const [teamOpen, setTeamOpen] = useState(false);
  // 수령 카드에서 연 수령 창 — 저장하면 보드를 다시 불러온다
  // receiving = 수령 창에 올린 발주(+ 봉투를 먼저 찍었으면 읽은 값), pickerOpen = [원두 수령] 지점·봉투 선택 창
  const [receiving, setReceiving] = useState<{ target: ReceiveTarget; initial?: { beanEn?: string | null; roastDate?: string | null } } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [canReceive, setCanReceive] = useState(false);
  const [canNametag, setCanNametag] = useState(false);
  const openReceive = useCallback((c: BoardCard) => c.receive && setReceiving({ target: c.receive }), []);

  const load = useCallback(() => {
    fetch(`/api/garden-board?scope=${scope}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((j) => {
        setCards(Array.isArray(j.cards) ? j.cards : []);
        setGrinder(Array.isArray(j.grinder) ? j.grinder : []);
        setCanReceive(j.canReceive === true);
        setCanNametag(j.canNametag === true);
      })
      .catch(() => setCards([]));
  }, [scope]);

  useEffect(() => {
    load();
    // 세부 화면(레시피 설정 등)에 다녀오면 보드가 자동 갱신되도록 탭 복귀 시 재조회
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // 수령 대기 발주 — 수령 카드가 들고 온 조각. [원두 수령] 창이 지점별로 나눠 보여준다
  const receiveTargets = useMemo(
    () => (cards ?? []).flatMap((c) => (c.receive ? [c.receive] : [])),
    [cards]
  );
  const mineCards = useMemo(() => (cards ?? []).filter((c) => c.mine && c.column !== 'done'), [cards]);

  const shown = useMemo(() => {
    const list = cards ?? [];
    if (filter === 'all') return list;
    if (filter === 'mine') return list.filter((c) => c.mine);
    return list.filter((c) => c.type === filter);
  }, [cards, filter]);

  const countOf = (t: BoardType) => (cards ?? []).filter((c) => c.type === t).length;

  const chip = (active: boolean): string =>
    `ta-seg-item ${active ? 'ta-seg-on' : ''}`;

  if (cards === null) {
    return <p className="text-body text-muted-foreground">작업 보드를 불러오는 중…</p>;
  }

  const colCount = (id: string) => (cards ?? []).filter((c) => c.column === id).length;

  return (
    <div className="space-y-6">
      {pickerOpen && !receiving && (
        <BeanReceivePicker
          targets={receiveTargets}
          onClose={() => setPickerOpen(false)}
          onPick={(target, initial) => setReceiving({ target, initial })}
        />
      )}
      {receiving && (
        <BeanReceiveDialog
          key={receiving.target.id}
          record={receiving.target}
          initial={receiving.initial}
          onClose={() => {
            setReceiving(null);
            setPickerOpen(false);
          }}
          onSaved={() => load()}
        />
      )}
      {/* 내 차례 — 주 패널. 들어오자마자 자기 일이 먼저 보이게. 행동은 모든 행이 같은 텍스트 › (2026-11-19 대표 지시 — 첫 행만 검은 버튼이면 같은 행동이 다르게 보여 통일) */}
      <div className="ta-panel min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="text-title font-medium text-foreground">내 차례</span>
          <span
            className="tabular text-caption"
            style={{ padding: '1px 8px', borderRadius: 999, background: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}
          >
            {mineCards.length}
          </span>
          <span style={{ flex: 1 }} />
          {/* 네임택 프린트 — 브런치 네임택 고르기 화면으로 가는 지름길 (네임택 탭 권한이 있는 사람만 보인다, 2026-11-20) */}
          {canNametag && (
            <Link href="/garden/nametags" className="ta-btn" style={{ height: 34, paddingLeft: 14, paddingRight: 14, display: 'inline-flex', alignItems: 'center' }}>
              네임택 프린트
            </Link>
          )}
          {/* 원두 수령 — 지점 선택 → 받은 봉투 촬영 → 영문명 확정 → 원두카드 요청 (수령 담당만 보인다) */}
          {canReceive && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="ta-btn-primary"
              style={{ height: 34, paddingLeft: 14, paddingRight: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              📷 원두 수령
              {receiveTargets.length > 0 && <span className="tabular" style={{ opacity: 0.7 }}>{receiveTargets.length}</span>}
            </button>
          )}
        </div>
        {mineCards.length === 0 ? (
          <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
            지금 내 차례인 일은 없어요. 아래 보드에서 팀 전체 진행 상황을 볼 수 있습니다.
          </p>
        ) : (
          <div className="divide-y divide-border" style={{ display: 'flex', flexDirection: 'column' }}>
            {mineCards.map((c) => (
              <div
                key={c.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0' }}
              >
                {dot(typeOf(c.type).color)}
                <span className="text-body font-medium text-foreground">{c.title}</span>
                <span className="text-caption text-muted-foreground">
                  {c.mineReason}
                  {c.meta[0] ? ` · ${c.meta[0].text}` : ''}
                </span>
                <span style={{ flex: 1 }} />
                {c.receive ? (
                  c.receive.allowed && (
                    <button
                      type="button"
                      onClick={() => openReceive(c)}
                      className="whitespace-nowrap text-body text-foreground hover:underline"
                      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                    >
                      {c.actionLabel} ›
                    </button>
                  )
                ) : (
                  <Link href={c.href} className="whitespace-nowrap text-body text-foreground hover:underline">
                    {c.actionLabel} ›
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 팀 전체 — 접힌 한 줄. 펼치면 필터 + 3열 보드 */}
      <div className="ta-panel" style={{ display: 'flex', flexDirection: 'column', gap: teamOpen ? 24 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="text-body font-medium text-foreground">팀 전체</span>
        <span className="text-caption text-muted-foreground tabular">
          {BOARD_COLUMNS.map((col) => `${col.label} ${colCount(col.id)}`).join(' · ')}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setTeamOpen((v) => !v)}
          className="text-body text-foreground hover:underline"
          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
        >
          {teamOpen ? '접기' : '보드 ›'}
        </button>
      </div>
      {teamOpen && (<>
      {/* 필터 — 세그먼트 컨트롤(2026-09-10 옛 칩 교체) */}
      <div className="ta-seg flex-wrap">
        <button onClick={() => setFilter('all')} className={chip(filter === 'all')}>
          전체 <span className="tabular" style={{ opacity: 0.65 }}>{cards.length}</span>
        </button>
        <button onClick={() => setFilter('mine')} className={chip(filter === 'mine')}>
          내 것 <span className="tabular" style={{ opacity: 0.65 }}>{cards.filter((c) => c.mine).length}</span>
        </button>
        {BOARD_TYPES.filter((t) => countOf(t.id) > 0).map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={chip(filter === t.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {dot(t.color)}
            {t.label} <span className="tabular" style={{ opacity: 0.65 }}>{countOf(t.id)}</span>
          </button>
        ))}
      </div>

      {/* 보드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px 12px', alignItems: 'start' }}>
        {BOARD_COLUMNS.map((col) => {
          const list = shown.filter((c) => c.column === col.id);
          return (
            <div key={col.id} className="rounded-md bg-muted/40 p-6 min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="text-caption font-medium text-foreground" style={{ letterSpacing: '0.04em' }}>{col.label}</span>
                <span className="tabular text-caption text-muted-foreground">{list.length}</span>
              </div>
              {list.length === 0 ? (
                <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
                  {col.id === 'done' ? '아직 없음' : '—'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {list.map((c) => (
                    <Card key={c.id} card={c} onReceive={openReceive} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>)}
      </div>

      <GrinderUpkeep rows={grinder} />
    </div>
  );
}
