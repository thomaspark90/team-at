'use client';

import { useEffect, useState } from 'react';
import { expiringLeaves, type ExpiringLeave } from '@/lib/schedule/leave';
import type { Staff } from '@/lib/schedule/types';

// 연차 소멸 임박 알림 — 30일 안에 소멸하는 잔여 연차가 있으면 스케줄 화면 상단에 한 줄. 운영진 전용.
export default function LeaveExpiryNotice({ staff, today }: { staff: Staff[]; today: string }) {
  const [items, setItems] = useState<ExpiringLeave[]>([]);
  useEffect(() => {
    fetch('/api/garden-schedule/leave', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => !j.error && setItems(expiringLeaves(j.balances, j.records, today)))
      .catch(() => {});
  }, [today]);
  if (!items.length) return null;
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const fmt = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return (
    <p className="m-0 text-caption text-amber-600" title="잔여 연차가 소멸일 30일 안에 있는 사람. 미사용분은 수당 정산 대상이 될 수 있습니다.">
      연차 소멸 임박:{' '}
      {items.map((x, i) => (
        <span key={x.staffId}>
          {i > 0 && ' · '}
          {nameOf.get(x.staffId) ?? x.staffId} {x.remaining}개 {x.daysLeft < 0 ? `${fmt(x.expiresOn)} 지남` : `${fmt(x.expiresOn)} 소멸(D-${x.daysLeft})`}
        </span>
      ))}
    </p>
  );
}
