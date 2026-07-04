import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import TabNav from '@/components/TabNav';
import UploadPanel from '@/components/finance/UploadPanel';
import RequestAccessButton from '@/components/finance/RequestAccessButton';

export default async function FinancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // OWNER는 자동 admin, 그 외는 finance.members 역할
  const role = await resolveRole(supabase, user);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        {['admin', 'classifier'].includes(role ?? '') ? (
          <>
            <div className="mb-3 flex items-center gap-4">
              <Link href="/finance/classify" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                거래 분류 →
              </Link>
              <Link href="/finance/cashflow" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                통장 현황 →
              </Link>
              <Link href="/finance/dashboard" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                대시보드 →
              </Link>
              <Link href="/finance/flow" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                자금 흐름 →
              </Link>
              <Link href="/finance/close" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                월 확정 →
              </Link>
              <span className="flex-1" />
              {role === 'admin' && (
                <Link href="/finance/categories" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                  계정과목 →
                </Link>
              )}
              {role === 'admin' && (
                <Link href="/finance/members" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                  멤버 관리 →
                </Link>
              )}
            </div>
            <UploadPanel />
          </>
        ) : role === 'viewer' ? (
          <ViewerNote />
        ) : (
          <NoAccess email={user.email ?? ''} />
        )}
      </div>
    </div>
  );
}

function ViewerNote() {
  return (
    <div className="ta-card mx-auto mt-[60px] max-w-[480px] text-center">
      <div className="mb-3 text-[32px]">📊</div>
      <h2 className="mb-2 mt-0 text-[18px]">집계 대시보드는 준비 중이에요</h2>
      <p className="m-0 text-[14px] leading-[1.6] text-muted-foreground">
        조회 권한으로 로그인했어요. 확정된 달의 매출·지출 그래프가 곧 여기 열려요.
      </p>
    </div>
  );
}

function NoAccess({ email }: { email: string }) {
  return (
    <div className="ta-card mx-auto mt-[60px] max-w-[480px] text-center">
      <div className="mb-3 text-[32px]">🔒</div>
      <h2 className="mb-2 mt-0 text-[18px]">재무 접근 권한이 없어요</h2>
      <p className="m-0 text-[14px] leading-[1.6] text-muted-foreground">
        재무 데이터는 관리자 승인이 필요해요.
        <br />
        아래 계정으로 <b>대표에게 권한을 요청</b>하세요.
      </p>
      <div className="mt-4 break-all rounded-md bg-muted px-3.5 py-2.5 font-mono text-[13px] text-foreground">
        {email}
      </div>
      <RequestAccessButton />
    </div>
  );
}
