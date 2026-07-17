import { NextResponse } from 'next/server';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { notifyGrindRequest } from '@/lib/notify';
import { topicEmails } from '@/lib/garden-notify-topics-server';
import { logActivity } from '@/lib/finance/activity';

export const runtime = 'nodejs';

const STORE_IDS = STORES.map((s) => s.id);

// 분쇄도 요청을 받을 수 있는 담당자 목록 — 'EK43 캘리브레이션' 토픽 담당자(미지정 시 원두 수신자)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const emails = await topicEmails(supabase, 'calibration');
  return NextResponse.json({ emails });
}

// 분쇄도 측정 요청 발송: { stores: StoreId[], detail, note?, emails? }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json();
  const stores = (Array.isArray(body.stores) ? body.stores : []).filter((s: unknown) =>
    STORE_IDS.includes(s as StoreId)
  ) as StoreId[];
  if (stores.length === 0) {
    return NextResponse.json({ error: '지점을 선택해주세요.' }, { status: 400 });
  }
  const detail = String(body.detail ?? '').trim().slice(0, 200);
  if (!detail) return NextResponse.json({ error: '요청 내용을 입력해주세요.' }, { status: 400 });
  const note = body.note ? String(body.note).trim().slice(0, 300) : undefined;

  // 담당자 지정 시 캘리브레이션 토픽 담당자 목록과 교집합만 허용 — 임의 주소로의 발송 방지
  const allowed = await topicEmails(supabase, 'calibration');
  const picked = (Array.isArray(body.emails) ? body.emails : [])
    .map((e: unknown) => String(e).trim().toLowerCase())
    .filter((e: string) => allowed.includes(e));
  const emails = picked.length > 0 ? picked : allowed; // 미지정 → 캘리브레이션 담당자 전체

  for (const storeId of stores) {
    const storeLabel = STORES.find((s) => s.id === storeId)?.label ?? storeId;
    await notifyGrindRequest(supabase, {
      storeLabel,
      detail,
      note,
      byEmail: user.email ?? '',
      emails,
    });
    await logActivity(
      supabase,
      user,
      '가든서비스 분쇄도 측정 요청',
      `${storeLabel} · ${detail} · 담당 ${emails.join(', ')}`
    );
  }
  return NextResponse.json({ ok: true, sentTo: emails, stores });
}
