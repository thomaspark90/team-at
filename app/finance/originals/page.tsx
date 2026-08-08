import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveMember } from '@/lib/finance/access';
import { unwrap } from '@/lib/finance/db';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import OriginalsHistory, { type OriginalRow } from '@/components/finance/OriginalsHistory';
import { unitOf } from '@/lib/finance/types';

// 업로드 원본 자료함 — POS·통장·카드·영수증·원두봉투 사진 등 모든 업로드 지점이 남긴 원본
// 파일을 한곳에서 확인·재다운로드. 스트리밍은 /api/finance/originals/[id] (권한 재검사).
export default async function OriginalsPage({ searchParams }: { searchParams: { unit?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMember(supabase, user);
  if (brandScope) redirect('/finance/classify');
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const unit = unitOf(searchParams.unit);
  let q = supabase
    .schema('finance')
    .from('upload_originals')
    .select('id,area,filename,content_type,size,ym,brand,store,note,uploaded_by_email,uploaded_at')
    .order('uploaded_at', { ascending: false })
    .limit(500);
  if (unit) {
    q = q.eq('brand', unit.brand);
    // 통장·카드는 가든 공용 자료(store 없음)라 지점 필터에서도 함께 보여준다(자료 이력과 동일 규칙)
    if (unit.store) q = q.or(`store.eq.${unit.store},store.is.null`);
  }
  const data = unwrap(await q, '원본 자료함');
  const rows: OriginalRow[] = (data as OriginalRow[] | null) ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">원본 자료함</h1>
          <Link href="/finance/uploads" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            자료 이력 →
          </Link>
        </div>
        <p className="mb-5 text-[13px] text-muted-foreground">
          {unit ? <b>{unit.label}</b> : '전체'} 업로드 원본이에요 — POS·통장·카드·영수증·원두봉투 사진까지, 올린 파일 그대로 보관돼요.
          {unit?.store && ' 통장·카드는 가든 공용 자료라 양재천·판교에 같이 보여요.'}
        </p>
        <OriginalsHistory rows={rows} />
      </div>
    </div>
  );
}

export const metadata = { title: '원본 자료함' };
