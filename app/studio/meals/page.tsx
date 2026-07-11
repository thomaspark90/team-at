import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readStaffMeals } from '@/lib/staffmeals';
import TabNav from '@/components/TabNav';
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
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <StudioNav />
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
        <StaffMealArchive initial={records} />
      </div>
    </div>
  );
}
