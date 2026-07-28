import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveMember } from '@/lib/finance/access';
import { unwrap } from '@/lib/finance/db';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import UploadHistory, { type UploadRow } from '@/components/finance/UploadHistory';

export default async function UploadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMember(supabase, user);
  // 브랜드 스코프 멤버는 분류 화면이 홈
  if (brandScope) redirect('/finance/classify');
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const data = unwrap(
    await supabase
      .schema('finance')
      .from('uploads')
      .select('id,source,bank,card_issuer,brand,period_start,period_end,row_count,uploaded_at,settled_tx_id,statement_total')
      .order('uploaded_at', { ascending: false }),
    '자료 이력',
  );
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
  if (orphans.length > 0) {
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
            ← 자료 분류
          </Link>
        </div>
        <p className="mb-5 text-[13px] text-muted-foreground">그동안 올린 은행·신한카드·쿠팡 영수증 자료의 이력이에요.</p>
        <UploadHistory uploads={list} />
      </div>
    </div>
  );
}
