import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { resolveRole, isOwner } from '@/lib/finance/access';
import { logActivity } from '@/lib/finance/activity';

export const runtime = 'nodejs';

// 운영진(finance.schedule_editors) 지정 — 설정 › 계정의 권한 표가 쓴다(2026-11-20).
// 운영진 = 스케줄 작성·배포, 체크리스트 전체 열람·항목 관리·대리 체크, 가입 신청 알림 수신.
// 판정은 lib/schedule/access.ts · lib/checklist/access.ts 가 이 테이블을 읽어서 한다(대표는 항상 운영진).
// GET: 운영진 이메일 목록 / POST: { email, on } 켜고 끄기 — 둘 다 재무 관리자(admin) 전용.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  if ((await resolveRole(supabase, user)) !== 'admin') {
    return { error: NextResponse.json({ error: '관리자만 변경할 수 있습니다.' }, { status: 403 }) };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: NextResponse.json({ error: '서버 설정 누락' }, { status: 500 }) };
  return { supabase, user, svc: createServiceClient(url, key, { db: { schema: 'finance' } }) };
}

type Svc = ReturnType<typeof createServiceClient>;
const list = async (svc: Svc) => {
  const { data, error } = await svc.from('schedule_editors').select('email').order('email');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { email: string }[]).map((r) => r.email);
};

export async function GET() {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  try {
    return NextResponse.json({ editors: await list(g.svc as Svc) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const on = body?.on === true;
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: '이메일 형식이 올바르지 않습니다.' }, { status: 400 });
  if (isOwner(email)) return NextResponse.json({ error: '대표 계정은 항상 운영진입니다.' }, { status: 400 });

  const svc = g.svc as Svc;
  const { error } = on
    ? await svc.from('schedule_editors').upsert({ email } as never, { onConflict: 'email' })
    : await svc.from('schedule_editors').delete().eq('email', email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(g.supabase, g.user, '운영진 지정 변경', `${email} · ${on ? '지정' : '해제'}`);
  try {
    return NextResponse.json({ editors: await list(svc) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
