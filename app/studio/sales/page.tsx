import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveMember } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import StudioNav from '@/components/StudioNav';
import SalesSummary from '@/components/SalesSummary';
import { fetchSalesRows, type SalesRow } from '@/lib/finance/sales-data';

// 스탭밀 매출 — 페이히어 POS 업로드(발생주의)의 staffmeal 매출 요약.
// 데이터는 dashboard_pos 뷰로 읽는다: pos_sales 는 admin/classifier RLS 라 그대로 읽으면
// viewer 가 0행이 되는데, 이 뷰는 재무 멤버(viewer 포함)까지 안전 컬럼만 열어 준다.
// 재무 멤버가 아닌 스탭은 매출 대신 안내 문구를 본다 — 매출 열람 범위는 멤버 관리에서 통제.
export default async function StudioSalesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMember(supabase, user);
  const isMember = role != null;
  const scopedOut = brandScope === 'garden'; // 가든 전용 멤버 — 뷰가 staffmeal 행을 숨긴다

  // 최근 13개월 — 월 카드·30일 막대·카테고리 요약에 충분한 범위만 가져온다
  const since = new Date(Date.now() - 396 * 86_400_000).toISOString().slice(0, 10);
  let rows: SalesRow[] = [];
  if (isMember && !scopedOut) {
    rows = await fetchSalesRows(supabase, { table: 'dashboard_pos', brand: 'staffmeal', since }).catch(() => []);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <StudioNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div>
          <h1 className="m-0 text-[22px]">스탭밀 매출</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            페이히어 POS 업로드 기준 발생주의 매출이에요. 월 자료가 업로드돼야 반영됩니다 (회계 → 자료 입력).
          </p>
        </div>
        {!isMember || scopedOut ? (
          <section>
            <p className="m-0 text-[13px] text-muted-foreground">
              {scopedOut
                ? '가든 전용 계정이라 스탭밀 매출은 볼 수 없어요.'
                : '매출은 재무 멤버만 볼 수 있어요. 필요하면 대표에게 멤버 등록(viewer)을 요청하세요.'}
            </p>
          </section>
        ) : rows.length === 0 ? (
          <section>
            <p className="m-0 text-[13px] text-muted-foreground">
              아직 집계된 스탭밀 POS 매출이 없어요. 회계 → 자료 입력에서 페이히어 매출 파일을 올리면 여기에 나타납니다.
            </p>
          </section>
        ) : (
          <SalesSummary rows={rows} />
        )}
      </div>
    </div>
  );
}

export const metadata = { title: '스탭밀 매출' };
