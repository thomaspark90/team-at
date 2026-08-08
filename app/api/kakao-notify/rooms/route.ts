import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canSendKakaoOrder, readKakaoRooms, writeKakaoRooms } from '@/lib/kakao-notify';

// 로스터리별 발주 카톡방 매핑 — 가든 설정(발주 드롭다운 관리)에서 조회·수정.
// GET 은 설정 화면 표시용(팀 확인은 미들웨어가 담당), PUT 은 발주 전송 권한자만.

export async function GET() {
  return NextResponse.json(await readKakaoRooms());
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (!canSendKakaoOrder(user.email)) {
    return NextResponse.json({ error: '발주 카톡방 설정 권한이 없습니다.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: '매핑 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  // 값이 빈 문자열이면 매핑 해제로 보고 저장하지 않는다
  const rooms: Record<string, string> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    const room = String(v ?? '').trim();
    if (k.trim() && room) rooms[k.trim()] = room;
  }
  await writeKakaoRooms(rooms);
  return NextResponse.json(rooms);
}
