import { list, del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  if (!(await requireUser()))
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const { blobs } = await list({ prefix: 'backgrounds/' });
  return NextResponse.json(blobs);
}

export async function DELETE(req: Request) {
  if (!(await requireUser()))
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const { url } = await req.json();
  // 클라이언트가 보낸 URL 을 그대로 지우면 data/ 의 저장소 JSON·영수증까지 삭제될 수 있다.
  // 실제 backgrounds/ 목록에 있는 blob 인지 확인한 뒤에만 삭제한다.
  const { blobs } = await list({ prefix: 'backgrounds/' });
  const target = blobs.find((b) => b.url === url);
  if (!target) return NextResponse.json({ error: '배경 이미지가 아닙니다.' }, { status: 400 });
  await del(target.url);
  return NextResponse.json({ ok: true });
}
