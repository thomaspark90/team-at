import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { parsePosXlsx } from '@/lib/finance/pos';
import { parsePayhereXlsx } from '@/lib/finance/payhere';
import type { Brand } from '@/lib/finance/types';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { applyPosParseResult } from '@/lib/finance/pos-apply';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 보관된 원본을 서버가 다시 파싱해 저장 — 파서 개선 후 재업로드 없이 반영.
// 지금은 POS(토스/페이히어)만 지원한다: 통장 엑셀은 매핑 정보가 필요하고, 카드·영수증은
// 확정/정산 부수효과가 얽혀 있어 자동 재처리가 안전하지 않다(수동 재업로드로 처리).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '재처리 권한이 없습니다.' }, { status: 403 });
  }

  const { data: row } = await supabase
    .schema('finance')
    .from('upload_originals')
    .select('area, blob_path, filename, brand, store, note')
    .eq('id', Number(params.id))
    .maybeSingle();
  if (!row) return NextResponse.json({ error: '원본을 찾지 못했어요.' }, { status: 404 });
  if (!row.area.startsWith('pos-')) {
    return NextResponse.json({ error: '이 자료 유형은 아직 재처리를 지원하지 않아요.' }, { status: 400 });
  }
  if (row.brand !== 'garden' && row.brand !== 'staffmeal') {
    return NextResponse.json({ error: '브랜드 정보가 없는 원본이에요.' }, { status: 400 });
  }
  const brand = row.brand as Brand;
  const store = row.store ?? '';
  const posType = row.note === 'payhere' ? 'payhere' : 'toss';

  const blob = await get(row.blob_path, { access: 'private' });
  if (!blob) return NextResponse.json({ error: '원본 파일을 찾지 못했어요.' }, { status: 404 });
  const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());

  let r;
  try {
    r = posType === 'payhere' ? await parsePayhereXlsx(bytes) : await parsePosXlsx(bytes);
  } catch (e) {
    return NextResponse.json({ error: `파일을 읽지 못했습니다: ${(e as Error).message}` }, { status: 400 });
  }
  if (r.rows.length === 0) {
    return NextResponse.json({ error: '저장할 매출이 없습니다.' }, { status: 422 });
  }

  const outcome = await applyPosParseResult(supabase, user, { brand, store, posType, actionLabel: 'POS 원본 재처리' }, r);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json(outcome.body);
}
