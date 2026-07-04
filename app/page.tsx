import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LoginButton from '@/components/LoginButton';

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/studio');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-[360px] flex-col">
        <h1 className="mb-1 font-serif text-5xl tracking-tight text-foreground">team-at</h1>
        <p className="caption mb-10">Cafe operations</p>
        <LoginButton />
        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          팀 구글 계정으로 로그인하세요
        </p>
      </div>
    </div>
  );
}
