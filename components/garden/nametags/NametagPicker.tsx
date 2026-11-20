'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/components/Toast';
import { MAX_QTY, deliveryText, groupByCategory, oneLine, type NametagContact, type NametagItem, type NametagRequest } from '@/lib/garden/nametags';
import ContactList from './ContactList';
import { ACT_SUB, API, call, failed, fmtWhen, jsonInit, lineLabel, nameOf, summaryOf, type NametagData } from './shared';

// 브런치 네임택 고르기 — 카테고리별로 내려가며 필요한 메뉴만 체크하고 한 번에 프린트를 요청한다.
// 휴대폰 한 손 사용 기준: 행 전체가 누르는 영역, 요청 버튼은 화면 아래에 붙어 있다.
// 글자만으로 구분한다(2026-11-20 대표 결정 — 시안 C): 칩·체크 원·장수 상자·검은 버튼 없이
//   탭 = 굵은 밑줄 + 굵게 / 고른 메뉴 = 앞에 ✓ 글자 + 굵게 / 요청하기 = 굵은 윗선 아래 글자.
// 위쪽 탭으로 카테고리를 고르고, 목록을 좌우로 쓸어 넘기면 옆 카테고리로 간다('전체'는 모든 카테고리를 한 줄로 이어 본다).

const ALL = '_all';
const SWIPE_MIN = 60; // px — 이보다 짧은 가로 움직임은 스크롤 중 흔들림으로 본다

export default function NametagPicker() {
  const [data, setData] = useState<NametagData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({}); // itemId → 장수
  const [query, setQuery] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [active, setActive] = useState<string>(ALL);
  const chipRefs = useRef<Record<string, HTMLElement | null>>({});
  const touch = useRef<{ x: number; y: number } | null>(null);

  const load = useCallback(async () => {
    const j = await call<NametagData>(API);
    if (failed(j)) return setError(j.error);
    setError(null);
    setData(j);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const all = groupByCategory(data.catalog);
    if (!q) return all;
    return all
      .map((g) => ({ ...g, items: g.items.filter((i) => `${i.ko} ${i.en}`.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [data, query]);

  const byId = useMemo(() => new Map((data?.catalog.items ?? []).map((i) => [i.id, i])), [data]);
  // 고른 순서가 아니라 목록 순서로 — 인쇄물도 카테고리 순서로 나온다
  const lines = useMemo(
    () =>
      (data ? groupByCategory(data.catalog) : [])
        .flatMap((g) => g.items)
        .filter((i) => picked[i.id])
        .map((i) => ({ itemId: i.id, ko: i.ko, qty: picked[i.id] })),
    [data, picked],
  );

  // 검색 중에는 카테고리와 무관하게 전체에서 찾는다
  const searching = query.trim() !== '';
  const tabs = useMemo(() => [ALL, ...groups.map((g) => g.category.id)], [groups]);
  const current = !searching && tabs.includes(active) ? active : ALL;
  const shown = current === ALL ? groups : groups.filter((g) => g.category.id === current);

  const go = (id: string) => {
    setActive(id);
    window.scrollTo({ top: 0 });
    chipRefs.current[id]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  /** 좌우로 쓸어 넘기기 — 왼쪽으로 밀면 다음 카테고리. 세로 스크롤과 헷갈리지 않게 가로 움직임이 뚜렷할 때만. */
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || searching) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const next = tabs[tabs.indexOf(current) + (dx < 0 ? 1 : -1)];
    if (next) go(next);
  };

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = { ...cur };
      if (next[id]) delete next[id];
      else next[id] = 1;
      return next;
    });
  const setQty = (id: string, qty: number) => setPicked((cur) => ({ ...cur, [id]: Math.min(MAX_QTY, Math.max(1, qty)) }));

  const send = async () => {
    if (sending || lines.length === 0) return;
    setSending(true);
    const j = await call<{ sentTo: NametagContact[] }>(`${API}/requests`, jsonInit('POST', { lines: lines.map(({ itemId, qty }) => ({ itemId, qty })), note }));
    setSending(false);
    if (failed(j)) return toast(j.error, 'error');
    toast(j.sentTo.length > 0 ? '프린트를 요청했어요' : '요청은 저장했지만 알림 받을 담당자가 없어요', j.sentTo.length > 0 ? 'success' : 'error');
    setPicked({});
    setNote('');
    setReviewing(false);
    load();
  };

  // 내가 보낸 요청 취소 — 인쇄 대기 중일 때만. 알림 받았던 인쇄 담당에게 취소 알림이 간다.
  const cancel = async (r: NametagRequest) => {
    if (!window.confirm(`${summaryOf(r.lines)} 요청을 취소할까요? 인쇄 담당에게 취소 알림이 갑니다.`)) return;
    setCanceling(r.id);
    const j = await call<{ ok: true }>(`${API}/requests?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' });
    setCanceling(null);
    if (failed(j)) return toast(j.error, 'error');
    toast('요청을 취소했어요');
    load();
  };

  if (error) return <p className="ta-error text-body">{error}</p>;
  if (!data) return <p className="text-body text-muted-foreground">불러오는 중</p>;

  return (
    <div className="mx-auto max-w-[720px] pb-40">
      <div className="sticky top-0 z-10 -mx-2 bg-background px-2 pt-2">
        <div className="flex items-baseline gap-4 border-b border-border pb-2">
          <input
            className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
            placeholder="메뉴 이름 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="메뉴 이름 검색"
          />
          {data.canManage && (
            <Link href="/garden/nametags/manage" className="shrink-0 text-body text-muted-foreground">
              인쇄·메뉴 관리 ›
            </Link>
          )}
        </div>
        {!searching && (
          <div className="flex gap-5 overflow-x-auto border-b border-border" role="tablist" aria-label="카테고리">
            {[{ id: ALL, label: '전체' }, ...groups.map((g) => g.category)].map((c) => {
              const n = (c.id === ALL ? groups : groups.filter((g) => g.category.id === c.id)).flatMap((g) => g.items).filter((i) => picked[i.id]).length;
              const on = c.id === current;
              return (
                <button
                  key={c.id}
                  ref={(el) => {
                    chipRefs.current[c.id] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={`-mb-px shrink-0 whitespace-nowrap border-b-[2.5px] pb-2 pt-3 text-body ${
                    on ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground'
                  }`}
                  onClick={() => go(c.id)}
                >
                  {c.label}
                  {n > 0 && <span className="ml-1 text-caption text-foreground">{n}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 목록 영역 — 좌우로 쓸면 옆 카테고리. 화면을 다 채워야 빈 곳을 쓸어도 넘어간다 */}
      <div
        className="min-h-[60vh]"
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={onTouchEnd}
      >

      {groups.length === 0 && <p className="py-10 text-body text-muted-foreground">찾는 메뉴가 없습니다.</p>}

      {shown.map((g) => (
        <section key={g.category.id} className="pt-6">
          {/* ✓ 자리(22px)만큼 들여 메뉴 이름과 왼쪽 줄을 맞춘다 */}
          <h2 className="m-0 mb-1 pl-[22px] text-caption font-normal tracking-[0.06em] text-muted-foreground">
            {g.category.label} {g.items.length}
          </h2>
          <ul className="m-0 list-none p-0">
            {g.items.map((i) => (
              <Row key={i.id} item={i} qty={picked[i.id] ?? 0} onToggle={() => toggle(i.id)} onQty={(q) => setQty(i.id, q)} />
            ))}
          </ul>
        </section>
      ))}
      </div>

      {data.requests.length > 0 && (
        <section className="pt-12">
          <h2 className="m-0 mb-2 text-title">최근 요청</h2>
          <ul className="m-0 list-none p-0">
            {data.requests.slice(0, 8).map((r) => (
              <li key={r.id} className="border-b border-border py-3">
                <div className="flex items-baseline justify-between gap-3 text-body">
                  <span>
                    {fmtWhen(r.createdAt)} · {nameOf(r.by)} · {summaryOf(r.lines)}
                  </span>
                  <span className={`shrink-0 text-caption ${r.status === 'done' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {r.status === 'done' ? '인쇄 완료' : '인쇄 대기'}
                  </span>
                </div>
                <p className="m-0 mt-1 text-caption text-muted-foreground">{r.lines.map(lineLabel).join(', ')}</p>
                {r.status !== 'done' && !!data.me && r.by?.toLowerCase() === data.me.toLowerCase() && (
                  <button type="button" className={`${ACT_SUB} mt-1`} disabled={canceling === r.id} onClick={() => cancel(r)}>
                    {canceling === r.id ? '취소하는 중' : '요청 취소'}
                  </button>
                )}
                {r.status === 'done' && r.delivery ? (
                  <div className="mt-1 text-caption">
                    <span>수령: {deliveryText(r)}</span>
                    {r.doneByContact && <ContactList label="인쇄 담당" contacts={[r.doneByContact]} />}
                  </div>
                ) : (
                  r.sentTo && r.sentTo.length > 0 && <ContactList label="보낸 곳" contacts={r.sentTo} className="mt-1" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-background">
          <div className="mx-auto max-w-[720px] border-t-[2.5px] border-foreground px-6 pb-6 pt-4">
            {reviewing && (
              <div className="mb-4 space-y-3">
                <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
                  {lines.map((l) => (
                    <button
                      key={l.itemId}
                      type="button"
                      className="py-1 text-body"
                      onClick={() => toggle(l.itemId)}
                      aria-label={`${oneLine(l.ko)} 빼기`}
                    >
                      {lineLabel(l)} <span className="text-muted-foreground">✕</span>
                    </button>
                  ))}
                </div>
                {data.recipients.length > 0 ? (
                  <ContactList label="받는 사람" contacts={data.recipients} />
                ) : (
                  <p className="m-0 text-caption text-amber-600">알림 받을 담당자가 지정되지 않았어요. 운영진에게 알려주세요.</p>
                )}
                <input
                  className="w-full border-b border-border bg-transparent pb-2 text-body outline-none placeholder:text-muted-foreground"
                  placeholder="메모 (선택) — 예: 오늘 오후까지 필요해요"
                  value={note}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <button type="button" className="min-w-0 text-left text-body" onClick={() => setReviewing((v) => !v)}>
                {summaryOf(lines)} <span className="text-muted-foreground">{reviewing ? '접기' : '보기'}</span>
              </button>
              {reviewing ? (
                <button type="button" className="shrink-0 text-body font-medium disabled:opacity-50" disabled={sending} onClick={send}>
                  {sending ? '보내는 중' : '요청 보내기 →'}
                </button>
              ) : (
                <button type="button" className="shrink-0 text-body font-medium" onClick={() => setReviewing(true)}>
                  메뉴 프린트 요청하기 →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ item, qty, onToggle, onQty }: { item: NametagItem; qty: number; onToggle: () => void; onQty: (q: number) => void }) {
  const on = qty > 0;
  return (
    // 행 사이 구분선 없음 — 세로 간격을 줄여 한 화면에 더 많이 보이게(2026-11-20 대표 지시)
    <li className="flex items-baseline gap-3 text-body">
      {/* 한글 이름만 — 영문·설명 줄은 뺐다. 행 전체가 누르는 영역 */}
      <button type="button" className="flex min-w-0 flex-1 items-baseline gap-2 py-1.5 text-left" aria-pressed={on} onClick={onToggle}>
        <span aria-hidden className="w-[14px] shrink-0 text-caption">
          {on ? '✓' : ''}
        </span>
        <span className={`min-w-0 ${on ? 'font-medium' : ''}`}>{oneLine(item.ko)}</span>
      </button>
      {on && (
        <span className="flex shrink-0 items-baseline tabular-nums">
          <button type="button" className="px-3 py-1.5 text-muted-foreground disabled:opacity-30" aria-label="한 장 줄이기" disabled={qty <= 1} onClick={() => onQty(qty - 1)}>
            −
          </button>
          {qty}장
          <button type="button" className="py-1.5 pl-3 text-muted-foreground disabled:opacity-30" aria-label="한 장 늘리기" disabled={qty >= MAX_QTY} onClick={() => onQty(qty + 1)}>
            +
          </button>
        </span>
      )}
    </li>
  );
}
