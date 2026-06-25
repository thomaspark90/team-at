'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const SHADOW = '0 1px 3px rgba(0,0,0,0.05)';

export default function LandingPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem('auth') === 'ok') router.replace('/studio');
    else setTimeout(() => inputRef.current?.focus(), 100);
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      sessionStorage.setItem('auth', 'ok');
      router.push('/studio');
    } else {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "Inter,'Pretendard Variable','Pretendard',sans-serif",
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          width: 340,
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          padding: '40px 36px',
          border: '1px solid #E5E5E5',
          boxShadow: SHADOW,
        }}
      >
        <p style={{ fontSize: 22, fontWeight: 700, color: '#000000', letterSpacing: '-0.5px', textAlign: 'center', marginBottom: 28 }}>
          team-at
        </p>

        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(false); }}
          placeholder="비밀번호"
          style={{
            width: '100%',
            backgroundColor: '#F5F5F5',
            border: `1px solid ${error ? '#C0392B' : '#E5E5E5'}`,
            borderRadius: 10,
            padding: '12px 14px',
            fontSize: 14,
            color: '#000000',
            outline: 'none',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            marginBottom: 8,
          }}
        />
        {error && (
          <p style={{ fontSize: 12, color: '#C0392B', marginBottom: 4 }}>비밀번호가 틀렸습니다</p>
        )}
        <div style={{ height: error ? 8 : 16 }} />

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            backgroundColor: loading ? '#999999' : '#000000',
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: 15,
            padding: '14px',
            borderRadius: 50,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '0.01em',
            transition: 'background-color 0.2s ease',
          }}
        >
          {loading ? '확인 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
}
