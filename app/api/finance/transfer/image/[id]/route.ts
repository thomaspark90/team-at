import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';

export const runtime = 'nodejs';

// 영수증 원본 — 재무 담당(admin·classifier)이거나 본인이 올린 요청일 때만 스트리밍.
// id 가 연번이라 검사 없이 열면 누구나 순서대로 남의 영수증을 받아갈 수 있다.
const FINANCE_ROLES = ['admin', 'classifier'];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data: row } = await supabase
    .schema('finance')
    .from('transfer_requests')
    .select('image_path, requester_email')
    .eq('id', Number(params.id))
    .maybeSingle();
  if (!row?.image_path) {
    return NextResponse.json({ error: '이미지가 없어요.' }, { status: 404 });
  }
  const role = await resolveRole(supabase, user);
  const mine = (row.requester_email ?? '').toLowerCase() === (user.email ?? '').toLowerCase();
  if (!FINANCE_ROLES.includes(role ?? '') && !mine) {
    return NextResponse.json({ error: '볼 수 있는 권한이 없어요.' }, { status: 403 });
  }

  const blob = await get(row.image_path, { access: 'private' });
  if (!blob) return NextResponse.json({ error: '이미지를 찾지 못했어요.' }, { status: 404 });

  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
