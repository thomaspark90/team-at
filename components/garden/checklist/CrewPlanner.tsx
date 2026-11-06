'use client';

import { useEffect, useState } from 'react';
import { isClosedDay } from '@/lib/checklist/logic';
import { SHIFT_TYPES } from '@/lib/checklist/types';
import { fmtMd, kstToday } from '@/lib/teaching/kst';
import type { StoreId } from '@/lib/types';
import CrewEditor from './CrewEditor';

// 스케줄 화면의 체크리스트 조 편성 — 보고 있는 주의 날짜를 골라 오픈·마감조와 책임자를 고친다. 운영진 전용 영역에 놓인다.
export default function CrewPlanner({ store, days }: { store: StoreId; days: string[] }) {
  const open = days.filter((d) => !isClosedDay(store, d));
  const [date, setDate] = useState(() => (open.includes(kstToday()) ? kstToday() : open[0]));
  const [expanded, setExpanded] = useState(false); // 펼칠 때만 불러온다

  // 주나 지점을 넘기면 그 주의 날짜로 맞춘다
  useEffect(() => {
    setDate((d) => (open.includes(d) ? d : open[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open 은 days·store 에서 나온다
  }, [days, store]);

  if (!date) return null;

  return (
    <details className="ta-panel" onToggle={(e) => setExpanded(e.currentTarget.open)}>
      <summary className="cursor-pointer text-body">체크리스트 조 편성 ›</summary>
      {expanded && <div className="mt-4 space-y-5">
        <select aria-label="날짜" className="ta-input w-[140px]" value={date} onChange={(e) => setDate(e.target.value)}>
          {open.map((d) => (
            <option key={d} value={d}>
              {fmtMd(d)}
            </option>
          ))}
        </select>
        {SHIFT_TYPES.map((t) => (
          <CrewEditor key={`${store}-${date}-${t}`} store={store} date={date} shiftType={t} />
        ))}
      </div>}
    </details>
  );
}
