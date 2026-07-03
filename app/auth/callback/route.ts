import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 구글 OAuth 리다이렉트 → 코드를 세션으로 교환하고 앱으로 진입
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/studio';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/?error=auth`);
}
