import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readStaffMeals } from '@/lib/staffmeals';
import PageShell from '@/components/PageShell';
import StudioNav from '@/components/StudioNav';
import StaffMealArchive from '@/components/StaffMealArchive';

export const dynamic = 'force-dynamic';

// 메뉴 기록 — 다운로드 시점에 저장된 메뉴 스냅샷 아카이브 + 메뉴별 기록 횟수
export default async function StaffMealsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const store = await readStaffMeals();
  const records = store.records
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <PageShell nav={<StudioNav />} width="narrow" divide>
      {/* 카드 해체(2026-08-08) — 섹션 경계는 가로 구분선으로만 */}
      <StaffMealArchive initial={records} />
    </PageShell>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '메뉴 기록' };
