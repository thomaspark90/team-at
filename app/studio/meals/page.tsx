import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readStaffMeals } from '@/lib/staffmeals';
import TabNav from '@/components/TabNav';
import StudioNav from '@/components/StudioNav';
import type { StaffMealRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

const fmtSaved = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 메뉴 항목 요약 — 빈 칸 제외
const menuLines = (rec: StaffMealRecord): [string, string][] => {
  if (rec.inputMode === 'manual') {
    return rec.manualText.trim() ? [['메뉴', rec.manualText.trim()]] : [];
  }
  return rec.categories
    .map((c): [string, string] => [c.name, c.items.filter((i) => i.trim()).join(', ')])
    .filter(([, items]) => items.length > 0);
};

// 지난 스탭밀 — 다운로드 시점에 저장된 메뉴 스냅샷 아카이브 (최신순)
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
        <div className="ta-card bg-background">
          <p className="ta-label">지난 스탭밀</p>
          {records.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              아직 기록이 없습니다. IG 메뉴 업데이트에서 스토리를 다운로드하면 자동으로 쌓입니다.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {records.map((rec) => (
                <div key={rec.id} className="rounded-lg border border-border p-3.5">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="tabular text-[15px] font-medium">{rec.date}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {rec.createdBy.split('@')[0]} · 저장 {fmtSaved(rec.createdAt)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {menuLines(rec).map(([name, items]) => (
                      <p key={name} className="m-0 text-[13px]">
                        <span className="text-muted-foreground">{name}</span>{' '}
                        <span className="text-foreground">{items}</span>
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
