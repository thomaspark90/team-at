'use client';

import { useCallback, useEffect, useState } from 'react';
import SegmentControl from '@/components/nav/SegmentControl';
import { addDays, fmtMd, kstToday } from '@/lib/teaching/kst';
import type { ChecklistCard, ChecklistDay } from '@/lib/checklist/types';
import { SHIFT_LABEL, type ShiftType } from '@/lib/checklist/types';
import { STORES, type StoreId } from '@/lib/types';
import ChecklistCardView from './ChecklistCardView';
import ChecklistItemManager from './ChecklistItemManager';

// 체크리스트 화면의 상태만 담당한다. 직원은 오늘 내 담당 장만 보고, 운영진은 날짜를 넘겨 전 지점 현황과 항목 관리를 본다.

const storeLabel = (id: StoreId) => STORES.find((s) => s.id === id)?.label ?? id;

export default function ChecklistBoard() {
  const [date, setDate] = useState(() => kstToday());
  const [day, setDay] = useState<ChecklistDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'day' | 'items'>('day');
  const [managedStore, setManagedStore] = useState<StoreId>('pangyo');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/garden-checklist?date=${date}`, { cache: 'no-store' }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok || !j || j.error) return setError(j?.error ?? '불러오지 못했습니다.');
    setError(null);
    setDay(j);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const takeOver = async (store: StoreId, shiftType: ShiftType) => {
    setNotice(null);
    const r = await fetch('/api/garden-checklist/crew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'takeover', store, date: day?.today, shiftType }),
    }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok) return setNotice(j?.error ?? '맡지 못했습니다. 연결을 확인해 주세요.');
    load();
  };

  const replaceCard = (next: ChecklistCard) =>
    setDay((d) =>
      d && { ...d, cards: d.cards.map((c) => (c.store === next.store && c.shiftType === next.shiftType ? next : c)) },
    );

  if (error) return <p className="ta-error text-body">{error}</p>;
  if (!day) return <p className="text-body text-muted-foreground">불러오는 중</p>;

  return (
    <div className="space-y-5">
      {day.editor && (
        <div className="flex flex-wrap items-center gap-3">
          <SegmentControl
            ariaLabel="보기"
            items={[{ id: 'day', label: '하루 현황' }, { id: 'items', label: '항목 관리' }]}
            value={view}
            onSelect={(id) => setView(id as 'day' | 'items')}
          />
          {view === 'day' && (
            <div className="flex items-center gap-2">
              <button type="button" className="ta-btn px-3" aria-label="전날" onClick={() => setDate((d) => addDays(d, -1))}>
                ‹
              </button>
              <span className="min-w-20 text-center text-body">{fmtMd(date)}</span>
              <button type="button" className="ta-btn px-3" aria-label="다음 날" disabled={date >= day.today} onClick={() => setDate((d) => addDays(d, 1))}>
                ›
              </button>
            </div>
          )}
        </div>
      )}

      {view === 'items' && day.editor ? (
        <ChecklistItemManager store={managedStore} onStore={setManagedStore} />
      ) : (
        <>
          {!day.editor && <p className="text-body text-muted-foreground">{fmtMd(date)}</p>}
          {day.editor && day.closedStores.length > 0 && (
            <p className="text-body text-muted-foreground">{day.closedStores.map(storeLabel).join(', ')} 정기 휴무</p>
          )}
          {day.editor && day.unpublishedStores.length > 0 && (
            <p className="text-body text-amber-600">{day.unpublishedStores.map(storeLabel).join(', ')} 이번 주 스케줄이 배포되지 않아 담당을 정하지 못했습니다.</p>
          )}
          {day.editor && day.unlinked.length > 0 && (
            <p className="text-body text-amber-600">로그인 계정이 연결되지 않은 근무자: {day.unlinked.join(', ')} (직원 명부에서 연결)</p>
          )}
          {!day.linked && !day.editor && (
            <p className="text-body text-amber-600">근무자 명부에 계정이 연결되어 있지 않습니다. 운영진에게 연결을 요청해 주세요.</p>
          )}
          {day.linked && day.cards.length === 0 && <p className="text-body text-muted-foreground">오늘 맡은 체크리스트가 없습니다.</p>}
          {!day.linked && day.editor && day.cards.length === 0 && <p className="text-body text-muted-foreground">이날 체크리스트가 없습니다.</p>}
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {day.cards.map((card) => (
              <ChecklistCardView
                key={`${card.store}-${card.shiftType}-${card.date}`}
                card={card}
                canAct={day.canAct && (card.onCrew || day.editor)}
                editor={day.editor}
                today={day.today}
                onChange={replaceCard}
                onReload={load}
              />
            ))}
          </div>
          {day.takeoverOptions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {day.takeoverOptions.map((o) => (
                <button key={`${o.store}-${o.shiftType}`} type="button" className="ta-btn" onClick={() => takeOver(o.store, o.shiftType)}>
                  오늘 {storeLabel(o.store)} {SHIFT_LABEL[o.shiftType]} 대신 맡기
                </button>
              ))}
            </div>
          )}
          {notice && <p className="ta-error text-body">{notice}</p>}
        </>
      )}
    </div>
  );
}
