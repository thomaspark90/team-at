import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMemberStamped } from '@/lib/access/stamp';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import { unitOf, UNITS } from '@/lib/finance/types';
import type { ExpenseGrain } from '@/lib/finance/prepExpense';
import {
  buildMenuPrep,
  menuKeyOf,
  type GiftSale,
  type ItemSaleRow,
  type MenuColumn,
  type MenuMetric,
  type PosDailyTotal,
} from '@/lib/finance/prepMenu';
import { fetchAllRows } from '@/lib/finance/fetchAll';
import MenuPrefsPanel from '@/components/finance/MenuPrefsPanel';

// 전처리4 — POS 메뉴별 판매. 품목 리포트(pos_items)를 기간 축으로 펼치고,
// 총액이 전처리3 POS 매출(pos_sales)과 맞는지 '정합 차이' 열로 상시 검증한다.

const GRAINS: { key: ExpenseGrain; label: string }[] = [
  { key: 'day', label: '일별' },
  { key: 'week', label: '주별' },
  { key: 'month', label: '월별' },
];
const METRICS: { key: MenuMetric; label: string }[] = [
  { key: 'gross', label: '매출' },
  { key: 'qty', label: '수량' },
];
const LIMIT: Record<ExpenseGrain, number> = { day: 45, week: 26, month: 24 };

export default async function PrepMenuPage({
  searchParams,
}: {
  searchParams: { unit?: string; grain?: string; metric?: string };
}) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMemberStamped(supabase, user);
  if (brandScope) redirect('/finance/classify');
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const unit = unitOf(searchParams.unit) ?? UNITS[0];
  if (unit.brand === 'personal') redirect('/finance/classify?unit=personal');
  const grain: ExpenseGrain = GRAINS.some((g) => g.key === searchParams.grain)
    ? (searchParams.grain as ExpenseGrain)
    : 'month';
  const metric: MenuMetric = searchParams.metric === 'qty' ? 'qty' : 'gross';

  // 전량 페이지 조회 — `.limit(50000)`은 서버 Max Rows(20000)에서 조용히 깎인다(2026-08-21 감사 P1-3).
  // pos_items 는 상품×옵션×일 단위라 이 저장소에서 가장 먼저 상한에 닿는 테이블(2026-08 기준 1.9만 행).
  const prefsQ = supabase
    .schema('finance')
    .from('prep_menu_prefs')
    .select('hidden,sort,merges,visible')
    .eq('brand', unit.brand)
    .eq('store', unit.store ?? '')
    .maybeSingle();
  const [itemsData, posData, { data: prefs }, giftData] = await Promise.all([
    fetchAllRows<ItemSaleRow>(
      (from, to) => {
        let q = supabase
          .schema('finance')
          .from('pos_items')
          .select('sale_date,category,product,option,qty,gross')
          .eq('brand', unit.brand)
          .order('id')
          .range(from, to);
        if (unit.store) q = q.eq('store', unit.store);
        return q;
      },
      { page: 20000, label: '품목' }
    ),
    fetchAllRows<PosDailyTotal>(
      (from, to) => {
        let q = supabase.schema('finance').from('pos_sales').select('sale_date,gross').eq('brand', unit.brand).order('id').range(from, to);
        if (unit.store) q = q.eq('store', unit.store);
        return q;
      },
      { page: 20000, label: 'POS 매출' }
    ),
    prefsQ,
    fetchAllRows<GiftSale>(
      (from, to) => {
        let q = supabase.schema('finance').from('pos_gift_sales').select('sale_date,qty,gross').eq('brand', unit.brand).order('id').range(from, to);
        if (unit.store) q = q.eq('store', unit.store);
        return q;
      },
      { page: 20000, label: '식권 판매', missingTableOk: true }
    ),
  ]);
  const hidden = new Set(((prefs?.hidden as string[] | null) ?? []).filter((x) => typeof x === 'string'));
  const sortPref = ((prefs?.sort as string[] | null) ?? []).filter((x) => typeof x === 'string');
  const merges = (prefs?.merges ?? {}) as Record<string, string[]>;
  // 화이트리스트(2026-08-20) — visible 이 있으면 그 목록만 노출. 새 상품(재업로드로 유입된
  // 2023~24 옛 메뉴 포함)은 체크 전까지 표에 안 나온다. hidden 은 레거시 폴백.
  const visiblePref = (prefs?.visible as string[] | null) ?? null;
  const isShown = (label: string) => (visiblePref ? visiblePref.includes(label) : !hidden.has(label));

  const { buckets: allBuckets, summary, detail } = buildMenuPrep(itemsData, posData, grain, metric, giftData);
  const buckets = allBuckets.slice(0, LIMIT[grain]);

  // 병합 적용 — 소스 열의 금액을 대표 열로 합산하고 소스 열은 제거. 표시 차원의 병합이라
  // pos_items 원본·합계·정합 차이에는 아무 영향이 없다(대표가 데이터에 없으면 새 열로 생성).
  const mergedDetail = (() => {
    const srcToTarget = new Map<string, string>();
    for (const [t, list] of Object.entries(merges)) for (const src of list) srcToTarget.set(src, t);
    if (srcToTarget.size === 0) return detail;
    const byLabel = new Map(detail.filter((c) => c.kind === 'menu').map((c) => [c.label, c]));
    const out: MenuColumn[] = [];
    for (const c of detail) {
      if (c.kind !== 'menu') { out.push(c); continue; }
      if (srcToTarget.has(c.label)) continue; // 소스 — 대표에 흡수
      const srcs = merges[c.label] ?? [];
      if (srcs.length === 0) { out.push(c); continue; }
      const amounts = { ...c.amounts };
      const qtyAmounts = c.qtyAmounts ? { ...c.qtyAmounts } : undefined;
      for (const sl of srcs) {
        const sc = byLabel.get(sl);
        if (!sc) continue;
        for (const [b, v] of Object.entries(sc.amounts)) amounts[b] = (amounts[b] ?? 0) + v;
        if (qtyAmounts && sc.qtyAmounts)
          for (const [b, v] of Object.entries(sc.qtyAmounts)) qtyAmounts[b] = (qtyAmounts[b] ?? 0) + v;
      }
      out.push({ ...c, amounts, qtyAmounts, hint: `병합된 표기 ${srcs.length}개 포함: ${srcs.join(', ')}` });
    }
    // 대표가 데이터에 없는 경우(현재 판매 0) — 소스만 있으면 대표 열을 만들어준다
    for (const [t, list] of Object.entries(merges)) {
      if (byLabel.has(t) || out.some((c) => c.label === t)) continue;
      const amounts: Record<string, number> = {};
      const qtyAmounts: Record<string, number> = {};
      for (const sl of list) {
        const sc = byLabel.get(sl);
        if (!sc) continue;
        for (const [b, v] of Object.entries(sc.amounts)) amounts[b] = (amounts[b] ?? 0) + v;
        if (sc.qtyAmounts) for (const [b, v] of Object.entries(sc.qtyAmounts)) qtyAmounts[b] = (qtyAmounts[b] ?? 0) + v;
      }
      if (Object.keys(amounts).length > 0)
        out.push({ key: `m:${t}`, label: t, kind: 'menu', amounts, qtyAmounts, hint: `병합된 표기 ${list.length}개 포함: ${list.join(', ')}` });
    }
    return out;
  })();

  // 상세 열에 설정 적용 — 숨김 제외(합계 열은 항상), 명시 순서 먼저 + 나머지는 기본(총액)순.
  // 합계·정합 열은 전 상품 기준 그대로다: 숨김은 '안 보는 것'이지 '없는 셈 치는 것'이 아니다.
  const allProducts = detail.filter((c) => c.kind === 'menu').map((c) => c.label);
  const detailShown = (() => {
    const menuCols = mergedDetail.filter((c) => c.kind === 'menu' && isShown(c.label));
    const inSort = sortPref
      .map((label) => menuCols.find((c) => c.label === label))
      .filter((c): c is MenuColumn => !!c);
    const rest = menuCols.filter((c) => !sortPref.includes(c.label));
    return [...inSort, ...rest, ...mergedDetail.filter((c) => c.kind !== 'menu')];
  })();
  // 메뉴 요약은 상세 표의 '요약'이다(2026-08-20 대표 지시) — 상세 설정(숨김·순서·병합)을 그대로
  // 따른다: 노출된 상품만 메뉴로 묶고, 그룹 순서는 상세에서 그 메뉴의 상품이 처음 나오는 자리.
  // 합계·정합 열은 여전히 전체 상품 기준 — 숨김은 '안 보는 것'이지 '없는 셈 치는 것'이 아니다.
  const summaryShown = (() => {
    const groups = new Map<string, Record<string, number>>();
    const orderKeys: string[] = [];
    const groupQty = new Map<string, Record<string, number>>();
    for (const c of detailShown) {
      if (c.kind !== 'menu') continue;
      // 묶음 키는 라벨('상품 · 옵션')이 아니라 원본 상품명으로 — 라벨로 묶으면 옵션 있는
      // 토스 데이터에서 같은 메뉴가 옵션 조합 수만큼 쪼개진다(2026-08-21 감사 P2-3).
      // 병합 대표 열처럼 product 가 없는 합성 열은 라벨의 ' · ' 앞 토막으로 폴백.
      const k = menuKeyOf(c.product ?? c.label.split(' · ')[0]);
      if (!groups.has(k)) {
        groups.set(k, {});
        groupQty.set(k, {});
        orderKeys.push(k);
      }
      const g = groups.get(k)!;
      for (const [b, v] of Object.entries(c.amounts)) g[b] = (g[b] ?? 0) + v;
      const gq = groupQty.get(k)!;
      if (c.qtyAmounts) for (const [b, v] of Object.entries(c.qtyAmounts)) gq[b] = (gq[b] ?? 0) + v;
    }
    const groupCols: MenuColumn[] = orderKeys.map((k) => ({
      key: `g:${k}`,
      label: k,
      kind: 'menu',
      amounts: groups.get(k)!,
      qtyAmounts: metric === 'gross' ? groupQty.get(k) : undefined,
      hint: '상세 표에 노출된 상품들의 합 — 상세 표 설정(숨김·순서·병합)을 따라요. 작은 숫자는 주문수예요.',
    }));
    return [...groupCols, ...summary.filter((c) => c.kind !== 'menu')];
  })();
  const num = (n: number) => (n === 0 ? '' : n.toLocaleString());
  const bucketLabel = (b: string) => (grain === 'week' ? `${b.slice(5).replace('-', '/')}~` : b);
  const href = (next: { grain?: string; metric?: string }) =>
    `/finance/prep/menu?unit=${unit.id}&grain=${next.grain ?? grain}&metric=${next.metric ?? metric}`;

  const renderTable = (columns: MenuColumn[]) => (
    <div className="overflow-auto rounded-md border border-border">
      <table className="w-max min-w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border text-muted-foreground">
            <th className="sticky left-0 z-20 whitespace-nowrap bg-card px-3 py-2 text-left font-normal">기간</th>
            {columns.map((c) => (
              <th
                key={c.key}
                title={c.hint}
                className={`whitespace-nowrap px-3 py-2 text-right font-normal ${
                  c.kind === 'total' ? 'border-l-2 border-l-border font-medium text-foreground' : ''
                } ${c.kind === 'derived' ? 'text-muted-foreground/70' : ''}`}
              >
                {c.label}
                {c.hint && <span className="ml-1 text-muted-foreground/50">ⓘ</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b} className="border-b border-border/50 last:border-0">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-background px-3 py-1.5 tabular-nums">
                {bucketLabel(b)}
              </td>
              {columns.map((c) => {
                const v = c.amounts[b] ?? 0;
                const isDiff = c.key === 'diff';
                return (
                  <td
                    key={c.key}
                    className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                      c.kind === 'total' ? 'border-l-2 border-l-border font-medium' : ''
                    } ${c.kind === 'derived' ? 'text-muted-foreground' : ''} ${
                      isDiff && v !== 0 ? 'font-medium text-foreground' : ''
                    }`}
                  >
                    {isDiff && v !== 0 ? (
                      `⚠ ${v > 0 ? '+' : ''}${num(v)}`
                    ) : c.qtyAmounts ? (
                      <span className="inline-flex flex-col items-end leading-tight">
                        <span>{num(v)}</span>
                        {(c.qtyAmounts[b] ?? 0) !== 0 && (
                          <span className="text-[11px] text-muted-foreground">{num(c.qtyAmounts[b] ?? 0)}개</span>
                        )}
                      </span>
                    ) : (
                      num(v)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1680px] px-6 py-8">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">전처리4 — 메뉴별 판매</h1>
          <Link
            href={`/finance/prep/revenue?unit=${unit.id}&grain=${grain}`}
            className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← 전처리3 매출 총합
          </Link>
        </div>
        <p className="mb-5 max-w-[880px] text-[13px] text-muted-foreground">
          <b>{unit.label}</b>의 품목 리포트(pos_items)를 메뉴 축으로 펼친 표예요. 요약은 매장/포장·사이즈·
          한/영 표기를 <b>메뉴 하나로 묶고</b>(Staff·Newbie…), 상세는 상품 원문 그대로예요.
          매출 뷰의 <b>정합 차이</b> 열이 0이 아니면 품목 리포트와 POS 총액(전처리3 정본)이 어긋난 거예요.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-border">
            {GRAINS.map((g) => (
              <Link
                key={g.key}
                href={href({ grain: g.key })}
                aria-current={g.key === grain ? 'page' : undefined}
                className={`px-3 py-1.5 text-[13px] transition-colors ${
                  g.key === grain ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {g.label}
              </Link>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-border">
            {METRICS.map((m) => (
              <Link
                key={m.key}
                href={href({ metric: m.key })}
                aria-current={m.key === metric ? 'page' : undefined}
                className={`px-3 py-1.5 text-[13px] transition-colors ${
                  m.key === metric ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </Link>
            ))}
          </div>
          <span className="text-[12px] text-muted-foreground">
            {metric === 'gross' ? '부가세 포함 총액' : '판매 수량'}
            {allBuckets.length > buckets.length && ` · 최근 ${buckets.length}개 구간`}
          </span>
        </div>

        <h2 className="mb-2 mt-2 text-[15px] font-medium">메뉴 요약</h2>
        <div className="mb-8">{renderTable(summaryShown)}</div>

        <h2 className="mb-2 text-[15px] font-medium">상품별 상세</h2>
        {renderTable(detailShown)}
        <MenuPrefsPanel
          unit={unit.id}
          products={allProducts}
          visible={visiblePref ?? allProducts.filter((p) => !hidden.has(p))}
          sort={sortPref}
          merges={merges}
        />

        <div className="mt-4 flex flex-col gap-1 text-[12px] text-muted-foreground">
          {summary
            .filter((c) => c.hint)
            .map((c) => (
              <p key={c.key} className="m-0">
                <b className="text-foreground">{c.label}</b> — {c.hint}
              </p>
            ))}
          <p className="m-0 mt-2">
            식권 판매(선수금)는 품목 리포트와 POS 매출 양쪽에서 제외돼 있어요 — 식권을 <b>쓴</b> 날의 일반
            메뉴 행으로 잡혀요.
          </p>
          {unit.brand === 'staffmeal' && (
            <p className="m-0 mt-1">
              <b className="text-foreground">배달 표기 규칙(2026-08-20)</b> — 배달앱 판매는 매장·포장과 가격
              체계가 다르고 세트 구분이 없어서 <b>Staff (배달)</b>·<b>Newbie (배달)</b>·<b>Boss (배달)</b>로
              별도 표기해요(구 표기 &lsquo;STAFF (Medium)&rsquo;·&lsquo;뉴비 (NEWBIE) (Small)&rsquo;·
              &lsquo;보스 (BOSS) (Large)&rsquo; 등을 병합). &lsquo;staff포장&rsquo;(2025-05-31 하루 임시 등록,
              76개)은 Staff (기본 / 포장)에 병합돼 있어요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const metadata = { title: '전처리4 — 메뉴별 판매' };
