import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';
import { lockedYms } from '@/lib/finance/monthLock';

export const runtime = 'nodejs';

// 원본 자료 삭제 — 재무 담당만. DB 행 먼저 지우고 Blob은 최선노력(비치명적)으로 정리.
// ⚠ 2026-08-19 raw 레이어 도입 후 원본은 더 이상 참고용만이 아니다 — 재처리(reprocess)의
// 유일한 입력이고 raw_batches.original_id 가 참조한다. 그래서 두 가지를 막는다(2026-08-21 감사 P0):
//   1) 로우데이터 배치가 참조하는 원본 — 정본층의 근거 파일이라 삭제 불가
//   2) 확정(결산)된 달의 원본 — 재오픈 후에만 삭제 가능
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) {
    return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
  }

  let body: { id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  if (body.id == null) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

  const { data: row } = await supabase
    .schema('finance')
    .from('upload_originals')
    .select('blob_path, filename, area, ym, brand')
    .eq('id', body.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: '원본을 찾지 못했어요.' }, { status: 404 });

  // 1) 로우데이터 참조 보호 — 이 원본에서 적재된 raw 배치가 남아 있으면 근거 파일을 지울 수 없다
  const { data: refBatch } = await supabase
    .schema('finance')
    .from('raw_batches')
    .select('id')
    .eq('original_id', body.id)
    .limit(1);
  if ((refBatch ?? []).length > 0) {
    return NextResponse.json(
      { error: '로우데이터가 이 원본을 참조하고 있어 지울 수 없어요 — 원본은 정본층의 근거 파일이에요.' },
      { status: 409 }
    );
  }
  // 2) 확정월 보호 — 결산으로 잠근 달의 원본은 재오픈 후에만 삭제
  if (row.ym && row.brand) {
    const locked = await lockedYms(supabase, row.brand);
    if (locked.has(row.ym)) {
      return NextResponse.json(
        { error: `${row.ym}은 결산 확정된 달이에요 — 월 결산에서 재오픈한 뒤 삭제해주세요.` },
        { status: 409 }
      );
    }
  }

  const { error: delErr } = await supabase.schema('finance').from('upload_originals').delete().eq('id', body.id);
  if (delErr) return NextResponse.json({ error: `삭제 실패: ${delErr.message}` }, { status: 500 });

  try {
    await del(row.blob_path);
  } catch {
    // Blob 삭제 실패는 비치명적 — 이력에서는 이미 사라졌으니 조회에는 다시 안 뜬다
  }

  await logActivity(supabase, user, '원본 자료 삭제', `[${row.area}] ${row.filename}`);
  return NextResponse.json({ ok: true });
}
