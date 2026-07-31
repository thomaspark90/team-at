import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveMember } from '@/lib/finance/access';
import { unitOf } from '@/lib/finance/types';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import UploadPanel from '@/components/finance/UploadPanel';
import CardReconcile from '@/components/finance/CardReconcile';
import ReceiptEnrich from '@/components/finance/ReceiptEnrich';
import PnlUpload from '@/components/finance/PnlUpload';

// 단위별 자료 입력 페이지 — 스탭밀 / 가든 양재천점 / 가든 판교점 (2026-07-31 3단위 구조).
// 스탭밀: 통장·카드·POS 전부 이 페이지에서 = 스탭밀 회계.
// 가든 지점: POS 는 지점 단위(양재천=토스, 판교=페이히어)로 정확히 귀속되지만,
//   통장·신한카드는 가든 공용이라 여기서 올려도 지점이 자동으로 찍히지 않는다 —
//   지점 귀속은 지출 자료 분류(지점 지정·건별 분할)에서 확정한다.
export default async function UnitUploadPage({ params }: { params: { unit: string } }) {
  // 구 링크 호환: /finance/upload/garden → 양재천점
  if (params.unit === 'garden') redirect('/finance/upload/yangjae');
  const unit = unitOf(params.unit);
  if (!unit) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMember(supabase, user);
  if (brandScope && brandScope !== unit.brand) redirect('/finance/classify');
  const isStaff = ['admin', 'classifier'].includes(role ?? '');
  if (!isStaff) redirect('/finance');

  const posUnitKey = unit.id === 'staffmeal' ? 'staffmeal' : `garden-${unit.store}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} scoped={!!brandScope} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">자료 입력</div>
              <h1 className="m-0 text-[22px] tracking-[-0.5px]">{unit.label}</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {unit.store ? (
                  <>
                    POS 매출은 이 지점으로 바로 들어가요. 통장·신한카드는 <b>가든 공용</b>이라 올린 뒤{' '}
                    <Link href={`/finance/classify?unit=${unit.id}`} className="underline">지출 자료 분류</Link>에서 지점을
                    지정하거나 건별 분할로 나눠요.
                  </>
                ) : (
                  <>
                    이 페이지에서 올리는 모든 자료는 <b>스탭밀</b> 회계로 들어가요. 분류는{' '}
                    <Link href="/finance/classify?unit=staffmeal" className="underline">지출 자료 분류</Link>에서 해요.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* 1) POS 매출 — 지점 단위 귀속 */}
          <div className="ta-card flex flex-col gap-3">
            <div>
              <h2 className="m-0 text-[15px] text-foreground">POS 매출</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {unit.id === 'yangjae' ? '토스 매출리포트(비번 0000)' : '페이히어 매출 리포트'} 엑셀 — {unit.label} 매출로
                저장돼요.
              </p>
            </div>
            <PnlUpload fixedUnitKey={posUnitKey} />
          </div>

          {/* 2) 은행 거래내역 (PDF) — 가든은 공용 계좌 */}
          <UploadPanel brand={unit.brand} sharedGardenNote={!!unit.store} />
          {/* 3) 신한카드 이용내역 — 같은 브랜드 통장의 카드결제 건과 정산 연결 */}
          <CardReconcile brand={unit.brand} />
          {/* 4) 쿠팡 영수증 품목 분해 — 브랜드·지점은 원본 카드 건에서 자동 상속 */}
          <ReceiptEnrich />
        </div>
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '자료 입력' };
