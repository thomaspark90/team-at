import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMemberStamped } from '@/lib/access/stamp';
import { unitOf } from '@/lib/finance/types';
import { getBrandBanks } from '@/lib/finance/brandBanks';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import PnlUpload from '@/components/finance/PnlUpload';
import AccountingBoards from '@/components/finance/AccountingBoards';
import MonthShell from '@/components/finance/MonthShell';
import StatusMatrix from '@/components/finance/StatusMatrix';
import ContinuityAudit from '@/components/finance/ContinuityAudit';
import { computeBoardMatrix, computeBoardTodos } from '@/lib/finance/boardTodos';

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
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMemberStamped(supabase, user);
  if (brandScope && brandScope !== unit.brand) redirect('/finance/classify');
  const isStaff = ['admin', 'classifier'].includes(role ?? '');
  if (!isStaff) redirect('/finance');

  const posUnitKey = unit.id === 'staffmeal' ? 'staffmeal' : `garden-${unit.store}`;
  // 브랜드별 사용 은행 + 매트릭스·월 배지 서버 프리페치(병렬) — 첫 화면부터 완성본이 뜨게
  // ('불러오는 중…' 후 채워지는 이단 로딩 제거, 2026-08-03 대표 지시)
  // 가든 지점 페이지는 POS 요구를 자기 지점만으로 좁힌다 — 각 지점은 자기 지점 POS 자료만 요청(2026-08-08)
  const store = unit.store ?? undefined;
  const [banks, initialTodos, initialMatrix] = await Promise.all([
    getBrandBanks(supabase, unit.brand),
    computeBoardTodos(supabase, unit.brand, store).catch(() => undefined),
    computeBoardMatrix(supabase, unit.brand, store).catch(() => undefined),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} scoped={!!brandScope} />
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="flex flex-col gap-12">
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

          {/* 좌측 고정 연·월 사이드바(MonthShell) — POS 매출부터 하단 업로더까지 전부 오른쪽 열로 */}
          <MonthShell brand={unit.brand} store={store} initialTodos={initialTodos}>
            <div className="divide-y divide-border">
            {/* 0) 전체 자료 현황 매트릭스 — 연·월 × 자료 종류 미입력 한눈 조망(2026-08-02 대표 지시) */}
            <div className="pb-[54px]">
              <StatusMatrix brand={unit.brand} unitId={unit.id} store={store} initialData={initialMatrix} />
            </div>

            {/* 0-1) 잔액 연속성 감사 — 소급 업로드 후 빠진 구간(누락 파일) 최종 점검(2026-08-03) */}
            <div className="py-[54px]">
              <ContinuityAudit brand={unit.brand} />
            </div>

            {/* 1) POS 매출 — 지점 단위 귀속 (#pos: 월별 보드의 POS 칸에서 앵커 이동) */}
            <div id="pos" className="flex flex-col gap-6 scroll-mt-4 py-[54px]">
              <div>
                <h2 className="m-0 text-[15px] font-medium text-foreground">POS 매출</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {unit.id === 'yangjae' ? '토스 매출리포트(비번 0000)' : '페이히어 매출 리포트'} 엑셀 — {unit.label} 매출로
                  저장돼요.
                </p>
              </div>
              <PnlUpload fixedUnitKey={posUnitKey} />
            </div>

            {/* 2) 월별 회계자료 업로드 보드 — 은행·카드 엑셀 슬롯 (대시보드에서 이관, 2026-08-01).
                은행 거래내역은 스탭밀·가든 모두 엑셀로 올리므로, 이 그리드가 유일한 업로드 경로다.
                (은행 PDF 폼·신한카드 정산·쿠팡 영수증 세분화는 2026-08-01 제거 — 그리드와 중복.
                 필요 시 컴포넌트는 코드에 남아 있으니 되살릴 수 있음: UploadPanel/CardReconcile/ReceiptEnrich) */}
            <div className="pt-[54px]">
              <AccountingBoards fixedBrand={unit.brand} unitId={unit.id} mode="upload" banks={banks} />
            </div>
            </div>
          </MonthShell>
        </div>
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '자료 입력' };
