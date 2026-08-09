import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { canConfirm } from '@/lib/finance/access';
import { resolveMemberStamped } from '@/lib/access/stamp';
import { unwrap } from '@/lib/finance/db';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import MonthlyCloseManager, { type MonthRow } from '@/components/finance/MonthlyCloseManager';
import MonthShell from '@/components/finance/MonthShell';
import { computeBoardTodos } from '@/lib/finance/boardTodos';
import { unitOf } from '@/lib/finance/types';

export default async function ClosePage({ searchParams }: { searchParams: { brand?: string; unit?: string } }) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMemberStamped(supabase, user);
  // 브랜드 스코프 멤버는 분류 화면이 홈
  if (brandScope) redirect('/finance/classify');
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');
  const allowConfirm = await canConfirm(supabase, user);
  // 확정은 3단위 — 단위는 상단 내비(2단)에서 선택돼 ?unit= 으로 내려온다 (기본 스탭밀, 구 ?brand= 링크 호환)
  // 개인(personal) 단위는 월 확정 대상이 아니다 — 진입 시 스탭밀로 대체.
  const requested = unitOf(searchParams.unit);
  const unit =
    (requested && requested.id !== 'personal' ? requested : null) ??
    (searchParams.brand === 'garden' ? unitOf('yangjae')! : unitOf('staffmeal')!);
  if (requested?.id === 'personal') redirect('/finance/classify?unit=personal');

  // 월별 거래수·미분류수 집계 (데이터량이 작아 JS 집계) — 선택된 단위만.
  // 가든 지점 단위는 '지점 미지정' 가든 거래도 함께 집계 — 미지정이 남으면 확정 불가.
  const txns = unwrap(
    await supabase.schema('finance').from('transactions').select('ym,category_id,store').eq('brand', unit.brand),
    '거래',
  );

  const closes = unwrap(
    await supabase
      .schema('finance')
      .from('monthly_close')
      .select('ym,status,confirmed_at,brand,store')
      .eq('brand', unit.brand)
      .eq('store', unit.store ?? ''),
    '월 확정',
  );

  const closeMap = new Map(
    (closes ?? []).map((c: { ym: string; status: string; confirmed_at: string | null }) => [c.ym, c])
  );
  const agg = new Map<string, { total: number; unclassified: number; unassigned: number }>();
  for (const t of (txns as { ym: string; category_id: number | null; store: string | null }[]) ?? []) {
    const a = agg.get(t.ym) ?? { total: 0, unclassified: 0, unassigned: 0 };
    if (unit.store) {
      // 지점 단위: 그 지점 거래 + 미지정 거래(확정 차단 사유)를 나눠 센다
      if (t.store === unit.store) {
        a.total += 1;
        if (t.category_id == null) a.unclassified += 1;
      } else if (t.store == null) {
        a.unassigned += 1;
      } else {
        agg.set(t.ym, a);
        continue;
      }
    } else {
      a.total += 1;
      if (t.category_id == null) a.unclassified += 1;
    }
    agg.set(t.ym, a);
  }
  const months: MonthRow[] = Array.from(agg.entries())
    .filter(([, a]) => a.total > 0 || a.unassigned > 0)
    .map(([ym, a]) => {
      const c = closeMap.get(ym);
      return {
        ym,
        total: a.total,
        unclassified: a.unclassified,
        unassigned: a.unassigned,
        status: (c?.status as MonthRow['status']) ?? 'open',
        confirmedAt: c?.confirmed_at ?? null,
      };
    })
    .sort((a, b) => b.ym.localeCompare(a.ym));

  // 좌측 연·월 사이드바 배지 — 이 단위의 브랜드 몫만
  const initialTodos = await computeBoardTodos(supabase, unit.brand).catch(() => undefined);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">월 확정</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 재무 홈
          </Link>
        </div>
        <p className="mb-5 mt-0 text-[13px] leading-[1.6] text-muted-foreground">
          <b>{unit.label}</b>의 월 확정이에요 — 단위는 상단에서 선택해요. 미분류
          {unit.store ? '와 지점 미지정 가든 거래' : ''}가 0건인 달만 확정할 수 있고, 확정하면 그 달·그 단위의 지출 자료 분류가
          잠겨요. {allowConfirm ? '' : '(확정 권한은 관리자에게 요청하세요.)'}
        </p>
        {/* personal 은 위에서 리다이렉트되므로 여기 unit 은 항상 사업 단위.
            좌측 연·월 사이드바 — 달을 고르면 표에서 그 달 행을 하이라이트·스크롤(2026-08-03) */}
        <MonthShell brand={unit.brand} initialTodos={initialTodos}>
          <MonthlyCloseManager
            key={unit.id}
            months={months}
            canConfirm={allowConfirm}
            unit={unit.id as 'staffmeal' | 'yangjae' | 'pangyo'}
            brand={unit.brand as 'staffmeal' | 'garden'}
          />
        </MonthShell>
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '월 확정' };
