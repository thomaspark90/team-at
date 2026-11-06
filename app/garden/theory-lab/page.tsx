import { redirect } from 'next/navigation';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { isOwner } from '@/lib/finance/access';
import TheoryLabContent from '@/components/garden/theory-lab/TheoryLabContent';

// 커피 머신 추출 이론 — 대표 검토용 시안 (2026-11-06).
// GARDEN_TABS 에 넣지 않아 내비·권한 UI 에 안 뜬다. 미들웨어(로그인·허용 계정) 통과 후 여기서 대표만 남긴다.
// 다른 계정은 기존 공개 페이지로 보낸다 — 목적지가 이 경로와 달라 리다이렉트 루프 없음.
export const dynamic = 'force-dynamic';

export default async function GardenTheoryLabPage() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');
  if (!isOwner(user.email)) redirect('/garden/theory');
  return <TheoryLabContent />;
}
