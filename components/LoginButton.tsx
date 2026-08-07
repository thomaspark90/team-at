'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginButton() {
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    const supabase = createClient();
    // 구글 hd(도메인 제한)는 쓰지 않는다 — 대표 계정이 gmail 이라 함께 막힌다.
    // 비팀 계정 차단은 auth/callback 의 즉시 로그아웃 + middleware 의 팀 도메인 검사로 처리.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setLoading(false);
  };

  return (
    <button
      onClick={signIn}
      disabled={loading}
      className="w-full rounded-md bg-primary px-4 py-3 text-[13px] text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? '이동 중…' : 'Google 계정으로 계속하기'}
    </button>
  );
}
