import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isOwner } from '@/lib/finance/access';

// 가든 하위 탭 권한을 API 에서도 강제한다.
// 미들웨어는 페이지 접근만 막기 때문에, 탭이 꺼진 사용자도 API 를 직접 부르면 같은 데이터를
// 가져갈 수 있었다. 각 가든 라우트가 자기 탭 키로 이 함수를 호출해 막는다.
// (로그인·팀 도메인 검사는 미들웨어가 이미 끝낸 상태로 들어온다.)

// tab 에 여러 개를 주면 그 중 하나라도 허용이면 통과한다. 같은 조회 API 를 여러 화면이
// 공유하므로(예: 발주 기록은 발주·레시피·원두카드 화면이 모두 읽는다) 조회는 관대하게,
// 쓰기는 해당 화면의 탭만 지정해 엄격하게 건다.
export async function requireGardenTab(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  tab: string | string[]
): Promise<NextResponse | null> {
  const need = Array.isArray(tab) ? tab : [tab];
  if (isOwner(user.email)) return null;
  const { data, error } = await supabase
    .schema('finance')
    .from('garden_tab_access')
    .select('tabs, sections')
    .eq('user_id', user.id)
    .maybeSingle();
  // 조회 실패를 '행 없음 = 전체 허용'으로 접으면 장애 순간에 권한이 통째로 열린다 — 막고 로그를 남긴다
  if (error) {
    console.error('[garden-tab-access] 권한 조회 실패:', error.message);
    return NextResponse.json({ error: '권한 확인에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 503 });
  }
  if (!data) return null; // 행 없음 = 전체 허용

  const sections = (data.sections as string[] | null) ?? null;
  if (sections && !sections.includes('garden')) {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }
  const tabs = (data.tabs as string[] | null) ?? null;
  if (tabs && !need.some((t) => tabs.includes(t))) {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
  }
  return null;
}
