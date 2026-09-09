import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMember } from '@/lib/finance/access';
import PageShell from '@/components/PageShell';
import AccountingNav from '@/components/AccountingNav';
import AccountingBoards from '@/components/finance/AccountingBoards';
import MonthShell from '@/components/finance/MonthShell';
import { unitOf } from '@/lib/finance/types';
import { computeBoardTodos } from '@/lib/finance/boardTodos';
import { readIngestHealth, checkInfraHealth } from '@/lib/ingest-health';
import IngestHealthCard from '@/components/finance/IngestHealthCard';

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const ymOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const fmtYm = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;

// 회계 홈 — 2026-09-09 소프트 UI 4단계: 한 화면에 한 가지 일.
//  · 주 패널 "오늘 할 일": 송금 대기(검은 버튼 하나) · 미분류 · 지난달 자료 마감. 나머지 행동은 텍스트 ›.
//  · 보조 패널 2열: 자동 수집 상태 한 줄 · 바로가기.
//  · 그 아래 월별 자료 현황(MonthShell + 상태 그리드)은 확인 전용 그대로(2026-08-01 대표 지시).
// 내비: 상단에서 고른 단위(?unit=)가 현황 보드의 브랜드를 고정한다.
export default async function AccountingDashboardPage({ searchParams }: { searchParams: { unit?: string } }) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const unit = unitOf(searchParams.unit) ?? unitOf('staffmeal')!;
  // 멤버 조회·대기 송금 요약(로그인한 누구나 열람 가능, RLS 동일)·월 배지·미분류 수·수집 상태는 서로 독립 — 병렬 조회.
  // 배지·상태는 부가 정보라 실패해도 페이지는 뜨게 한다.
  const [{ role, brandScope }, { data: pending }, initialTodos, ingestHealth, infraHealth, { count: unclassified }] = await Promise.all([
    resolveMember(supabase, user),
    supabase.schema('finance').from('transfer_requests').select('amount').eq('status', 'pending'),
    computeBoardTodos(supabase, unit.brand).catch(() => undefined),
    readIngestHealth().catch(() => []),
    checkInfraHealth().catch(() => null), // Blob 생사 — 정지 사고(2026-08-20) 후 홈에서 상시 확인
    supabase
      .schema('finance')
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .is('category_id', null)
      .eq('brand', unit.brand),
  ]);
  // 브랜드 스코프 멤버는 분류 화면이 홈
  if (brandScope) redirect('/finance/classify');
  const isStaff = ['admin', 'classifier'].includes(role ?? '');
  const pendingCount = pending?.length ?? 0;
  const pendingSum = (pending ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const unclassifiedCount = unclassified ?? 0;

  // 지난달 남은 자료 — MonthShell 배지와 같은 집계(월별 남은 업무 수)
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  const thisYm = ymOf(kstNow);
  const lastYm = ymOf(new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() - 1, 1)));
  const lastMonthTodos = initialTodos?.[lastYm] ?? 0;

  const todoCount = (pendingCount > 0 ? 1 : 0) + (isStaff && unclassifiedCount > 0 ? 1 : 0) + (isStaff && lastMonthTodos > 0 ? 1 : 0);

  return (
    <PageShell nav={<AccountingNav role={role} />} width="wide" title="회계" subtitle={`${unit.label} · ${fmtYm(thisYm)}`}>
      <div className="space-y-6">
        {/* 주 패널 — 오늘 할 일 */}
        <section className="ta-panel">
          <div className="flex items-baseline gap-2">
            <h2 className="m-0 text-body font-medium">오늘 할 일</h2>
            <span className="text-caption tabular text-muted-foreground">{todoCount}</span>
          </div>
          <div className="mt-2 divide-y divide-border">
            <div className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-body">
                {pendingCount > 0 ? (
                  <>
                    송금 대기 <span className="font-medium">{pendingCount}건 · {won(pendingSum)}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">대기 중인 송금 없음</span>
                )}
              </span>
              {pendingCount > 0 ? (
                <Link href="/dashboard/transfer" className="ta-btn-primary h-8 px-3">
                  이체 처리
                </Link>
              ) : (
                <Link href="/dashboard/transfer" className="text-body text-foreground hover:underline">
                  송금 요청 ›
                </Link>
              )}
            </div>
            {isStaff && (
              <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-body">
                  {unclassifiedCount > 0 ? (
                    <>
                      미분류 <span className="font-medium">{unclassifiedCount}건</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">미분류 없음 — 모두 분류됐어요</span>
                  )}
                </span>
                <Link href={`/finance/classify?unit=${unit.id}&unclassified=1`} className="text-body text-foreground hover:underline">
                  분류 ›
                </Link>
              </div>
            )}
            {isStaff && (
              <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-body">
                  {lastMonthTodos > 0 ? (
                    <>
                      {fmtYm(lastYm)} 자료 마감 <span className="font-medium">남은 항목 {lastMonthTodos}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{fmtYm(lastYm)} 자료 마감 완료</span>
                  )}
                </span>
                <Link href={`/finance/upload/${unit.id}`} className="text-body text-foreground hover:underline">
                  자료 입력 ›
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* 보조 패널 2열 — 수집 상태 한 줄 · 바로가기 */}
        <div className="grid gap-6 sm:grid-cols-2">
          <IngestHealthCard health={ingestHealth} infra={infraHealth} compact />
          <div className="ta-panel">
            <div className="text-body font-medium">바로가기</div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-body">
              {isStaff && (
                <Link href={`/finance/close?unit=${unit.id}`} className="text-foreground hover:underline">
                  월 결산 ›
                </Link>
              )}
              <Link href={`/dashboard/history?unit=${unit.id}`} className="text-foreground hover:underline">
                송금 설정 ›
              </Link>
              {isStaff && (
                <Link href={`/finance/raw?unit=${unit.id}`} className="text-foreground hover:underline">
                  로우데이터 ›
                </Link>
              )}
              <Link href={`/finance?brand=${unit.brand}`} className="text-foreground hover:underline">
                회계 현황 ›
              </Link>
            </div>
            <p className="mt-2 text-caption text-muted-foreground">자주 가는 곳. 전체 메뉴는 위 내비에.</p>
          </div>
        </div>

        {/* 월별 자료 현황 — 기장 권한자만. 좌측 연·월 사이드바(MonthShell)가 현황 그리드 왼쪽에 선다.
            확인 전용(2026-08-01 대표 지시) — 업로드는 각 단위의 자료 입력 페이지에서. */}
        {isStaff && (
          <section className="pt-6">
            {/* 제목은 MonthlyUploadBoard 가 '브랜드 · 월별 자료 현황'으로 그린다 — 여기 또 달지 않는다(2026-09-10 중복 제거) */}
            <MonthShell initialTodos={initialTodos} brand={unit.brand}>
              <AccountingBoards fixedBrand={unit.brand} unitId={unit.id} mode="status" />
            </MonthShell>
          </section>
        )}
      </div>
    </PageShell>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '회계' };
