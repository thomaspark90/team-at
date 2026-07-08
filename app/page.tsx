import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAllowedEmail } from '@/lib/finance/access';
import LoginButton from '@/components/LoginButton';

export default async function LandingPage({ searchParams }: { searchParams: { denied?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && isAllowedEmail(user.email)) redirect('/studio');
  const denied = searchParams.denied === '1' || (!!user && !isAllowedEmail(user.email));

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
      </div>
    </div>
  );
}
