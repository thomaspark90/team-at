import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';

// 통장 차트 대여금 마커의 표기 문구 저장. { brand, ym, label }.
// label 이 비면 오버라이드 삭제(기본 라벨 '가든서비스 대여금'으로 복귀).
// 마커 존재 여부는 '대여금' 분류 거래가 정본이라 여기서는 문구만 다룬다.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const brand = String(body?.brand ?? '');
  const ym = String(body?.ym ?? '');
  const label = String(body?.label ?? '').trim();
  if (!['garden', 'staffmeal'].includes(brand)) return NextResponse.json({ error: '브랜드가 올바르지 않습니다.' }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ error: '월(ym)이 올바르지 않습니다.' }, { status: 400 });
  if (label.length > 40) return NextResponse.json({ error: '표기는 40자 이내로 해주세요.' }, { status: 400 });

  if (!label) {
    const { error } = await supabase.schema('finance').from('chart_annotations').delete().eq('brand', brand).eq('ym', ym);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const { error } = await supabase
    .schema('finance')
    .from('chart_annotations')
    .upsert({ brand, ym, label, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'brand,ym' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
