'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginButton() {
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    const supabase = createClient();
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
      style={{
        width: '100%',
        backgroundColor: loading ? '#999' : '#000',
        color: '#fff',
        fontWeight: 600,
        fontSize: 15,
        padding: '16px',
        borderRadius: 50,
        border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        transition: 'background-color 0.2s ease',
      }}
      onMouseEnter={(e) => {
        if (!loading) e.currentTarget.style.backgroundColor = '#0099FF';
      }}
      onMouseLeave={(e) => {
        if (!loading) e.currentTarget.style.backgroundColor = '#000';
      }}
    >
      {loading ? '이동 중…' : 'Google 계정으로 계속하기'}
    </button>
  );
}
