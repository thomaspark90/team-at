import { NextResponse } from 'next/server';
import { parsePosXlsx } from '@/lib/finance/pos';
import { parsePayhereXlsx } from '@/lib/finance/payhere';
import type { Brand } from '@/lib/finance/types';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { archiveOriginal } from '@/lib/finance/original-archive';
import { applyPosParseResult } from '@/lib/finance/pos-apply';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 토스/페이히어 매출리포트 → pos_sales/pos_items 저장. 저장 절차는 lib/finance/pos-apply.ts 참고
// (원본 재처리 /api/finance/originals/[id]/reprocess 와 공유).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '저장 권한이 없습니다.' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('file');
  const password = String(form.get('password') ?? '0000') || '0000';
  // 브랜드·지점별 별도 POS 파일 — 파일 하나 = 한 (브랜드, 지점).
  // 가든은 지점 필수(판교=페이히어, 양재천=토스), 스탭밀은 단일 매장(store='').
  const rawBrand = String(form.get('brand') ?? 'garden');
  if (rawBrand !== 'garden' && rawBrand !== 'staffmeal') {
    return NextResponse.json({ error: '브랜드가 올바르지 않습니다.' }, { status: 400 });
  }
  const brand: Brand = rawBrand;
  const rawStore = String(form.get('store') ?? '');
  if (rawStore !== '' && rawStore !== 'pangyo' && rawStore !== 'yangjae') {
    return NextResponse.json({ error: '지점이 올바르지 않습니다.' }, { status: 400 });
  }
  if (brand === 'garden' && rawStore === '') {
    return NextResponse.json({ error: '가든서비스 POS는 지점(판교/양재천)을 선택해야 합니다.' }, { status: 400 });
  }
  if (brand === 'staffmeal' && rawStore !== '') {
    return NextResponse.json({ error: '스탭밀은 지점 구분이 없습니다.' }, { status: 400 });
  }
  const store = brand === 'garden' ? rawStore : '';
  const posType = String(form.get('posType') ?? 'toss') === 'payhere' ? 'payhere' : 'toss';
  if (!(file instanceof File)) return NextResponse.json({ error: '엑셀 파일을 선택하세요.' }, { status: 400 });

  let r;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    r = posType === 'payhere' ? await parsePayhereXlsx(bytes, password) : await parsePosXlsx(bytes, password);
  } catch (e) {
    return NextResponse.json({ error: `파일을 읽지 못했습니다: ${(e as Error).message}` }, { status: 400 });
  }
  if (r.rows.length === 0) {
    return NextResponse.json({ error: '저장할 매출이 없습니다.' }, { status: 422 });
  }

  const outcome = await applyPosParseResult(supabase, user, { brand, store, posType, actionLabel: 'POS 매출 업로드' }, r);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

  // 원본 보관 — 파서 개선 시 재업로드 요청 없이 재처리할 수 있게. 이번 파일이 전부 기존 자료와
  // 동일해 아무것도 안 바뀌었으면(changedYms 빈 배열) 원본 자료함에 중복 파일을 남기지 않는다.
  if (outcome.body.changedYms.length > 0) {
    await archiveOriginal(supabase, user, file, {
      area: `pos-${brand}${store ? `-${store}` : ''}`,
      ym: r.ym,
      brand,
      store,
      note: posType,
    });
  }

  return NextResponse.json(outcome.body);
}
