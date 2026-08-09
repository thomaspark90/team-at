'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BoardCard, BoardScope, BoardType } from '@/lib/garden/board';
import { BOARD_COLUMNS, BOARD_TYPES } from '@/lib/garden/board';

// 작업 보드 — 브랜드별로 나뉜다. 가든(scope='garden')은 발주·측정·점검·리뷰·송금·투두,
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
          {i > 0 && <span className="text-[11px] text-muted-foreground/50">▸</span>}
          <span
            className={`text-[11px] ${
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

function Card({ card }: { card: BoardCard }) {
  const t = typeOf(card.type);
  return (
    <div
      className="rounded-lg border bg-background"
      style={{
        padding: '11px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderColor: card.mine ? 'hsl(var(--foreground))' : 'hsl(var(--border))',
      }}
    >
      <span className="text-[11px] text-muted-foreground" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {dot(t.color)}
        {t.label}
      </span>
      <p className="text-[13px] font-medium text-foreground" style={{ margin: 0, lineHeight: 1.45 }}>
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
              className="text-[11px]"
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
        <span className="text-[11px] text-muted-foreground" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
        {card.column !== 'done' && (
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
  const [filter, setFilter] = useState<'all' | 'mine' | BoardType>('all');

  useEffect(() => {
    fetch(`/api/garden-board?scope=${scope}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((j) => setCards(Array.isArray(j.cards) ? j.cards : []))
      .catch(() => setCards([]));
  }, [scope]);

  const mineCards = useMemo(() => (cards ?? []).filter((c) => c.mine && c.column !== 'done'), [cards]);

  const shown = useMemo(() => {
    const list = cards ?? [];
    if (filter === 'all') return list;
    if (filter === 'mine') return list.filter((c) => c.mine);
    return list.filter((c) => c.type === filter);
  }, [cards, filter]);

  const countOf = (t: BoardType) => (cards ?? []).filter((c) => c.type === t).length;

  const chip = (active: boolean): string =>
    `rounded-full border px-2.5 py-1 text-[13px] transition-colors ${
      active ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'
    }`;

  if (cards === null) {
    return <p className="text-[13px] text-muted-foreground">작업 보드를 불러오는 중…</p>;
  }

  return (
    <div className="divide-y divide-border">
      {/* 내 차례 — 들어오자마자 자기 일이 먼저 보이게 */}
      <div className="min-w-0 pb-[54px]" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="text-[15px] font-medium text-foreground">내 차례</span>
          <span
            className="tabular text-[11px]"
            style={{ padding: '1px 8px', borderRadius: 999, background: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}
          >
            {mineCards.length}
          </span>
        </div>
        {mineCards.length === 0 ? (
          <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>
            지금 내 차례인 일은 없어요. 아래 보드에서 팀 전체 진행 상황을 볼 수 있습니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {mineCards.map((c) => (
              <div
                key={c.id}
                className="rounded-lg bg-muted/40"
                style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px' }}
              >
                {dot(typeOf(c.type).color)}
                <span className="text-[13px] font-medium text-foreground">{c.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {c.mineReason}
                  {c.meta[0] ? ` · ${c.meta[0].text}` : ''}
                </span>
                <span style={{ flex: 1 }} />
                <Link
                  href={c.href}
                  className="ta-btn-primary"
                  style={{ height: 28, paddingLeft: 12, paddingRight: 12, fontSize: 13, display: 'inline-flex', alignItems: 'center' }}
                >
                  {c.actionLabel}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-[54px]" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* 필터 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                <span className="text-[11px] font-medium text-foreground" style={{ letterSpacing: '0.04em' }}>{col.label}</span>
                <span className="tabular text-[11px] text-muted-foreground">{list.length}</span>
              </div>
              {list.length === 0 ? (
                <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>
                  {col.id === 'done' ? '아직 없음' : '—'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {list.map((c) => (
                    <Card key={c.id} card={c} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
