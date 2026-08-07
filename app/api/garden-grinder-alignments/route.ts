import { NextResponse } from 'next/server';
import type { StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import type { AlignmentEvent } from '@/lib/grinder-alignments';
import { alignmentRecords } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { requireGardenTab } from '@/lib/access/guard';

// 기록별 blob 저장(lib/blob-records) — 동시 기록에도 유실이 없다.

const STORE_IDS = STORES.map((s) => s.id);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    // 조회는 대시보드·레시피도 허용 — 판교 환산 폴백(07-16 오프셋)의 유효성 판정에 필요
    const denied = await requireGardenTab(supabase, user, ['calibration', 'dashboard', 'recipes']);
    if (denied) return denied;
  }

  return NextResponse.json(await alignmentRecords.readAll());
}

// 얼라인먼트 1건 기록: { store, date: 'YYYY-MM-DD', kind?: 'align'|'check', memo? }
// kind 'check' = 정기 점검 결과 이상 없음 — 리마인더 주기만 리셋하고 측정 유효성엔 영향 없음
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'calibration');
    if (denied) return denied;
  }

  const body = await req.json();
  const storeId = body.store as StoreId;
  if (!STORE_IDS.includes(storeId)) {
    return NextResponse.json({ error: '지점 정보가 올바르지 않습니다.' }, { status: 400 });
  }
  const date = String(body.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 });
  }

  const kind = body.kind === 'check' ? 'check' : 'align';

  const event: AlignmentEvent = {
    id: crypto.randomUUID(),
    store: storeId,
    date,
    kind,
    memo: body.memo ? String(body.memo).trim() : undefined,
    createdAt: new Date().toISOString(),
    createdBy: user.email ?? '',
  };

  await alignmentRecords.writeOne(event);

  const label = STORES.find((s) => s.id === storeId)?.label ?? storeId;
  await logActivity(
    supabase,
    user,
    kind === 'check' ? '가든서비스 그라인더 정기 점검 (이상 없음)' : '가든서비스 그라인더 얼라인먼트 기록',
    `${label} · ${date}${event.memo ? ` · ${event.memo}` : ''}`
  );
  // 방금 쓴 blob 은 목록 인덱스에 아직 안 보일 수 있어 응답에 직접 포함한다
  const events = await alignmentRecords.readAll();
  if (!events.some((e) => e.id === event.id)) events.push(event);
  return NextResponse.json(events);
}

// 기록 삭제: ?id=<uuid>
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'calibration');
    if (denied) return denied;
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

  const target = await alignmentRecords.deleteOne(id);
  if (!target) return NextResponse.json({ error: '기록을 찾을 수 없습니다.' }, { status: 404 });

  const label = STORES.find((s) => s.id === target.store)?.label ?? target.store;
  await logActivity(supabase, user, '가든서비스 그라인더 얼라인먼트 삭제', `${label} · ${target.date}`);
  // 삭제 직후 목록 인덱스에 남아 있을 수 있어 응답에서 확실히 제외한다
  const events = (await alignmentRecords.readAll()).filter((e) => e.id !== id);
  return NextResponse.json(events);
}
