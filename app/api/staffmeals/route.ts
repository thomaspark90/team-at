import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { readStaffMeals, writeStaffMeals } from '@/lib/staffmeals';
import type { StaffMealRecord } from '@/lib/types';

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const store = await readStaffMeals();
  return NextResponse.json(store.records);
}

// 스토리 다운로드 시 메뉴 스냅샷 저장: { date, inputMode, categories, manualText }
// 같은 날짜 재다운로드(메뉴 수정 케이스)도 모두 별건으로 남긴다 — 화면에서 중복 표시
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const date = String(body?.date ?? '').trim();
  if (!date) return NextResponse.json({ error: '날짜가 없습니다.' }, { status: 400 });

  const now = new Date();
  const record: StaffMealRecord = {
    id: `${Date.now()}`,
    createdAt: now.toISOString(),
    date,
    inputMode: body?.inputMode === 'manual' ? 'manual' : 'fixed',
    categories: Array.isArray(body?.categories) ? body.categories : [],
    manualText: String(body?.manualText ?? ''),
    createdBy: user.email ?? '',
  };

  const store = await readStaffMeals();
  store.records = [...store.records, record];
  await writeStaffMeals(store);

  await logActivity(supabase, user, '스탭밀 스토리 다운로드', date);
  return NextResponse.json(record);
}

export async function DELETE(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  const store = await readStaffMeals();
  const removed = store.records.find((r) => r.id === id);
  if (!removed) return NextResponse.json({ error: '기록을 찾을 수 없습니다.' }, { status: 404 });
  store.records = store.records.filter((r) => r.id !== id);
  await writeStaffMeals(store);

  await logActivity(supabase, user, '스탭밀 메뉴 기록 삭제', removed.date);
  return NextResponse.json({ ok: true });
}
