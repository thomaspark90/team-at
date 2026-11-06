import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serviceClient } from '@/lib/supabase/service';
import { loadWeek } from '@/lib/schedule/queries';
import { weekStartOf } from '@/lib/schedule/time';
import { addDays, fmtMd, isYmd, kstToday } from '@/lib/teaching/kst';
import { STORES, type StoreId } from '@/lib/types';
import ScheduleDayList from '@/components/garden/schedule/ScheduleDayList';
import PublishAck from '@/components/garden/schedule/PublishAck';
import MyLeave from '@/components/garden/schedule/MyLeave';
import SwapRequest from '@/components/garden/schedule/SwapRequest';

const fmtAt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// 직원용 스케줄 링크 — 미들웨어 보호 경로 밖(로그인 불필요). 토큰이 맞아야만 그린다.
// 배포된 주의 그 지점 계획(이름·시간)만 보인다. 메모·실제 근무·연차는 싣지 않는다.
// 배포 시각, 지난 배포 후 바뀐 칸, '확인했어요'(이름 선택)는 이 화면 안에서만 — 외부 알림 없음(2026-11-06 대표 결정).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '근무 스케줄',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default async function SharedSchedulePage({ params, searchParams }: { params: { token: string }; searchParams: { week?: string } }) {
  const svc = serviceClient();
  if (!svc) notFound();
  const { data: link } = await svc.from('schedule_share_links').select('store').eq('token', params.token).maybeSingle();
  if (!link) notFound();
  const store = link.store as StoreId;
  const today = kstToday();
  const weekStart = weekStartOf(isYmd(searchParams.week) ? searchParams.week : today);
  const week = await loadWeek(svc, store, weekStart, false);
  const shifts = week.published ? week.shifts.filter((s) => s.store === store) : [];
  const label = STORES.find((s) => s.id === store)?.label;
  const href = (w: string) => `/schedule/${params.token}?week=${w}`;
  const nameOf = new Map(week.staff.map((s) => [s.id, s.name]));
  const changed = new Set(week.changes.map((c) => `${c.staffId}|${c.date}`));
  const people = week.staff
    .filter((s) => shifts.some((x) => x.staffId === s.id))
    .map((s) => ({ id: s.id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[640px] px-6 py-10">
        <header className="mb-8">
          <p className="ta-label">가든서비스 {label}</p>
          <h1 className="m-0 text-display">근무 스케줄</h1>
          <nav className="mt-4 flex items-center gap-4 text-body">
            <Link href={href(addDays(weekStart, -7))} className="text-muted-foreground">‹ 지난주</Link>
            <span className="tabular">{fmtMd(week.days[0])} ~ {fmtMd(week.days[6])}</span>
            <Link href={href(addDays(weekStart, 7))} className="text-muted-foreground">다음주 ›</Link>
          </nav>
        </header>
        {shifts.length && week.publishedAt ? (
          <div className="mb-8 space-y-4">
            <p className="m-0 text-caption text-muted-foreground">{fmtAt(week.publishedAt)} 배포</p>
            {week.changes.length > 0 && (
              <div className="ta-panel">
                <p className="m-0 text-body font-medium text-amber-600">지난 배포에서 바뀐 근무 {week.changes.length}건</p>
                <ul className="m-0 mt-2 list-none space-y-1 p-0 text-body">
                  {week.changes.map((c) => (
                    <li key={`${c.staffId}|${c.date}`} className="flex gap-3">
                      <span className="tabular w-[64px] shrink-0 text-muted-foreground">{fmtMd(c.date)}</span>
                      <span>
                        {nameOf.get(c.staffId)} <span className="tabular text-muted-foreground">{c.before || '없음'}</span> → <span className="tabular">{c.after || '없음'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <PublishAck token={params.token} weekStart={weekStart} people={people} acked={week.acked} />
          </div>
        ) : null}
        {shifts.length ? (
          <ScheduleDayList days={week.days} shifts={shifts} staff={week.staff} today={today} changed={changed} />
        ) : (
          <p className="text-body text-muted-foreground">이 주는 아직 배포된 스케줄이 없습니다.</p>
        )}
        <div className="mt-8 space-y-4">
          {shifts.length > 0 && <SwapRequest token={params.token} people={people} shifts={shifts} today={today} />}
          <MyLeave token={params.token} />
          <Link href={`/schedule/${params.token}/clock`} className="ta-panel block text-body">출퇴근 기록(매장 태블릿) ›</Link>
        </div>
        <p className="mt-10 text-caption text-muted-foreground">이 링크는 외부로 전달하지 마세요.</p>
      </div>
    </main>
  );
}
