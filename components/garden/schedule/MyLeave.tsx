'use client';

import { useEffect, useState } from 'react';
import { fmtMd } from '@/lib/teaching/kst';
import { LEAVE_LABEL, type LeaveType } from '@/lib/schedule/types';

// 직원 링크의 '내 연차' — 이름을 고르면 잔여 연차·대체휴무·신청 상태. 본인 확인 없음(링크 안에서만, 2026-11-06 대표 결정).
type Info = { name: string; total: number | null; remaining: number | null; expiresOn: string | null; substitute: number; usedThisYear: number; requests: { date: string; type: LeaveType; status: 'pending' | 'approved' | 'rejected' }[] };
const STATUS: Record<string, string> = { pending: '대기', approved: '승인', rejected: '반려' };

export default function MyLeave({ token }: { token: string }) {
  const [people, setPeople] = useState<{ id: number; name: string }[]>([]);
  const [staffId, setStaffId] = useState('');
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/schedule-link/leave?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setPeople(j.people ?? []))
      .catch(() => {});
  }, [token]);
  useEffect(() => {
    setInfo(null);
    if (!staffId) return;
    fetch(`/api/schedule-link/leave?token=${encodeURIComponent(token)}&staffId=${staffId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setInfo(j)))
      .catch(() => setError('불러오지 못했습니다.'));
  }, [token, staffId]);

  return (
    <details className="ta-panel">
      <summary className="cursor-pointer text-body">내 연차 보기 ›</summary>
      <div className="mt-3 space-y-3">
        <select aria-label="이름" className="ta-input w-[150px]" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">이름</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {error && <p className="m-0 text-body text-destructive">{error}</p>}
        {info && (
          <div className="space-y-2 text-body">
            {info.total == null ? (
              <p className="m-0 text-muted-foreground">총 연차가 아직 등록되지 않았습니다. 운영진에게 문의하세요.</p>
            ) : (
              <p className="m-0">
                잔여 연차 <span className="tabular font-medium">{info.remaining}</span>개 / 총 {info.total}개
                {info.expiresOn && <span className="text-caption text-muted-foreground"> · {fmtMd(info.expiresOn)} 소멸</span>}
              </p>
            )}
            <p className="m-0 text-caption text-muted-foreground">올해 사용 {info.usedThisYear}개 · 대체휴무 잔여 {info.substitute}개</p>
            {info.requests.length > 0 && (
              <ul className="m-0 list-none space-y-1 p-0 text-caption">
                {info.requests.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="tabular w-[64px] text-muted-foreground">{fmtMd(r.date)}</span>
                    <span>{LEAVE_LABEL[r.type]}</span>
                    <span className={r.status === 'approved' ? 'text-emerald-600' : r.status === 'rejected' ? 'text-muted-foreground' : 'text-amber-600'}>{STATUS[r.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
