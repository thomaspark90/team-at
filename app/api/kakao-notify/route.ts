import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';
import { logActivity } from '@/lib/finance/activity';
import { purchaseRecords } from '@/lib/blob-records';
import { buildOrderMessage, canSendKakaoOrder, kakaoNotifyJobs, readKakaoRooms, type KakaoNotifyJob } from '@/lib/kakao-notify';

// 기록의 로스터리로 대상 카톡방을 확정한다 — 매핑이 없으면 전송 자체를 막는다.
async function resolveRoom(record: { roastery?: string }): Promise<{ room: string } | { error: string }> {
  if (!record.roastery) return { error: '로스터리가 없는 기록은 발주 카톡을 보낼 수 없습니다.' };
  const room = (await readKakaoRooms())[record.roastery];
  if (!room) return { error: `'${record.roastery}'의 발주 카톡방이 설정되지 않았습니다 — 가든 설정 > 발주 드롭다운 관리에서 지정하세요.` };
  return { room };
}

// 발주 화면 [발주] 버튼용 — 카톡 전송 잡 등록.
// GET: 내 버튼 노출 여부 + 발주기록별 전송 상태 (UI 표시용)
// GET ?purchaseId=...: 전송될 메시지 미리보기 — 버튼 클릭 시 담당자가 확인하는 원문.
//   실제 전송분과 어긋나지 않도록 서버의 buildOrderMessage 를 그대로 쓴다.
// POST { purchaseId }: 전송 잡 등록 — 실제 전송은 맥 로컬 전송기가 큐를 폴링해 수행

export async function GET(req: Request) {
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

  const purchaseId = new URL(req.url).searchParams.get('purchaseId');
  if (purchaseId) {
    const record = await purchaseRecords.readOne(purchaseId);
    if (!record) return NextResponse.json({ error: '발주 기록을 찾을 수 없습니다.' }, { status: 404 });
    const target = await resolveRoom(record);
    if ('error' in target) return NextResponse.json({ error: target.error }, { status: 400 });
    return NextResponse.json({ message: buildOrderMessage(record), room: target.room });
  }

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

  const target = await resolveRoom(record);
  if ('error' in target) return NextResponse.json({ error: target.error }, { status: 400 });

  const job: KakaoNotifyJob = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    purchaseId: record.id,
    room: target.room,
    message: buildOrderMessage(record),
    status: 'pending',
    requestedBy: user.email ?? '',
  };
  await kakaoNotifyJobs.writeOne(job);
  await logActivity(supabase, user, '가든서비스 발주 카톡 요청', record.bean);
  return NextResponse.json({ job });
}
