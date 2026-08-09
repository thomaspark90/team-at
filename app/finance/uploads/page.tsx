import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMemberStamped } from '@/lib/access/stamp';
import { unwrap } from '@/lib/finance/db';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import UploadHistory, { type UploadRow } from '@/components/finance/UploadHistory';
import { unitOf } from '@/lib/finance/types';

export default async function UploadsPage({ searchParams }: { searchParams: { unit?: string } }) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMemberStamped(supabase, user);
  // 브랜드 스코프 멤버는 분류 화면이 홈
  if (brandScope) redirect('/finance/classify');
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  // 단위 탭 — 스탭밀은 스탭밀 업로드만, 가든 지점은 가든(공용) 업로드를 보여준다
  const unit = unitOf(searchParams.unit);
  let upQ = supabase
    .schema('finance')
    .from('uploads')
    .select('id,source,bank,card_issuer,brand,period_start,period_end,row_count,uploaded_at,settled_tx_id,statement_total')
    .order('uploaded_at', { ascending: false });
  if (unit) upQ = upQ.eq('brand', unit.brand);
  const data = unwrap(await upQ, '자료 이력');
  const list: UploadRow[] = (data as UploadRow[] | null) ?? [];

  // 이력(uploads) 기록 없이 들어온 쿠팡 영수증 품목(과거 적용분)도 합산 행으로 보여줌
  const orphan = unwrap(
    await supabase
      .schema('finance')
      .from('transactions')
      .select('amount_out,tx_at')
      .eq('source', 'card')
      .eq('channel', '쿠팡영수증')
      .is('upload_id', null),
    '쿠팡 영수증 품목',
  );
  const orphans = (orphan as { amount_out: number; tx_at: string }[] | null) ?? [];
  if (orphans.length > 0 && (!unit || unit.brand === 'garden')) {
    const dates = orphans.map((r) => r.tx_at).sort();
    list.push({
      id: -1, // 합산 행(기록 없음) 표식
      source: 'receipt',
      bank: 'shinhan',
      brand: 'garden',
      card_issuer: '쿠팡',
      period_start: dates[0] ?? null,
      period_end: dates[dates.length - 1] ?? null,
      row_count: orphans.length,
      uploaded_at: '',
      settled_tx_id: null,
      statement_total: orphans.reduce((s, r) => s + r.amount_out, 0),
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">자료 이력</h1>
          <Link href="/finance/classify" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 지출 자료 분류
          </Link>
        </div>
        <p className="mb-5 text-[13px] text-muted-foreground">
          {unit ? <b>{unit.label}</b> : '전체'} 자료 이력이에요 — 단위는 상단에서 선택해요.
          {unit?.store && ' 통장·카드는 가든 공용 자료라 양재천·판교에 같이 보여요.'}
        </p>
        <UploadHistory uploads={list} />
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '자료 이력' };
