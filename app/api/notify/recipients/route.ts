import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { logActivity } from '@/lib/finance/activity';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  const role = await resolveRole(supabase, user);
  if (role !== 'admin') {
    return { error: NextResponse.json({ error: '수신자 관리는 관리자만 가능해요.' }, { status: 403 }) };
  }
  return { supabase, user };
}

async function list(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .schema('finance')
    .from('notify_recipients')
    .select('email')
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.email as string);
}

// 수신자 목록 (admin)
export async function GET() {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  try {
    return NextResponse.json({ recipients: await list(g.supabase) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// 수신자 추가 (admin)
export async function POST(req: Request) {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const { email } = (await req.json()) as { email?: string };
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    return NextResponse.json({ error: '올바른 이메일을 입력하세요.' }, { status: 400 });
  }
  const { error } = await g.supabase
    .schema('finance')
    .from('notify_recipients')
    .upsert({ email: normalized }, { onConflict: 'email', ignoreDuplicates: true }); // DO NOTHING — update 정책 불필요
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(g.supabase, g.user, '알림 수신자 추가', normalized);
  return NextResponse.json({ recipients: await list(g.supabase) });
}

// 수신자 제거 (admin)
export async function DELETE(req: Request) {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const { email } = (await req.json()) as { email?: string };
  if (!email) return NextResponse.json({ error: 'email이 없어요.' }, { status: 400 });
  const { error } = await g.supabase
    .schema('finance')
    .from('notify_recipients')
    .delete()
    .eq('email', String(email).trim().toLowerCase());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(g.supabase, g.user, '알림 수신자 제거', String(email).trim().toLowerCase());
  return NextResponse.json({ recipients: await list(g.supabase) });
}
