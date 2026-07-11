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
  await del(url);
  return NextResponse.json({ ok: true });
}
