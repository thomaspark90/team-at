'use client';

import { useMemo, useState } from 'react';

// 활동 로그 뷰어 — admin 전용. 서버에서 최근 로그를 받아 클라이언트에서 필터.
export interface ActivityRow {
  id: number;
  created_at: string;
  email: string;
  action: string;
  detail: string | null;
}

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export default function ActivityLog({ rows }: { rows: ActivityRow[] }) {
  const [userFilter, setUserFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [query, setQuery] = useState('');

  const users = useMemo(() => Array.from(new Set(rows.map((r) => r.email))).sort(), [rows]);
  const actions = useMemo(() => Array.from(new Set(rows.map((r) => r.action))).sort(), [rows]);

  const visible = rows.filter(
    (r) =>
      (userFilter === 'all' || r.email === userFilter) &&
      (actionFilter === 'all' || r.action === actionFilter) &&
      (!query.trim() ||
        r.action.includes(query.trim()) ||
        (r.detail ?? '').includes(query.trim()) ||
        r.email.includes(query.trim()))
  );

  // 날짜별 그룹 (최신순 유지)
  const days: [string, ActivityRow[]][] = [];
  for (const r of visible) {
    const k = dayKey(r.created_at);
    if (days.length && days[days.length - 1][0] === k) days[days.length - 1][1].push(r);
    else days.push([k, [r]]);
  }

  const selectCls =
    'rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none';

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-[15px] font-medium">활동 로그</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            누가 어떤 기능을 썼는지 기록이에요. 최근 1,000건까지 표시돼요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className={selectCls} value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="all">전체 사용자</option>
            {users.map((u) => (
              <option key={u} value={u}>
                {u.split('@')[0]}
              </option>
            ))}
          </select>
          <select className={selectCls} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">전체 기능</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            className={`${selectCls} w-[160px]`}
            placeholder="검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1">
        {visible.length === 0 && <p className="text-[13px] text-muted-foreground">기록이 없어요.</p>}
        {days.map(([k, list]) => (
          <div key={k}>
            <h3 className="mb-1.5 mt-3 border-b border-border pb-1 text-[13px] font-medium first:mt-0">
              {fmtDay(list[0].created_at)}
              <span className="ml-2 font-normal text-muted-foreground">{list.length}건</span>
            </h3>
            {list.map((r) => (
              <div key={r.id} className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-[13px] odd:bg-background/60">
                <span className="w-[76px] shrink-0 font-mono text-[12px] text-muted-foreground">{fmtTime(r.created_at)}</span>
                <span className="w-[90px] shrink-0 truncate text-[12px] text-muted-foreground">{r.email.split('@')[0]}</span>
                <span className="shrink-0 font-medium">{r.action}</span>
                {r.detail && <span className="min-w-0 truncate text-muted-foreground">{r.detail}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
