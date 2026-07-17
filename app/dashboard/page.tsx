import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import MonthlyUploadBoard from '@/components/finance/MonthlyUploadBoard';
import ClassifyBoard from '@/components/finance/ClassifyBoard';
import TaskBoard from '@/components/finance/TaskBoard';

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

// 회계 대시보드 — 대기 송금 요약 + 회계자료 엑셀 업로드(스태프).
export default async function AccountingDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  const isStaff = ['admin', 'classifier'].includes(role ?? '');

  // 대기 송금 요약 — 로그인한 누구나 열람 가능(RLS 동일)
  const { data: pending } = await supabase
    .schema('finance')
    .from('transfer_requests')
    .select('amount')
    .eq('status', 'pending');
  const pendingCount = pending?.length ?? 0;
  const pendingSum = (pending ?? []).reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto flex max-w-[1120px] flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
        {/* 대기 송금 요약 */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="m-0 text-[15px] font-medium">송금 대기</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {pendingCount > 0 ? (
                  <>
                    <span className="font-medium text-foreground">{pendingCount}건</span> ·{' '}
                    <span className="font-medium" style={{ color: 'hsl(var(--number-colored))' }}>
                      {won(pendingSum)}
                    </span>{' '}
                    이체 대기 중
                  </>
                ) : (
                  '대기 중인 송금이 없어요.'
                )}
              </p>
            </div>
            <Link
              href="/dashboard/transfer"
              className="rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-medium text-background"
            >
              송금 요청 →
            </Link>
          </div>
        </section>

        {/* 월별 회계자료 업로드 → 자료 분류 보드 — 기장 권한자만 */}
        {isStaff && <MonthlyUploadBoard />}
        {isStaff && <ClassifyBoard />}

        {/* 기장 업무 칸반 — 은행·카드 업로드, 거래 분류, 기말재고, 월 확정 등 정기 업무 체크 */}
        {isStaff && (
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="m-0 mb-1 text-[15px] font-medium">업무 보드</h2>
            <p className="mb-4 mt-0 text-[13px] text-muted-foreground">
              주간·월간 기장 업무가 자동으로 생성돼요. POS·채널수수료·관리손익 검토는{' '}
              <Link href="/finance/dashboard" className="underline">재무 대시보드</Link>에서 관리해요.
            </p>
            <TaskBoard board="accounting" />
          </section>
        )}
      </div>
    </div>
  );
}
