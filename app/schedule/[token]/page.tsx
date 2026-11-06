import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serviceClient } from '@/lib/supabase/service';
import { loadWeek } from '@/lib/schedule/queries';
import { weekStartOf } from '@/lib/schedule/time';
import { addDays, fmtMd, isYmd, kstToday } from '@/lib/teaching/kst';
import { STORES, type StoreId } from '@/lib/types';
import ScheduleDayList from '@/components/garden/schedule/ScheduleDayList';

// 직원용 스케줄 링크 — 미들웨어 보호 경로 밖(로그인 불필요). 토큰이 맞아야만 그린다.
// 배포된 주의 그 지점 계획(이름·시간)만 보인다. 메모·실제 근무·연차는 싣지 않는다.
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
        {shifts.length ? (
          <ScheduleDayList days={week.days} shifts={shifts} staff={week.staff} today={today} />
        ) : (
          <p className="text-body text-muted-foreground">이 주는 아직 배포된 스케줄이 없습니다.</p>
        )}
        <p className="mt-10 text-caption text-muted-foreground">이 링크는 외부로 전달하지 마세요.</p>
      </div>
    </main>
  );
}
