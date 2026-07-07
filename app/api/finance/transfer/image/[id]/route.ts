import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// 비공개 Blob 의 영수증 원본 이미지를 로그인 사용자에게만 스트리밍
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data: row } = await supabase
    .schema('finance')
    .from('transfer_requests')
    .select('image_path')
    .eq('id', Number(params.id))
    .maybeSingle();
  if (!row?.image_path) {
    return NextResponse.json({ error: '이미지가 없어요.' }, { status: 404 });
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
