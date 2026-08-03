import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { lockedYms } from '@/lib/finance/monthLock';

export const runtime = 'nodejs';
export const maxDuration = 60;

// AI 추천 '확신 항목' 일괄 적용 — 그룹(정규화 키)마다 클라이언트가 DB를 두드리던 것을
// 한 요청으로 처리한다(2025 소급처럼 그룹 수백 개일 때 수십 배 빠름).
// 키별 미분류 거래에 계정 지정 + 규칙(rules) 학습. 확정월 거래는 건드리지 않는다.
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

  let body: { brand?: string; items?: { key?: string; categoryId?: number }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 잘못됐어요.' }, { status: 400 });
  }
  const brand = body.brand;
  if (!brand || !['garden', 'staffmeal', 'personal'].includes(brand)) {
    return NextResponse.json({ error: '브랜드가 올바르지 않습니다.' }, { status: 400 });
  }
  const items = (body.items ?? []).filter(
    (i): i is { key: string; categoryId: number } =>
      typeof i.key === 'string' && i.key.length > 0 && Number.isInteger(i.categoryId)
  );
  if (items.length === 0) return NextResponse.json({ updated: 0, rulesSaved: 0 });
  if (items.length > 2000) {
    return NextResponse.json({ error: '한 번에 2,000개 그룹까지만 적용할 수 있어요.' }, { status: 400 });
  }

  // 존재하는 계정과목만 허용
  const { data: cats } = await supabase.schema('finance').from('categories').select('id').eq('active', true);
  const validIds = new Set((cats ?? []).map((c: { id: number }) => c.id));
  const valid = items.filter((i) => validIds.has(i.categoryId));

  const locked = Array.from(await lockedYms(supabase, brand));
  const now = new Date().toISOString();

  // 같은 계정으로 가는 키들을 묶어 UPDATE 횟수 최소화
  const byCat = new Map<number, string[]>();
  for (const i of valid) {
    if (!byCat.has(i.categoryId)) byCat.set(i.categoryId, []);
    byCat.get(i.categoryId)!.push(i.key);
  }

  let updated = 0;
  for (const [categoryId, keys] of Array.from(byCat.entries())) {
    for (let i = 0; i < keys.length; i += 100) {
      let q = supabase
        .schema('finance')
        .from('transactions')
        .update({ category_id: categoryId, classified_by: user.id, classified_at: now })
        .eq('brand', brand)
        .is('category_id', null)
        .in('normalized_key', keys.slice(i, i + 100));
      if (locked.length) q = q.not('ym', 'in', `(${locked.join(',')})`);
      const { data, error } = await q.select('id');
      if (error) return NextResponse.json({ error: `적용 실패: ${error.message}` }, { status: 500 });
      updated += data?.length ?? 0;
    }
  }

  // 규칙 학습 — 다음 업로드부터 자동 분류되게
  const ruleRows = valid.map((i) => ({
    normalized_key: i.key,
    brand,
    category_id: i.categoryId,
    created_by: user.id,
  }));
  for (let i = 0; i < ruleRows.length; i += 200) {
    const { error } = await supabase
      .schema('finance')
      .from('rules')
      .upsert(ruleRows.slice(i, i + 200), { onConflict: 'normalized_key,brand' });
    if (error) return NextResponse.json({ error: `규칙 저장 실패: ${error.message}` }, { status: 500 });
  }

  await logActivity(supabase, user, 'AI 분류 일괄 적용', `[${brand}] ${valid.length}그룹 · 거래 ${updated}건`);
  return NextResponse.json({ updated, rulesSaved: valid.length });
}
