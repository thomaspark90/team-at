import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveMemberStamped } from '@/lib/access/stamp';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import RawTable from '@/components/finance/RawTable';
import { unitOf, UNITS } from '@/lib/finance/types';
import {
  deriveColumns,
  fetchRawBatches,
  fetchRawRows,
  isRawSource,
  RAW_SOURCES,
  type RawSource,
} from '@/lib/finance/rawQuery';

// 로우데이터 — 파서가 읽은 원본 행을 가공 전 그대로 보는 화면(2026-08-19).
// 스프레드시트 시절의 '로우데이터 시트'에 해당한다. 여기서 원본을 확인한 뒤 전처리 화면으로
// 넘어가는 순서로 봐야, 집계 단계에서 생긴 이중계상·오분류를 작은 단위에서 잡을 수 있다.
export default async function RawPage({
  searchParams,
}: {
  searchParams: { unit?: string; source?: string; ym?: string };
}) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMemberStamped(supabase, user);
  if (brandScope) redirect('/finance/classify');
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const unit = unitOf(searchParams.unit) ?? UNITS[0];
  const source: RawSource = isRawSource(searchParams.source) ? searchParams.source : 'bank';
  const ym = /^\d{4}-\d{2}$/.test(searchParams.ym ?? '') ? searchParams.ym! : null;

  const batches = await fetchRawBatches(supabase, { source, brand: unit.brand, ym });
  const rows = await fetchRawRows(
    supabase,
    batches.map((b) => b.id),
    { offset: 0, limit: 200 }
  );
  const columns = deriveColumns(batches, rows);

  // 분류 이름 — 가공 결과 배지에 계정과목을 표시하려고
  const { data: cats } = await supabase.schema('finance').from('categories').select('id,name');
  const categoryNames: Record<number, string> = {};
  (cats ?? []).forEach((c: { id: number; name: string }) => (categoryNames[c.id] = c.name));

  // 월 필터 후보 — 적재된 배치들이 걸쳐 있는 달
  const months = Array.from(
    new Set(
      batches.flatMap((b) => {
        const out: string[] = [];
        if (b.period_start) out.push(b.period_start.slice(0, 7));
        if (b.period_end) out.push(b.period_end.slice(0, 7));
        return out;
      })
    )
  ).sort((a, b) => b.localeCompare(a));

  const href = (next: { source?: string; ym?: string | null }) => {
    const p = new URLSearchParams({ unit: unit.id, source: next.source ?? source });
    const nextYm = next.ym === undefined ? ym : next.ym;
    if (nextYm) p.set('ym', nextYm);
    return `/finance/raw?${p}`;
  };

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
        </p>

        {/* 출처 탭 */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-border">
            {RAW_SOURCES.map((s) => (
              <Link
                key={s.key}
                href={href({ source: s.key, ym: null })}
                aria-current={s.key === source ? 'page' : undefined}
                className={`px-3 py-1.5 text-[13px] transition-colors ${
                  s.key === source ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
          {months.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={href({ ym: null })}
                aria-current={!ym ? 'page' : undefined}
                className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                  !ym ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                전체
              </Link>
              {months.map((m) => (
                <Link
                  key={m}
                  href={href({ ym: m })}
                  aria-current={m === ym ? 'page' : undefined}
                  className={`rounded-md border px-2.5 py-1 text-[12px] tabular-nums transition-colors ${
                    m === ym ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m}
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
          source={source}
          brand={unit.brand}
          ym={ym}
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
