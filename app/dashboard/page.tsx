import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveMember } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import AccountingBoards from '@/components/finance/AccountingBoards';
import MonthShell from '@/components/finance/MonthShell';
import TaskBoard from '@/components/finance/TaskBoard';
import { unitOf } from '@/lib/finance/types';
import { computeBoardTodos } from '@/lib/finance/boardTodos';

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

// 회계 대시보드 — 대기 송금 요약 + 회계자료 엑셀 업로드(스태프).
// 내비 2단 구조: 상단에서 고른 단위(?unit=)가 업로드 보드의 브랜드를 고정한다.
export default async function AccountingDashboardPage({ searchParams }: { searchParams: { unit?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // 멤버 조회·대기 송금 요약(로그인한 누구나 열람 가능, RLS 동일)·월 배지 집계는 서로 독립 — 병렬 조회.
  // 배지는 부가 정보라 실패해도 페이지는 뜨게 하고, 클라이언트에서 재조회한다.
  const unit = unitOf(searchParams.unit) ?? unitOf('staffmeal')!;
  const [{ role, brandScope }, { data: pending }, initialTodos] = await Promise.all([
    resolveMember(supabase, user),
    supabase.schema('finance').from('transfer_requests').select('amount').eq('status', 'pending'),
    computeBoardTodos(supabase, unit.brand).catch(() => undefined),
  ]);
  // 브랜드 스코프 멤버는 분류 화면이 홈
  if (brandScope) redirect('/finance/classify');
  const isStaff = ['admin', 'classifier'].includes(role ?? '');
  const pendingCount = pending?.length ?? 0;
  const pendingSum = (pending ?? []).reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
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

        {/* 월별 자료 현황 + 지출 자료 분류 보드 — 기장 권한자만.
            좌측 고정 연·월 사이드바(MonthShell)가 현황·분류·업무 보드 전체의 왼쪽에 선다.
            대시보드는 확인 전용(2026-08-01 대표 지시) — 업로드는 각 단위의 자료 입력 페이지에서.
            브랜드는 상단 내비 단위가 고정(가든 지점 둘은 통장·카드가 공용이라 같은 가든 현황) */}
        {isStaff && (
          <MonthShell initialTodos={initialTodos} brand={unit.brand}>
            <AccountingBoards fixedBrand={unit.brand} unitId={unit.id} mode="status" />

            {/* 기장 업무 칸반 — 은행·카드 업로드, 거래 분류, 기말재고, 월 확정 등 정기 업무 체크 */}
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="m-0 mb-1 text-[15px] font-medium">업무 보드</h2>
              <p className="mb-4 mt-0 text-[13px] text-muted-foreground">
                주간·월간 기장 업무가 자동으로 생성돼요. POS·채널수수료·관리손익 검토는{' '}
                <Link href="/finance/dashboard" className="underline">재무 대시보드</Link>에서 관리해요.
              </p>
              <TaskBoard board="accounting" />
            </section>
          </MonthShell>
        )}
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '회계' };
