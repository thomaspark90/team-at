import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRoleStamped } from '@/lib/access/stamp';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import TaskBoard from '@/components/finance/TaskBoard';

// 대시보드 — 재무 담당자의 주간/월간 업무 칸반 보드. 차트는 지표(/finance/metrics)로 이동.
export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const role = await resolveRoleStamped(supabase, user);
  if (!role) redirect('/finance');
  // 업무 보드는 재무 담당(admin/classifier)만 — viewer는 지표 화면으로
  if (!['admin', 'classifier'].includes(role)) redirect('/finance/metrics');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">리포트 홈</h1>
          <Link href="/finance/metrics" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            지표 보기 →
          </Link>
        </div>
        <p className="mb-5 text-[13px] text-muted-foreground">
          POS 매출·채널수수료·관리손익 검토 등 보고 준비 업무를 칸반으로 관리해요. 자료 업로드·분류·월 확정은{' '}
          <Link href="/dashboard" className="underline">회계 홈</Link>, 추이 차트는 <Link href="/finance/metrics" className="underline">지표</Link>에서 봐요.
        </p>
        <TaskBoard board="finance" />
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '리포트' };
