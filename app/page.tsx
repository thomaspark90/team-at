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
      <div className="flex w-full max-w-[360px] flex-col">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-team-at.png" alt="TEAM at" className="mb-3 h-auto w-[210px] dark:invert" />
        <p className="caption mb-10">F&B operations</p>
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
