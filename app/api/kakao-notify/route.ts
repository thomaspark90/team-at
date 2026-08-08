import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';
import { logActivity } from '@/lib/finance/activity';
import { purchaseRecords } from '@/lib/blob-records';
import { buildOrderMessage, canSendKakaoOrder, kakaoNotifyJobs, type KakaoNotifyJob } from '@/lib/kakao-notify';

// 발주 화면 [발주] 버튼용 — 카톡 전송 잡 등록.
// GET: 내 버튼 노출 여부 + 발주기록별 전송 상태 (UI 표시용)
// POST { purchaseId }: 전송 잡 등록 — 실제 전송은 맥 로컬 전송기가 큐를 폴링해 수행

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'pricing');
    if (denied) return denied;
  }
  // 허용 계정이 아니면 상태 맵도 주지 않는다 — 버튼 자체가 안 보이므로 필요 없다
  if (!canSendKakaoOrder(user.email)) return NextResponse.json({ allowed: false, jobs: {} });

  // readAll 은 오래된순 — 같은 발주의 잡이 여러 개면(실패 후 재시도) 최신 상태가 남는다
  const jobs: Record<string, KakaoNotifyJob['status']> = {};
  for (const j of await kakaoNotifyJobs.readAll()) jobs[j.purchaseId] = j.status;
  return NextResponse.json({ allowed: true, jobs });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'pricing');
    if (denied) return denied;
  }
  if (!canSendKakaoOrder(user.email)) {
    return NextResponse.json({ error: '발주 전송 권한이 없습니다.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const purchaseId = String(body?.purchaseId ?? '');
  if (!purchaseId) return NextResponse.json({ error: 'purchaseId가 필요합니다.' }, { status: 400 });

  const record = await purchaseRecords.readOne(purchaseId);
  if (!record) return NextResponse.json({ error: '발주 기록을 찾을 수 없습니다.' }, { status: 404 });

  // 같은 발주 기록에 대기·전송 완료 잡이 있으면 새로 만들지 않는다(더블클릭·중복 전송 방지).
  // 실패(failed)만 재시도로 새 잡을 등록한다.
  const existing = (await kakaoNotifyJobs.readAll()).filter((j) => j.purchaseId === record.id);
  const active = existing.find((j) => j.status === 'pending' || j.status === 'sent');
  if (active) return NextResponse.json({ job: active, duplicated: true });

  const job: KakaoNotifyJob = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    purchaseId: record.id,
    message: buildOrderMessage(record),
    status: 'pending',
    requestedBy: user.email ?? '',
  };
  await kakaoNotifyJobs.writeOne(job);
  await logActivity(supabase, user, '가든서비스 발주 카톡 요청', record.bean);
  return NextResponse.json({ job });
}
