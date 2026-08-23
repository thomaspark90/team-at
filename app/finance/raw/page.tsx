import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMemberStamped } from '@/lib/access/stamp';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import RawTable from '@/components/finance/RawTable';
import { unitOf, UNITS } from '@/lib/finance/types';
import { deriveColumns, fetchRawBatches, fetchRawRows, RAW_SOURCES } from '@/lib/finance/rawQuery';
import { bankShort } from '@/lib/finance/cashflow';
import { parseRawQuery } from '@/lib/finance/rawParams';

// 로우데이터 — 파서가 읽은 원본 행을 가공 전 그대로 보는 화면(2026-08-19).
// 스프레드시트 시절의 '로우데이터 시트'에 해당한다. 여기서 원본을 확인한 뒤 전처리 화면으로
// 넘어가는 순서로 봐야, 집계 단계에서 생긴 이중계상·오분류를 작은 단위에서 잡을 수 있다.
export default async function RawPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMemberStamped(supabase, user);
  if (brandScope) redirect('/finance/classify');
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const unit = unitOf(searchParams.unit) ?? UNITS[0];
  const sp = new URLSearchParams(
    Object.entries(searchParams).filter((e): e is [string, string] => e[1] != null)
  );
  const query = { ...parseRawQuery(sp), brand: unit.brand };

  // 배치는 계좌 필터 없이 받아 '이 단위가 쓰는 계좌 목록'을 뽑고(칩 노출 판단),
  // 표시·컬럼 유도용 목록은 선택된 계좌로 거른다 — 신한/우리 헤더가 달라 섞이면 열이 어긋난다.
  const allBatches = await fetchRawBatches(supabase, {
    source: query.source,
    brand: unit.brand,
    from: query.from,
    to: query.to,
  });
  const issuers = Array.from(new Set(allBatches.map((b) => b.issuer).filter((x): x is string => !!x))).sort();
  const batches = query.issuer ? allBatches.filter((b) => b.issuer === query.issuer) : allBatches;
  const rows = await fetchRawRows(supabase, query, { offset: 0, limit: 200 });
  const columns = deriveColumns(batches, rows);

  // 분류 이름 — 가공 결과 열에 계정과목을 표시하려고
  const { data: cats } = await supabase.schema('finance').from('categories').select('id,name');
  const categoryNames: Record<number, string> = {};
  (cats ?? []).forEach((c: { id: number; name: string }) => (categoryNames[c.id] = c.name));

  // 월 단축 후보 — 적재된 배치들이 걸쳐 있는 달
  // 기간 단축 — 배치 경계 월을 나열하면 무슨 기준인지 안 읽힌다(2026-08-20 보고).
  // 데이터가 걸친 범위를 반기(1~6월/7~12월)로 잘라 '2025 상반기' 같은 칩으로 제공한다.
  const halves = (() => {
    const yms = batches.flatMap((b) => [b.period_start?.slice(0, 7), b.period_end?.slice(0, 7)]).filter(Boolean) as string[];
    if (yms.length === 0) return [] as { label: string; from: string; to: string }[];
    const min = yms.reduce((a, b) => (a < b ? a : b));
    const max = yms.reduce((a, b) => (a > b ? a : b));
    const out: { label: string; from: string; to: string }[] = [];
    for (let y = Number(min.slice(0, 4)); y <= Number(max.slice(0, 4)); y++) {
      for (const h of [0, 1] as const) {
        const from = `${y}-${h === 0 ? '01' : '07'}-01`;
        const to = `${y}-${h === 0 ? '06-30' : '12-31'}`;
        // 데이터 범위와 겹치는 반기만
        if (to.slice(0, 7) < min || from.slice(0, 7) > max) continue;
        out.push({ label: `${y} ${h === 0 ? '상반기' : '하반기'}`, from, to });
      }
    }
    return out.reverse(); // 최신이 앞
  })();

  const href = (next: { source?: string; issuer?: string | null; from?: string | null; to?: string | null }) => {
    const source = next.source ?? query.source;
    const p = new URLSearchParams({ unit: unit.id, source });
    // 계좌 필터 — 같은 소스 안에서만 유지(소스를 바꾸면 그 소스의 계좌 개념이 다르므로 해제)
    const issuer = 'issuer' in next ? next.issuer : source === query.source ? query.issuer : null;
    if (issuer) p.set('issuer', issuer);
    if (next.from && next.to) {
      p.set('from', next.from);
      p.set('to', next.to);
    }
    return `/finance/raw?${p}`;
  };
  const activeHalf = halves.find((h) => h.from === query.from && h.to === query.to)?.label ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1680px] px-6 py-8">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">로우데이터</h1>
          <Link
            href="/finance/originals"
            className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            원본 자료함 →
          </Link>
        </div>
        <p className="mb-5 text-[13px] text-muted-foreground">
          <b>{unit.label}</b> 자료의 원본 행이에요 — 파서가 파일에서 읽은 그대로, 부호 변환·분류·중복제거를
          거치기 전 상태예요. 행 번호는 원본 파일에서의 위치라 엑셀과 나란히 두고 대조할 수 있어요.
          컬럼 제목을 누르면 정렬되고, 그 아래 칸에 입력하면 그 열로 걸러져요.
        </p>

        {/* 출처 탭 + 월 단축 */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-border">
            {RAW_SOURCES.map((s) => (
              <Link
                key={s.key}
                href={href({ source: s.key })}
                aria-current={s.key === query.source ? 'page' : undefined}
                className={`px-3 py-1.5 text-[13px] transition-colors ${
                  s.key === query.source
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
          {/* 계좌 칩 — 계좌가 2개 이상인 단위(가든 양재: 신한+우리)에서만. 표·소계·CSV 전부 이 필터를 따른다(2026-08-23) */}
          {issuers.length >= 2 && (
            <div className="flex overflow-hidden rounded-md border border-border">
              <Link
                href={href({ issuer: null })}
                aria-current={!query.issuer ? 'page' : undefined}
                className={`px-3 py-1.5 text-[13px] transition-colors ${
                  !query.issuer ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                전체 계좌
              </Link>
              {issuers.map((iss) => (
                <Link
                  key={iss}
                  href={href({ issuer: iss })}
                  aria-current={query.issuer === iss ? 'page' : undefined}
                  className={`px-3 py-1.5 text-[13px] transition-colors ${
                    query.issuer === iss ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {bankShort(iss)}
                </Link>
              ))}
            </div>
          )}
          {halves.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={href({})}
                aria-current={!activeHalf && !query.from ? 'page' : undefined}
                className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                  !activeHalf && !query.from
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                전체
              </Link>
              {halves.map((h) => (
                <Link
                  key={h.label}
                  href={href({ from: h.from, to: h.to })}
                  aria-current={h.label === activeHalf ? 'page' : undefined}
                  className={`rounded-md border px-2.5 py-1 text-[12px] tabular-nums transition-colors ${
                    h.label === activeHalf
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {h.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 배치 목록 — 같은 파일을 두 번 올렸는지가 여기서 드러난다 */}
        {batches.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2 text-[12px] text-muted-foreground">
            {batches.map((b) => (
              <span key={b.id} className="rounded-md border border-border px-2 py-1">
                {b.filename ?? `${b.issuer ?? b.source} 수집`}
                <span className="ml-1.5 tabular-nums opacity-60">
                  {b.row_count.toLocaleString()}행 · {b.ingested_at.slice(0, 10)}
                </span>
              </span>
            ))}
          </div>
        )}

        <RawTable
          query={query}
          columns={columns}
          initialRows={rows}
          initialHasMore={rows.length === 200}
          categoryNames={categoryNames}
        />
      </div>
    </div>
  );
}

export const metadata = { title: '로우데이터' };
