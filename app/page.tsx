import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAllowedEmail } from '@/lib/finance/access';
import LoginButton from '@/components/LoginButton';

export default async function LandingPage({ searchParams }: { searchParams: { denied?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const denied = searchParams.denied === '1' || (!!user && !isAllowedEmail(user.email));
  // denied=1 로 되돌아온 경우엔 자동 이동하지 않는다 — 접근 권한이 하나도 없는 계정이
  // 여기서 다시 /dashboard 로 튀면 미들웨어와 무한히 왕복해 아무 화면도 못 연다.
  if (user && isAllowedEmail(user.email) && !denied) redirect('/dashboard');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-[360px] flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-team-at.png" alt="TEAM at" className="mb-12 h-auto w-[210px] dark:invert" />
        {/* 주요 브랜드 — Staff Meal(그린, 다크에서도 그대로) · Garden Service(블랙, 다크에선 반전) */}
        <div className="mb-4 flex items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/staffmeal.png" alt="STAFF MEAL" className="h-[15px] w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/garden-service.png" alt="Garden Service" className="h-[15px] w-auto dark:invert" />
        </div>
        <p className="caption mb-10 text-center">F&B Brand Operations</p>
        <LoginButton />
        {denied ? (
          <p className="mt-4 text-center text-[13px] text-destructive">
            <b>@team-at.space</b> 팀 계정만 이용할 수 있어요. 팀 구글 계정으로 다시 로그인해 주세요.
          </p>
        ) : (
          <p className="mt-4 text-center text-[13px] text-muted-foreground">
            @team-at.space 팀 구글 계정으로 로그인하세요
          </p>
        )}
        <a href="/install" className="mt-8 text-[12px] text-muted-foreground underline hover:text-foreground">
          휴대폰·PC에 앱 설치하는 방법
        </a>
      </div>
    </div>
  );
}
