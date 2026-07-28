import { NextResponse } from 'next/server';
import { parsePosXlsx } from '@/lib/finance/pos';
import { parsePayhereXlsx } from '@/lib/finance/payhere';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';
export const maxDuration = 30;

// POS 매출리포트 xlsx 미리보기 — 쓰기 없이 파싱 요약만 반환.
// posType: 'toss'(양재천, 암호화 0000) | 'payhere'(스탭밀·판교)
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

  const form = await req.formData();
  const file = form.get('file');
  const password = String(form.get('password') ?? '0000') || '0000';
  const posType = String(form.get('posType') ?? 'toss') === 'payhere' ? 'payhere' : 'toss';
  if (!(file instanceof File)) return NextResponse.json({ error: '엑셀 파일을 선택하세요.' }, { status: 400 });

  let r;
  let mapping: unknown = null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (posType === 'payhere') {
      const p = await parsePayhereXlsx(bytes, password);
      r = p;
      mapping = p.mapping; // 헤더 자동탐지 결과 — 샘플 검증 전이라 미리보기에 표시
    } else {
      r = await parsePosXlsx(bytes, password);
    }
  } catch (e) {
    const msg = (e as Error).message;
    const hint = /password|decrypt|zip/i.test(msg) ? ' (비밀번호가 맞는지 확인하세요)' : '';
    return NextResponse.json({ error: `파일을 읽지 못했습니다: ${msg}${hint}` }, { status: 400 });
  }
  if (r.rows.length === 0) {
    return NextResponse.json(
      { error: posType === 'payhere' ? '페이히어 리포트에서 매출을 읽지 못했습니다.' : "'상품 주문 상세내역' 시트에서 매출을 읽지 못했습니다." },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ym: r.ym,
    yms: r.yms,
    totals: r.totals,
    byCategory: r.byCategory,
    excluded: r.excluded,
    meta: r.meta,
    mapping,
  });
}
