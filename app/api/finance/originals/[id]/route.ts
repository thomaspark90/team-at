import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';

// 업로드 원본 스트리밍 — 재무 담당(admin·classifier)이거나 본인이 올린 것만.
// id 가 연번이라 검사 없이 열면 순서대로 남의 자료를 받아갈 수 있다(transfer/image 와 동일 패턴).
const FINANCE_ROLES = ['admin', 'classifier'];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data: row } = await supabase
    .schema('finance')
    .from('upload_originals')
    .select('blob_path, filename, content_type, uploaded_by')
    .eq('id', Number(params.id))
    .maybeSingle();
  if (!row?.blob_path) return NextResponse.json({ error: '원본을 찾지 못했어요.' }, { status: 404 });

  const role = await resolveRole(supabase, user);
  const mine = row.uploaded_by === user.id;
  if (!FINANCE_ROLES.includes(role ?? '') && !mine) {
    return NextResponse.json({ error: '볼 수 있는 권한이 없어요.' }, { status: 403 });
  }

  const blob = await get(row.blob_path, { access: 'private' });
  if (!blob) return NextResponse.json({ error: '원본을 찾지 못했어요.' }, { status: 404 });

  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': row.content_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
