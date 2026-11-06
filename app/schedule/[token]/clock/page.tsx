import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serviceClient } from '@/lib/supabase/service';
import { STORES, type StoreId } from '@/lib/types';
import ClockBoard from '@/components/garden/schedule/ClockBoard';

// 출퇴근 기록(매장 태블릿용) — 직원 링크와 같은 토큰. 로그인 없음.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '출퇴근', robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer' };

export default async function ClockPage({ params }: { params: { token: string } }) {
  const svc = serviceClient();
  if (!svc) notFound();
  const { data: link } = await svc.from('schedule_share_links').select('store').eq('token', params.token).maybeSingle();
  if (!link) notFound();
  const label = STORES.find((s) => s.id === (link.store as StoreId))?.label;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[640px] px-6 py-10">
        <header className="mb-8">
          <p className="ta-label">가든서비스 {label}</p>
          <h1 className="m-0 text-display">출퇴근</h1>
          <Link href={`/schedule/${params.token}`} className="mt-2 inline-block text-caption text-muted-foreground">‹ 근무 스케줄</Link>
        </header>
        <ClockBoard token={params.token} />
      </div>
    </main>
  );
}
