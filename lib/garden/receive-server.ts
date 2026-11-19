// 서버 전용 — 원두 수령(로스팅 날짜·영문명 확정·원두카드 요청) 권한 판정. 클라이언트에서 import 금지.
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isOwner } from '@/lib/finance/access';
import { requireGardenTab } from '@/lib/access/guard';
import { readGardenTopics } from '@/lib/garden-notify-topics-server';
import { receiveAssigned } from '@/lib/garden/receive';

// 설정 › 항목별 담당자 › '원두 수령 담당'에 지정된 사람만(발주 탭 권한이 없어도 된다 — 작업 보드에서 누른다).
// 담당자를 비워 두면 발주(pricing) 탭 권한. 대표는 항상 가능. (2026-11-19 대표 지시)
export async function denyReceive(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<NextResponse | null> {
  if (isOwner(user.email)) return null;
  const assigned = receiveAssigned((await readGardenTopics()).beanReceive, user.email);
  if (assigned === true) return null;
  if (assigned === false) {
    return NextResponse.json({ error: '수령 담당자로 지정된 사람만 기재할 수 있어요.' }, { status: 403 });
  }
  return requireGardenTab(supabase, user, 'pricing');
}
