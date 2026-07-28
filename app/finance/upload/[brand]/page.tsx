import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveMember } from '@/lib/finance/access';
import { BRANDS, brandLabel, type Brand } from '@/lib/finance/types';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import UploadPanel from '@/components/finance/UploadPanel';
import CardReconcile from '@/components/finance/CardReconcile';
import ReceiptEnrich from '@/components/finance/ReceiptEnrich';

// 브랜드별 자료 입력 페이지 — 페이지가 곧 브랜드 컨텍스트.
// 여기서 올리는 은행 PDF·카드 내역·영수증은 전부 이 브랜드 회계로 귀속된다.
// (계좌·카드가 브랜드별로 분리 운영되므로, 업로드 페이지 분리 = 브랜드 판정. 2026-07-28 확정)
export default async function BrandUploadPage({ params }: { params: { brand: string } }) {
  const brand = params.brand;
  if (brand !== 'garden' && brand !== 'staffmeal') notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMember(supabase, user);
  if (brandScope && brandScope !== brand) redirect('/finance/classify');
  const isStaff = ['admin', 'classifier'].includes(role ?? '');
  if (!isStaff) redirect('/finance');

  const other = BRANDS.find((b) => b.id !== brand) as { id: Brand; label: string };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} scoped={!!brandScope} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">자료 입력</div>
              <h1 className="m-0 text-[22px] tracking-[-0.5px]">{brandLabel(brand)}</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                이 페이지에서 올리는 모든 자료는 <b>{brandLabel(brand)}</b> 회계로 들어가요. 월별 엑셀 보드는{' '}
                <Link href="/dashboard" className="underline">회계 대시보드</Link>, POS 매출은{' '}
                <Link href="/finance/pnl" className="underline">관리손익</Link>에서 올려요.
              </p>
            </div>
            {!brandScope && (
              <Link
                href={`/finance/upload/${other.id}`}
                className="ta-btn h-9 px-4 text-[13px]"
              >
                {other.label} 입력으로 전환 →
              </Link>
            )}
          </div>

          {/* 1) 은행 거래내역 (PDF) */}
          <UploadPanel brand={brand} />
          {/* 2) 신한카드 이용내역 — 같은 브랜드 통장의 카드결제 건과 정산 연결 */}
          <CardReconcile brand={brand} />
          {/* 3) 쿠팡 영수증 품목 분해 — 브랜드는 원본 카드 건에서 자동 상속 */}
          <ReceiptEnrich />
        </div>
      </div>
    </div>
  );
}
