import { list, del, head } from '@vercel/blob';
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
  // head 로 해당 blob 의 실제 경로가 backgrounds/ 인지 확인한 뒤에만 삭제한다.
  // (list 첫 페이지 검사는 blob 이 1,000개를 넘으면 정상 배경도 못 지우게 된다)
  try {
    const target = await head(String(url ?? ''));
    if (!target.pathname.startsWith('backgrounds/')) {
      return NextResponse.json({ error: '배경 이미지가 아닙니다.' }, { status: 400 });
    }
    await del(target.url);
  } catch {
    return NextResponse.json({ error: '배경 이미지가 아닙니다.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
