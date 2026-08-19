import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { brandLabel, storeLabel } from '@/lib/finance/types';
import { learnStoreRule } from '@/lib/finance/storeRules';
import type { StoreCode } from '@/lib/finance/storeGuess';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 브랜드·지점 일괄 재분류(소급 도구) — 잘못 귀속된 거래를 다른 브랜드/지점으로 옮긴다.
// 과거 전체 소급 방침(2026-07-28): 기존에 전부 garden으로 쌓인 거래를 가맹점(정규화 키) 단위로
// 한 번에 옮길 수 있어야 수작업이 줄어든다.
// POST { ids: number[], brand, store, scope: 'selected' | 'key' }
//   scope=selected: 선택한 행만 이동
//   scope=key: 선택한 행들의 가맹점(정규화 키) 전체를 과거까지 소급 이동
// 확정된 달(원 브랜드든 대상 브랜드든)은 건드리지 않는다.

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '분류 권한이 없습니다.' }, { status: 403 });
  }

  let body: { ids?: number[]; brand?: string; store?: string | null; scope?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문이 필요합니다.' }, { status: 400 });
  }
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isFinite(n));
  const brand = body.brand;
  const store = body.store ?? null;
  const scope = body.scope === 'key' ? 'key' : 'selected';
  if (!ids.length) return NextResponse.json({ error: '이동할 거래를 선택하세요.' }, { status: 400 });
  if (brand !== 'staffmeal' && brand !== 'garden' && brand !== 'personal') {
    return NextResponse.json({ error: '브랜드가 올바르지 않습니다.' }, { status: 400 });
  }
  if (store != null && store !== 'pangyo' && store !== 'yangjae') {
    return NextResponse.json({ error: '지점이 올바르지 않습니다.' }, { status: 400 });
  }
  if (brand !== 'garden' && store != null) {
    return NextResponse.json({ error: `${brand === 'personal' ? '개인' : '스탭밀'}은 지점 구분이 없습니다.` }, { status: 400 });
  }

  // 확정된 달 — (ym, brand) 단위. 원 브랜드/대상 브랜드 어느 쪽이든 확정이면 그 달은 스킵.
  const { data: closedRows } = await supabase
    .schema('finance')
    .from('monthly_close')
    .select('ym,brand,status')
    .eq('status', 'confirmed');
  const closed = new Set((closedRows ?? []).map((c: { ym: string; brand?: string }) => `${c.ym}|${c.brand ?? 'garden'}`));
  const isClosed = (ym: string, b: string) => closed.has(`${ym}|${b}`);

  const { data: selRows } = await supabase
    .schema('finance')
    .from('transactions')
    .select('id,ym,brand,normalized_key')
    .in('id', ids);
  const selected = (selRows ?? []) as { id: number; ym: string; brand: string; normalized_key: string }[];
  if (!selected.length) return NextResponse.json({ error: '거래를 찾을 수 없습니다.' }, { status: 404 });

  let moved = 0;
  let skipped = 0;

  if (scope === 'selected') {
    const ok = selected.filter((r) => !isClosed(r.ym, r.brand) && !isClosed(r.ym, brand));
    skipped = selected.length - ok.length;
    if (ok.length) {
      const { data, error } = await supabase
        .schema('finance')
        .from('transactions')
        .update({ brand, store })
        .in('id', ok.map((r) => r.id))
        .select('id');
      if (error) return NextResponse.json({ error: `이동 실패: ${error.message}` }, { status: 500 });
      moved = data?.length ?? 0;
      // 지점 학습 — 이 가맹점을 다음부터 자동으로 채우기 위해 기록(2026-08-17, 지점 미지정 보완)
      if (brand === 'garden' && store) {
        const keys = Array.from(new Set(ok.map((r) => r.normalized_key).filter(Boolean)));
        for (const key of keys) await learnStoreRule(supabase, key, store as StoreCode, user.id);
      }
    }
  } else {
    // 가맹점 전체 소급 — 선택 행들의 (정규화 키, 현재 브랜드) 그룹별로 과거 전체 이동.
    const groups = new Map<string, { key: string; fromBrand: string }>();
    for (const r of selected) {
      if (!r.normalized_key) continue;
      groups.set(`${r.brand}|${r.normalized_key}`, { key: r.normalized_key, fromBrand: r.brand });
    }
    // 확정된 달은 not-in 으로 제외 — 원/대상 브랜드 확정월의 합집합(보수적).
    for (const g of Array.from(groups.values())) {
      const excludedYms = Array.from(
        new Set(
          Array.from(closed)
            .filter((k) => k.endsWith(`|${g.fromBrand}`) || k.endsWith(`|${brand}`))
            .map((k) => k.split('|')[0]),
        ),
      );
      let q = supabase
        .schema('finance')
        .from('transactions')
        .update({ brand, store })
        .eq('normalized_key', g.key)
        .eq('brand', g.fromBrand);
      if (excludedYms.length) q = q.not('ym', 'in', `(${excludedYms.join(',')})`);
      const { data, error } = await q.select('id');
      if (error) return NextResponse.json({ error: `이동 실패: ${error.message}` }, { status: 500 });
      moved += data?.length ?? 0;

      // 학습 규칙도 따라 이동 — 대상 브랜드에 같은 키 규칙이 없으면 복사
      const { data: rule } = await supabase
        .schema('finance')
        .from('rules')
        .select('category_id')
        .eq('normalized_key', g.key)
        .eq('brand', g.fromBrand)
        .maybeSingle();
      if (rule) {
        await supabase
          .schema('finance')
          .from('rules')
          .upsert(
            { normalized_key: g.key, brand, category_id: rule.category_id, created_by: user.id },
            { onConflict: 'normalized_key,brand', ignoreDuplicates: true },
          );
      }

      // 지점 학습 — 이 가맹점을 다음부터 자동으로 채우기 위해 기록(2026-08-17, 지점 미지정 보완)
      if (brand === 'garden' && store) await learnStoreRule(supabase, g.key, store as StoreCode, user.id);
    }
  }

  await logActivity(
    supabase,
    user,
    '브랜드·지점 재분류',
    `${scope === 'key' ? '가맹점 소급' : '선택'} ${moved}건 → ${brandLabel(brand)}${store ? `·${storeLabel(store)}` : ''}${skipped ? ` (확정월 ${skipped}건 제외)` : ''}`,
  );
  return NextResponse.json({ moved, skipped });
}
