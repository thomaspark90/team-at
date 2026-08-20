import { NextResponse } from 'next/server';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { unitOf } from '@/lib/finance/types';

export const runtime = 'nodejs';

// 전처리4 상품별 상세의 노출·순서 설정 저장 — 단위(brand+store)별 한 행.
export async function POST(req: Request) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '설정 권한이 없습니다.' }, { status: 403 });
  }

  let body: { unit?: string; hidden?: unknown; sort?: unknown; merges?: unknown; visible?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  const unit = unitOf(body.unit);
  if (!unit || unit.brand === 'personal') {
    return NextResponse.json({ error: '단위(unit)가 올바르지 않습니다.' }, { status: 400 });
  }
  const clean = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 500) : [];
  const hidden = clean(body.hidden);
  const sort = clean(body.sort);
  // 화이트리스트(2026-08-20) — 체크한 것만 보인다. 새 상품은 기본 미노출(hidden 은 레거시).
  const visible = clean(body.visible);
  // 병합 매핑 검증 — { 대표: [소스...] }. 대표가 소스에 들어가거나 소스가 두 대표에 걸치면 무결성이 깨진다.
  const merges: Record<string, string[]> = {};
  if (body.merges && typeof body.merges === 'object' && !Array.isArray(body.merges)) {
    const seen = new Set<string>();
    for (const [target, srcs] of Object.entries(body.merges as Record<string, unknown>).slice(0, 200)) {
      if (typeof target !== 'string' || !target) continue;
      const list = clean(srcs).filter((x) => x !== target && !seen.has(x));
      if (list.length === 0) continue;
      list.forEach((x) => seen.add(x));
      if (seen.has(target)) return NextResponse.json({ error: `'${target}' 은 이미 다른 메뉴에 병합돼 있어 대표가 될 수 없어요.` }, { status: 400 });
      merges[target] = list;
    }
  }

  const { error } = await supabase
    .schema('finance')
    .from('prep_menu_prefs')
    .upsert(
      {
        brand: unit.brand,
        store: unit.store ?? '',
        hidden: hidden as never,
        sort: sort as never,
        merges: merges as never,
        visible: visible as never,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand,store' }
    );
  if (error) return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, hidden, sort, merges, visible });
}
