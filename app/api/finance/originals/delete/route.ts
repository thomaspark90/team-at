import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';

// 원본 자료 삭제 — 재무 담당만. DB 행 먼저 지우고 Blob은 최선노력(비치명적)으로 정리.
// 원본은 참고용 보관본이라(pos_sales·transactions 등 실제 데이터는 그대로) 삭제해도 매출·분류에 영향 없다.
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
    .select('blob_path, filename, area')
    .eq('id', body.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: '원본을 찾지 못했어요.' }, { status: 404 });

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
