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

// 수신자 행 — 종류(송금/원두)별 수신 여부 포함. 구 스키마(컬럼 없음)는 전부 true.
async function list(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .schema('finance')
    .from('notify_recipients')
    .select('*')
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    email: String(r.email),
    transfer: (r as Record<string, unknown>).transfer_enabled !== false,
    stock: (r as Record<string, unknown>).stock_enabled !== false,
  }));
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

// 수신자 추가/종류 토글 저장 (admin) — { email, transfer?, stock? }
export async function POST(req: Request) {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const body = (await req.json()) as { email?: string; transfer?: boolean; stock?: boolean };
  const normalized = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    return NextResponse.json({ error: '올바른 이메일을 입력하세요.' }, { status: 400 });
  }
  const transfer = body.transfer ?? true;
  const stock = body.stock ?? true;
  const { error } = await g.supabase
    .schema('finance')
    .from('notify_recipients')
    .upsert(
      { email: normalized, transfer_enabled: transfer, stock_enabled: stock },
      { onConflict: 'email' }
    );
  if (error) {
    // migration_notify_topics 미적용(컬럼 없음) — 구 방식으로 이메일만 등록
    if (/column|schema cache/i.test(error.message)) {
      const { error: legacyErr } = await g.supabase
        .schema('finance')
        .from('notify_recipients')
        .upsert({ email: normalized }, { onConflict: 'email', ignoreDuplicates: true });
      if (legacyErr) return NextResponse.json({ error: legacyErr.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  await logActivity(
    g.supabase,
    g.user,
    '알림 수신자 저장',
    `${normalized} · 송금 ${transfer ? 'ON' : 'OFF'} · 원두 ${stock ? 'ON' : 'OFF'}`
  );
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
