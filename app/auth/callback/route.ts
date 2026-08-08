import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedUser } from '@/lib/finance/access';

// 구글 OAuth 리다이렉트 → 코드를 세션으로 교환하고 앱으로 진입.
// @team-at.space(또는 대표·등록된 외부 이메일) 아니면 로그인 거부(세션 해제).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!(await isAllowedUser(supabase, user?.email))) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/?denied=1`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/?error=auth`);
}
